/**
 * Verificación en sombra: la puerta de corte antes de que project-front
 * sustituya su evaluador.
 *
 * project-front evalúa hoy cada fórmula con `Function('"use strict"; return
 * (' + expression + ')')()`, precedido de 26 pasadas de `replace`. El motor
 * compartido analiza la fórmula con un parser estricto. Son dos semánticas
 * distintas, y alguna hoja guardada puede depender de la permisividad de la
 * primera.
 *
 * Este script reevalúa **todas** las celdas con fórmula de **todos** los
 * sub-diseños y contrasta el resultado contra el `computed` almacenado. Cada
 * divergencia se clasifica; la regla de corte es:
 *
 *   - Una celda **sin** función personalizada que diverja es un **defecto del
 *     motor**: `=A1*2` tiene que dar lo mismo en los dos evaluadores, sin
 *     excepción. Bloquea la conmutación.
 *   - Una celda **con** función personalizada puede diverger legítimamente,
 *     porque su definición cambió desde que se calculó. Se clasifica y se
 *     documenta.
 *   - Lo que no encaje en ninguna categoría queda `sin-clasificar` y también
 *     bloquea.
 *
 * No escribe nada en la base. Genera un informe en disco como evidencia.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/shadow-verification.ts [ruta-del-informe]
 */

import { config as dotenvConfig } from 'dotenv';
import { writeFileSync } from 'fs';
import { DataSource, IsNull } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import {
  evaluateSheet,
  type CustomFunctionCall,
  type CustomFunctionDefinition,
  type CustomFunctionResult,
} from '@rymel/formula-engine';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { SecureFunctionEngineClient } from '../../modules/design/services/secure-function-engine.client';
import {
  isFormulaCell,
  parseSubDesignData,
  type StoredCells,
} from '../../modules/design/services/sub-design-cells';
import { parseVariables } from '../../modules/design/validation/design-function-rules';

dotenvConfig({ path: '.env' });

type Classification =
  | 'funcion-no-resoluble'
  | 'argumento-no-numerico'
  | 'valor-previamente-erroneo'
  | 'deriva-de-version'
  | 'defecto-del-motor'
  | 'sin-clasificar';

interface Divergence {
  subDesignId: number;
  subDesignName: string;
  ref: string;
  formula: string;
  stored: unknown;
  recomputed: unknown;
  classification: Classification;
  note: string;
}

const ERROR_VALUES = new Set(['#ERROR', '#CIRCULAR', '#ARGS']);
const isErrorValue = (value: unknown): boolean =>
  typeof value === 'string' && ERROR_VALUES.has(value);

/** Igualdad tolerante con la representación de los números en coma flotante. */
const equivalent = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-12);
  }
  // El diseñador guarda a veces el número como texto.
  if (typeof a === 'string' && typeof b === 'number' && a.trim() !== '') {
    return Number(a) === b;
  }
  if (typeof b === 'string' && typeof a === 'number' && b.trim() !== '') {
    return Number(b) === a;
  }
  return false;
};

/** Códigos de función personalizada que invoca una fórmula concreta. */
const codesInFormula = (formula: string, codes: readonly string[]): string[] =>
  codes.filter((code) =>
    new RegExp(`(?<![A-Za-z0-9_])${code}\\s*\\(`).test(formula),
  );

/** Referencias de celda que aparecen como argumentos de la fórmula. */
const referencedCells = (formula: string): string[] => [
  ...new Set(formula.match(/(?<![A-Za-z0-9_])[A-Z]+\d+/g) ?? []),
];

interface ResolvedFunction {
  functionId: number;
  code: string;
  expression: string;
  variables: string;
  constants: Record<string, number>;
}

async function main(): Promise<void> {
  const reportPath = process.argv[2] ?? 'shadow-verification-report.md';

  const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: { encrypt: false, trustServerCertificate: true },
    entities: ['src/**/*.entity.ts'],
  });
  await dataSource.initialize();

  const engine = new SecureFunctionEngineClient(
    new HttpService(axios.create()),
  );
  const subDesignRepository = dataSource.getRepository(SubDesign);
  const functionRepository = dataSource.getRepository(DesignFunction);
  const versionRepository = dataSource.getRepository(DesignFunctionVersion);
  const relationRepository = dataSource.getRepository(DesignSubTypeFunction);

  const allFunctions = await functionRepository.find({
    where: { deletedAt: IsNull() },
  });
  const allCodes = [...new Set(allFunctions.map((item) => item.code))];

  const functionsBySubType = new Map<number, ResolvedFunction[]>();
  const resolveForSubType = async (
    subTypeId: number,
  ): Promise<ResolvedFunction[]> => {
    const cached = functionsBySubType.get(subTypeId);
    if (cached) return cached;

    const relations = await relationRepository.find({
      where: { designSubType: { id: subTypeId }, deletedAt: IsNull() },
      relations: ['designFunction'],
    });

    const resolved: ResolvedFunction[] = [];
    for (const relation of relations) {
      const designFunction = relation.designFunction;
      if (!designFunction || designFunction.deletedAt !== null) continue;
      const version = await versionRepository.findOne({
        where: { designFunctionId: designFunction.id, isCurrent: true },
      });
      if (!version) continue;
      resolved.push({
        functionId: designFunction.id,
        code: designFunction.code,
        expression: version.expression,
        variables: version.variables,
        constants: version.constants
          ? (JSON.parse(version.constants) as Record<string, number>)
          : {},
      });
    }

    functionsBySubType.set(subTypeId, resolved);
    return resolved;
  };

  const subDesigns = await subDesignRepository.find({
    relations: ['design', 'design.designSubType'],
    order: { id: 'ASC' },
  });

  let comparedCells = 0;
  let matching = 0;
  const divergences: Divergence[] = [];
  let sheetsWithFormulas = 0;

  for (const subDesign of subDesigns) {
    const parsed = parseSubDesignData(subDesign.data);
    if (!parsed) continue;

    const cells: StoredCells = parsed.cells;
    const formulaRefs = Object.keys(cells).filter((ref) =>
      isFormulaCell(cells[ref]),
    );
    if (formulaRefs.length === 0) continue;
    sheetsWithFormulas += 1;

    const subTypeId = subDesign.design?.designSubType?.id;
    const available =
      subTypeId === undefined ? [] : await resolveForSubType(subTypeId);
    const availableCodes = new Set(available.map((item) => item.code));
    const byId = new Map(available.map((item) => [item.functionId, item]));

    const definitions: CustomFunctionDefinition[] = available.map((item) => ({
      id: item.functionId,
      code: item.code,
      variables: parseVariables(item.variables),
    }));

    const resolveCustomFunctions = async (
      calls: CustomFunctionCall[],
    ): Promise<CustomFunctionResult[]> =>
      Promise.all(
        calls.map(async (call) => {
          const target = byId.get(call.definition.id as number);
          if (!target) return { error: 'no disponible' };
          try {
            return {
              value: await engine.evaluate(
                target.expression,
                call.parameters,
                target.constants,
              ),
            };
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : 'fallo',
            };
          }
        }),
      );

    const cellsForEngine: Record<string, { formula?: string }> = {};
    for (const [ref, cell] of Object.entries(cells)) {
      if (cell === null || typeof cell !== 'object') continue;
      cellsForEngine[ref] =
        typeof cell.formula === 'string' ? { formula: cell.formula } : {};
    }

    const result = await evaluateSheet(cellsForEngine, {
      customFunctions: definitions,
      resolveCustomFunctions,
    });

    for (const ref of formulaRefs) {
      const cell = cells[ref];
      const formula = cell.formula as string;
      const stored = cell.computed;
      const recomputed = result.values[ref];

      comparedCells += 1;
      if (equivalent(stored, recomputed)) {
        matching += 1;
        continue;
      }

      const invoked = codesInFormula(formula, allCodes);
      const missing = invoked.filter((code) => !availableCodes.has(code));

      let classification: Classification;
      let note: string;

      if (invoked.length === 0) {
        // Aritmética pura: los dos evaluadores tienen que coincidir.
        classification = 'defecto-del-motor';
        note =
          'fórmula sin función personalizada; ambos evaluadores deberían coincidir';
      } else if (missing.length > 0) {
        classification = 'funcion-no-resoluble';
        note =
          subTypeId === undefined
            ? 'el diseño no tiene subtipo, así que la fórmula no se puede resolver'
            : `el subtipo ${subTypeId} no tiene asignada ${missing.join(', ')}`;
      } else if (isErrorValue(stored) && !isErrorValue(recomputed)) {
        classification = 'valor-previamente-erroneo';
        note =
          'el valor almacenado ya era un error; el motor nuevo sí lo resuelve';
      } else if (isErrorValue(recomputed)) {
        const nonNumeric = referencedCells(formula).filter((argRef) => {
          const value = cells[argRef]?.computed;
          return (
            value !== undefined &&
            typeof value !== 'number' &&
            !(
              typeof value === 'string' &&
              value.trim() !== '' &&
              !Number.isNaN(Number(value))
            )
          );
        });
        if (nonNumeric.length > 0) {
          classification = 'argumento-no-numerico';
          note =
            `la fórmula pasa ${nonNumeric.join(', ')} como argumento y su ` +
            `contenido no es numérico; el evaluador anterior lo convertía en 0`;
        } else {
          classification = 'sin-clasificar';
          note = 'el motor nuevo da error y no se identificó la causa';
        }
      } else if (typeof recomputed === 'number' && typeof stored === 'number') {
        classification = 'deriva-de-version';
        note =
          'ambos valores son válidos: el almacenado se calculó con una ' +
          'definición anterior de la fórmula';
      } else {
        classification = 'sin-clasificar';
        note = 'divergencia no reconocida';
      }

      divergences.push({
        subDesignId: subDesign.id,
        subDesignName: subDesign.name,
        ref,
        formula,
        stored,
        recomputed,
        classification,
        note,
      });
    }
  }

  const byClass = new Map<Classification, Divergence[]>();
  for (const divergence of divergences) {
    byClass.set(divergence.classification, [
      ...(byClass.get(divergence.classification) ?? []),
      divergence,
    ]);
  }

  const blocking =
    (byClass.get('defecto-del-motor')?.length ?? 0) +
    (byClass.get('sin-clasificar')?.length ?? 0);

  // --- Informe -----------------------------------------------------------

  const lines: string[] = [];
  lines.push('# Verificación en sombra del motor de fórmulas');
  lines.push('');
  lines.push(`Ejecutada el ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Resumen');
  lines.push('');
  lines.push(
    `- Sub-diseños con fórmulas: **${sheetsWithFormulas}** de ${subDesigns.length}`,
  );
  lines.push(`- Celdas comparadas: **${comparedCells}**`);
  lines.push(`- Coincidentes: **${matching}**`);
  lines.push(`- Divergentes: **${divergences.length}**`);
  lines.push('');
  lines.push('| clasificación | celdas | ¿bloquea? |');
  lines.push('|---|---|---|');
  for (const [classification, items] of byClass) {
    const blocks =
      classification === 'defecto-del-motor' ||
      classification === 'sin-clasificar';
    lines.push(
      `| ${classification} | ${items.length} | ${blocks ? '**sí**' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push(
    blocking === 0
      ? '## Resultado: **puerta abierta**\n\nNinguna divergencia sin clasificar y ningún defecto del motor. project-front puede adoptar el motor compartido.'
      : `## Resultado: **puerta cerrada**\n\n${blocking} divergencia(s) bloquean la conmutación.`,
  );
  lines.push('');
  lines.push('## Detalle de las divergencias');
  for (const [classification, items] of byClass) {
    lines.push('');
    lines.push(`### ${classification} (${items.length})`);
    lines.push('');
    lines.push(`> ${items[0].note}`);
    lines.push('');
    lines.push('| sub-diseño | celda | fórmula | almacenado | recalculado |');
    lines.push('|---|---|---|---|---|');
    for (const item of items) {
      lines.push(
        `| ${item.subDesignId} ${item.subDesignName} | ${item.ref} | \`${item.formula}\` | ${JSON.stringify(item.stored)} | ${JSON.stringify(item.recomputed)} |`,
      );
    }
  }
  lines.push('');

  writeFileSync(reportPath, lines.join('\n'));

  console.log(
    `celdas comparadas: ${comparedCells} | coincidentes: ${matching} | divergentes: ${divergences.length}`,
  );
  for (const [classification, items] of byClass) {
    console.log(`   ${classification}: ${items.length}`);
  }
  console.log(
    blocking === 0
      ? '\nPUERTA ABIERTA: sin defectos del motor ni divergencias sin clasificar'
      : `\nPUERTA CERRADA: ${blocking} divergencia(s) bloquean`,
  );
  console.log(`informe: ${reportPath}`);

  await dataSource.destroy();
  process.exit(blocking === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
