/**
 * Verificación del recálculo contra la base real.
 *
 * Recalcula un sub-diseño, comprueba celda por celda qué cambió y qué se
 * conservó, y **restaura el estado original al terminar**: esta verificación
 * no debe dejar huella en los datos.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-recalculation.ts [subDesignId]
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { SubDesignRecalculation } from '../../modules/design/entities/sub-design-recalculation.entity';
import { DesignRecalculationService } from '../../modules/design/services/design-recalculation.service';
import { SecureFunctionEngineClient } from '../../modules/design/services/secure-function-engine.client';
import { parseSubDesignData } from '../../modules/design/services/sub-design-cells';
import { DesignFunctionDependencyService } from '../../modules/design/services/design-function-dependency.service';
import { DesignFunctionDependency } from '../../modules/design/entities/design-function-dependency.entity';

dotenvConfig({ path: '.env' });

let passed = 0;
let failed = 0;
const check = (description: string, condition: boolean, detail = ''): void => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${description}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${description} ${detail}`);
  }
};

async function main(): Promise<void> {
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

  const subDesigns = dataSource.getRepository(SubDesign);
  const recalculations = dataSource.getRepository(SubDesignRecalculation);

  const service = new DesignRecalculationService(
    subDesigns,
    dataSource.getRepository(DesignFunction),
    dataSource.getRepository(DesignFunctionVersion),
    dataSource.getRepository(DesignSubTypeFunction),
    recalculations,
    new SecureFunctionEngineClient(new HttpService(axios.create())),
    dataSource,
    new DesignFunctionDependencyService(
      dataSource.getRepository(DesignFunction),
      dataSource.getRepository(DesignFunctionVersion),
      dataSource.getRepository(DesignFunctionDependency),
    ),
  );

  const targetId = Number(process.argv[2] ?? 11);
  const before = await subDesigns.findOne({ where: { id: targetId } });
  if (!before) throw new Error(`No existe el sub-diseño ${targetId}`);

  // Estado original, para restaurarlo al final pase lo que pase.
  const original = {
    data: before.data,
    functionVersions: before.functionVersions,
    isStale: before.isStale,
  };

  const parsedBefore = parseSubDesignData(before.data)!;
  const cellsBefore = JSON.parse(JSON.stringify(parsedBefore.cells)) as Record<
    string,
    { formula?: string; value?: unknown; computed?: unknown }
  >;

  console.log(`\nsub-diseño ${targetId} "${before.name}" — antes:`);
  for (const [ref, cell] of Object.entries(cellsBefore)) {
    if (typeof cell?.formula === 'string' && cell.formula.startsWith('=')) {
      console.log(
        `   ${ref}: ${cell.formula} -> ${JSON.stringify(cell.computed)}`,
      );
    }
  }

  try {
    const report = await service.recalculate([targetId], 'verificación');
    const outcome = report.outcomes[0];

    console.log(
      `\nresultado: ${outcome.status}, ${outcome.changedCells.length} celda(s) cambiada(s)` +
        (outcome.reason ? `\n   motivo: ${outcome.reason}` : ''),
    );

    if (outcome.status === 'fallido') {
      const untouched = await subDesigns.findOne({ where: { id: targetId } });
      check(
        'un fallo deja el sub-diseño exactamente como estaba',
        untouched!.data === original.data &&
          untouched!.isStale === original.isStale &&
          (untouched!.functionVersions ?? null) ===
            (original.functionVersions ?? null),
      );
      console.log(`\n${passed} comprobaciones correctas, ${failed} fallidas`);
      await recalculations.delete({ subDesignId: targetId });
      await dataSource.destroy();
      process.exit(failed === 0 ? 0 : 1);
    }
    for (const change of outcome.changedCells) {
      console.log(
        `   ${change.ref}: ${change.formula}  ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`,
      );
    }

    const after = await subDesigns.findOne({ where: { id: targetId } });
    const parsedAfter = parseSubDesignData(after!.data)!;

    check(
      'el sub-diseño deja de estar desactualizado',
      after!.isStale === false,
    );
    check(
      'queda estampado con las versiones usadas',
      (after!.functionVersions ?? '') !== '',
      String(after!.functionVersions),
    );

    // Lo esencial: las celdas de entrada manual no se tocan.
    let manualIntact = true;
    let manualCount = 0;
    for (const [ref, cellBefore] of Object.entries(cellsBefore)) {
      const isFormula =
        typeof cellBefore?.formula === 'string' &&
        cellBefore.formula.startsWith('=');
      if (isFormula) continue;
      manualCount += 1;
      const cellAfter = parsedAfter.cells[ref];
      if (JSON.stringify(cellAfter) !== JSON.stringify(cellBefore)) {
        manualIntact = false;
        console.log(`   celda manual alterada: ${ref}`);
      }
    }
    check(
      `las ${manualCount} celdas de entrada manual quedan intactas`,
      manualIntact,
    );

    // Las fórmulas tampoco se reescriben: solo cambia el valor calculado.
    let formulasIntact = true;
    for (const [ref, cellBefore] of Object.entries(cellsBefore)) {
      const cellAfter = parsedAfter.cells[ref];
      if (cellAfter?.formula !== cellBefore?.formula) {
        formulasIntact = false;
        console.log(`   fórmula alterada en ${ref}`);
      }
    }
    check('ninguna fórmula se reescribe', formulasIntact);

    check(
      'la forma del documento se conserva',
      parsedAfter.wrapped === parsedBefore.wrapped,
    );

    const registro = await service.lastRecalculation(targetId);
    // Solo se registra cuando algo cambió: un recálculo sin cambios no tiene
    // nada que contar y no debe ensuciar la bitácora.
    check(
      outcome.status === 'recalculado'
        ? 'queda registro del recálculo'
        : 'sin cambios, no se escribe registro',
      outcome.status === 'recalculado' ? registro !== null : registro === null,
    );
    if (registro && outcome.status === 'recalculado') {
      const changed = JSON.parse(registro.changedCells) as unknown[];
      check(
        'con el valor anterior y el nuevo de cada celda',
        changed.length === outcome.changedCells.length &&
          registro.changedCount === outcome.changedCells.length,
        `${changed.length} vs ${outcome.changedCells.length}`,
      );
      check(
        'y con las versiones aplicadas',
        registro.appliedVersions !== '{}',
        registro.appliedVersions,
      );
    }

    // Segundo recálculo: ya no debería cambiar nada.
    const second = await service.recalculate([targetId], 'verificación');
    check(
      'un segundo recálculo no cambia nada',
      second.outcomes[0].status === 'sin-cambios',
      second.outcomes[0].status,
    );
  } finally {
    await recalculations.delete({ subDesignId: targetId });
    await subDesigns.update({ id: targetId }, original);
    const restored = await subDesigns.findOne({ where: { id: targetId } });
    console.log(
      `\n(estado original restaurado: data idéntica = ${restored!.data === original.data}, isStale = ${restored!.isStale})`,
    );
    await dataSource.destroy();
  }

  console.log(`\n${passed} comprobaciones correctas, ${failed} fallidas`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
