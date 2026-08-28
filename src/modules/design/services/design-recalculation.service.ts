/**
 * Estampado de versiones, marcado de obsolescencia y recálculo de diseños.
 *
 * Reevalúa las celdas de un sub-diseño con el mismo motor que usa el
 * navegador (`@rymel/formula-engine`), de modo que el número que produce el
 * servidor sea el mismo que vería el usuario en pantalla. Es la razón por la
 * que el motor se extrajo a un paquete sin dependencias de entorno: si aquí
 * se usara una reimplementación, el recálculo produciría valores que nadie
 * podría reproducir abriendo el diseño.
 *
 * Dos garantías gobiernan la escritura:
 *
 *   - **Las celdas de entrada manual no se tocan.** Solo se recalcula lo que
 *     empieza por `=`. Un recálculo que alterara un dato escrito por una
 *     persona sería destrucción de información, no un recálculo.
 *   - **Transaccional por sub-diseño.** Si uno falla queda exactamente como
 *     estaba y el lote sigue con los demás.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  evaluateSheet,
  type CustomFunctionCall,
  type CustomFunctionDefinition,
  type CustomFunctionResult,
} from '@rymel/formula-engine';
import { SubDesign } from '../entities/sub-design.entity';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import { DesignSubTypeFunction } from '../entities/design-subtype-function.entity';
import { SubDesignRecalculation } from '../entities/sub-design-recalculation.entity';
import { SecureFunctionEngineClient } from './secure-function-engine.client';
import {
  formulaCellRefs,
  invokedFunctionCodes,
  isFormulaCell,
  parseSubDesignData,
  serializeSubDesignData,
  type ParsedSubDesign,
} from './sub-design-cells';
import { parseVariables } from '../validation/design-function-rules';

/** Estampado: identificador de fórmula -> identificador de la versión usada. */
export type VersionStamp = Record<string, number>;

export interface CellChange {
  ref: string;
  formula: string;
  before: unknown;
  after: unknown;
}

export interface RecalculationOutcome {
  subDesignId: number;
  status: 'recalculado' | 'sin-cambios' | 'omitido' | 'fallido';
  changedCells: CellChange[];
  reason?: string;
}

export interface RecalculationReport {
  recalculated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  outcomes: RecalculationOutcome[];
}

@Injectable()
export class DesignRecalculationService {
  private readonly logger = new Logger(DesignRecalculationService.name);

  constructor(
    @InjectRepository(SubDesign)
    private readonly subDesignRepository: Repository<SubDesign>,
    @InjectRepository(DesignFunction)
    private readonly functionRepository: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly versionRepository: Repository<DesignFunctionVersion>,
    @InjectRepository(DesignSubTypeFunction)
    private readonly subTypeFunctionRepository: Repository<DesignSubTypeFunction>,
    @InjectRepository(SubDesignRecalculation)
    private readonly recalculationRepository: Repository<SubDesignRecalculation>,
    private readonly engine: SecureFunctionEngineClient,
    private readonly dataSource: DataSource,
  ) {}

  // --- Estampado y obsolescencia -----------------------------------------

  /** Guarda con qué versiones se calculó un sub-diseño. */
  async stamp(subDesignId: number, stamp: VersionStamp): Promise<void> {
    await this.subDesignRepository.update(
      { id: subDesignId },
      { functionVersions: JSON.stringify(stamp), isStale: false },
    );
  }

  /** Estampado guardado, o `null` si el sub-diseño es anterior al versionado. */
  readStamp(subDesign: SubDesign): VersionStamp | null {
    if (!subDesign.functionVersions) return null;
    try {
      return JSON.parse(subDesign.functionVersions) as VersionStamp;
    } catch {
      return null;
    }
  }

  /**
   * Marca como desactualizados los sub-diseños calculados con una versión
   * anterior de esta fórmula. **No toca sus valores.**
   *
   * Un sub-diseño sin estampado se considera de versión desconocida y por
   * tanto desactualizado, que es el caso de los 37 anteriores al cambio.
   */
  async markStaleForFunction(
    designFunctionId: number,
    currentVersionId: number,
  ): Promise<number> {
    const designFunction = await this.functionRepository.findOne({
      where: { id: designFunctionId },
    });
    if (!designFunction) return 0;

    const subDesigns = await this.subDesignRepository.find();
    const affected: number[] = [];

    for (const subDesign of subDesigns) {
      if (subDesign.isStale) continue;

      const parsed = parseSubDesignData(subDesign.data);
      if (!parsed) continue;
      if (
        invokedFunctionCodes(parsed.cells, [designFunction.code]).length === 0
      ) {
        continue;
      }

      const stamp = this.readStamp(subDesign);
      const usedVersion = stamp?.[String(designFunctionId)];
      if (usedVersion === currentVersionId) continue;

      affected.push(subDesign.id);
    }

    if (affected.length > 0) {
      await this.subDesignRepository.update(
        { id: In(affected) },
        { isStale: true },
      );
    }

    return affected.length;
  }

  /** Sub-diseños marcados como desactualizados. */
  listStale(): Promise<SubDesign[]> {
    return this.subDesignRepository.find({
      where: { isStale: true },
      relations: ['design'],
      order: { id: 'ASC' },
    });
  }

  // --- Recálculo ----------------------------------------------------------

  /**
   * @param dryRun simula sin escribir. Conviene usarlo antes de un lote
   *   grande: el recálculo reescribe números que alguien ya vio, y ver de
   *   antemano qué cambiaría es más barato que revertirlo después.
   */
  async recalculate(
    subDesignIds: readonly number[],
    triggeredBy?: string,
    dryRun = false,
  ): Promise<RecalculationReport> {
    const report: RecalculationReport = {
      recalculated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      outcomes: [],
    };

    for (const id of subDesignIds) {
      const outcome = await this.recalculateOne(id, triggeredBy, dryRun);
      report.outcomes.push(outcome);
      if (outcome.status === 'recalculado') report.recalculated += 1;
      else if (outcome.status === 'sin-cambios') report.unchanged += 1;
      else if (outcome.status === 'omitido') report.skipped += 1;
      else report.failed += 1;
    }

    return report;
  }

  private async recalculateOne(
    subDesignId: number,
    triggeredBy?: string,
    dryRun = false,
  ): Promise<RecalculationOutcome> {
    const subDesign = await this.subDesignRepository.findOne({
      where: { id: subDesignId },
      relations: ['design', 'design.designSubType'],
    });

    if (!subDesign) {
      return {
        subDesignId,
        status: 'fallido',
        changedCells: [],
        reason: 'no existe',
      };
    }

    const parsed = parseSubDesignData(subDesign.data);
    if (!parsed || formulaCellRefs(parsed.cells).length === 0) {
      // Sin fórmulas no hay nada que recalcular; deja de estar desactualizado
      // porque ninguna versión puede afectarle.
      if (!dryRun) {
        await this.subDesignRepository.update(
          { id: subDesignId },
          { isStale: false },
        );
      }
      return {
        subDesignId,
        status: 'omitido',
        changedCells: [],
        reason: 'sin fórmulas',
      };
    }

    const subTypeId = subDesign.design?.designSubType?.id;
    const available = await this.functionsForSubType(subTypeId);

    // Si la hoja invoca fórmulas que no están disponibles, no se recalcula.
    // Evaluar de todos modos las convertiría en `#ERROR`, es decir,
    // sustituiría un número bueno por un error: exactamente lo contrario de
    // lo que un recálculo debe hacer. En la base hay 14 sub-diseños cuyo
    // diseño no tiene subtipo asignado, y por tanto ninguna fórmula
    // resoluble; deben quedarse como están y reportarse.
    const invoked = invokedFunctionCodes(
      parsed.cells,
      await this.allFunctionCodes(),
    );
    const availableCodes = new Set(available.map((item) => item.code));
    const missing = invoked.filter((code) => !availableCodes.has(code));

    if (missing.length > 0) {
      return {
        subDesignId,
        status: 'fallido',
        changedCells: [],
        reason:
          subTypeId === undefined
            ? `el diseño no tiene subtipo asignado, así que no se pueden resolver: ${missing.join(', ')}`
            : `el subtipo ${subTypeId} no tiene asignadas: ${missing.join(', ')}`,
      };
    }

    try {
      const { changes, stamp } = await this.evaluate(parsed, available);

      // Una celda que tenía un valor y pasa a error significa que la
      // reevaluación no salió bien. El sub-diseño se deja intacto.
      const degraded = changes.filter(
        (change) => isErrorValue(change.after) && !isErrorValue(change.before),
      );
      if (degraded.length > 0) {
        return {
          subDesignId,
          status: 'fallido',
          changedCells: [],
          reason:
            `la reevaluación produjo errores donde antes había valores ` +
            `(${degraded.map((change) => change.ref).join(', ')}); no se modificó nada`,
        };
      }

      if (changes.length === 0) {
        if (!dryRun) {
          await this.subDesignRepository.update(
            { id: subDesignId },
            { functionVersions: JSON.stringify(stamp), isStale: false },
          );
        }
        return { subDesignId, status: 'sin-cambios', changedCells: [] };
      }

      if (dryRun) {
        return { subDesignId, status: 'recalculado', changedCells: changes };
      }

      // La escritura del sub-diseño y su registro van juntas: un valor nuevo
      // sin constancia de cuál era el anterior no se podría revertir.
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          SubDesign,
          { id: subDesignId },
          {
            data: serializeSubDesignData(parsed),
            functionVersions: JSON.stringify(stamp),
            isStale: false,
          },
        );
        await manager.save(
          manager.create(SubDesignRecalculation, {
            subDesignId,
            changedCells: JSON.stringify(changes),
            appliedVersions: JSON.stringify(stamp),
            changedCount: changes.length,
            triggeredBy,
          }),
        );
      });

      return { subDesignId, status: 'recalculado', changedCells: changes };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo recalcular el sub-diseño ${subDesignId}: ${reason}`,
      );
      return { subDesignId, status: 'fallido', changedCells: [], reason };
    }
  }

  /**
   * Reevalúa las celdas en memoria y devuelve qué cambió.
   *
   * `parsed.cells` se muta con los valores nuevos, pero solo en las celdas de
   * fórmula: el documento que se escribirá conserva todo lo demás intacto,
   * incluidos estilos, anchos y notas.
   */
  private async evaluate(
    parsed: ParsedSubDesign,
    available: ResolvedFunction[],
  ): Promise<{ changes: CellChange[]; stamp: VersionStamp }> {
    const definitions: CustomFunctionDefinition[] = available.map((item) => ({
      id: item.functionId,
      code: item.code,
      variables: parseVariables(item.variables),
    }));

    const byId = new Map(available.map((item) => [item.functionId, item]));
    const used = new Set<number>();

    const resolveCustomFunctions = async (
      calls: CustomFunctionCall[],
    ): Promise<CustomFunctionResult[]> =>
      Promise.all(
        calls.map(async (call) => {
          const target = byId.get(call.definition.id as number);
          if (!target) {
            return {
              error: `La fórmula ${call.definition.code} no está disponible`,
            };
          }
          used.add(target.functionId);
          try {
            const value = await this.engine.evaluate(
              target.expression,
              call.parameters,
              target.constants,
            );
            return { value };
          } catch (error) {
            return {
              error:
                error instanceof Error ? error.message : 'fallo al evaluar',
            };
          }
        }),
      );

    const cellsForEngine: Record<string, { formula?: string }> = {};
    for (const [ref, cell] of Object.entries(parsed.cells)) {
      if (cell === null || typeof cell !== 'object') continue;
      cellsForEngine[ref] =
        typeof cell.formula === 'string' ? { formula: cell.formula } : {};
    }

    const result = await evaluateSheet(cellsForEngine, {
      customFunctions: definitions,
      resolveCustomFunctions,
    });

    const changes: CellChange[] = [];
    for (const ref of Object.keys(parsed.cells)) {
      const cell = parsed.cells[ref];
      if (!isFormulaCell(cell)) continue;

      const next = result.values[ref];
      if (next === undefined) continue;
      if (Object.is(cell.computed, next)) continue;

      changes.push({
        ref,
        formula: cell.formula as string,
        before: cell.computed,
        after: next,
      });
      cell.computed = next;
    }

    const stamp: VersionStamp = {};
    for (const functionId of used) {
      const target = byId.get(functionId);
      if (target) stamp[String(functionId)] = target.versionId;
    }

    return { changes, stamp };
  }

  /** Códigos de todas las fórmulas activas, para detectar invocaciones. */
  private async allFunctionCodes(): Promise<string[]> {
    const all = await this.functionRepository.find({
      where: { deletedAt: IsNull() },
    });
    // Sin repetir: hay códigos duplicados en los datos (`CUBIC`, `QUADRATIC`),
    // y nombrarlos dos veces en un mensaje de error solo confunde.
    return [
      ...new Set(all.map((item) => item.code).filter((code) => Boolean(code))),
    ];
  }

  /** Fórmulas disponibles para un subtipo, con su versión vigente descifrada. */
  private async functionsForSubType(
    subTypeId: number | undefined,
  ): Promise<ResolvedFunction[]> {
    if (subTypeId === undefined) return [];

    const relations = await this.subTypeFunctionRepository.find({
      where: { designSubType: { id: subTypeId }, deletedAt: IsNull() },
      relations: ['designFunction'],
    });

    const resolved: ResolvedFunction[] = [];

    for (const relation of relations) {
      const designFunction = relation.designFunction;
      if (!designFunction || designFunction.deletedAt !== null) continue;

      const version = await this.versionRepository.findOne({
        where: { designFunctionId: designFunction.id, isCurrent: true },
      });
      if (!version) continue;

      resolved.push({
        functionId: designFunction.id,
        code: designFunction.code,
        versionId: version.id,
        expression: version.expression,
        variables: version.variables,
        constants: version.constants
          ? (JSON.parse(version.constants) as Record<string, number>)
          : {},
      });
    }

    return resolved;
  }

  /**
   * Aviso para el diseñador sobre un sub-diseño: si está desactualizado y qué
   * cambió el último recálculo, con las fórmulas responsables por su nombre.
   *
   * Devuelve los nombres y no los identificadores porque quien lo lee es una
   * persona abriendo su diseño, no un programa.
   */
  async recalculationNotice(subDesignId: number): Promise<{
    subDesignId: number;
    isStale: boolean;
    recalculatedAt?: Date;
    recalculationId?: number;
    changedCells: CellChange[];
    functions: Array<{ id: number; name: string; code: string; version: number }>;
  }> {
    const subDesign = await this.subDesignRepository.findOne({
      where: { id: subDesignId },
    });

    const notice = {
      subDesignId,
      isStale: subDesign?.isStale ?? false,
      changedCells: [] as CellChange[],
      functions: [] as Array<{
        id: number;
        name: string;
        code: string;
        version: number;
      }>,
    };

    const last = await this.lastRecalculation(subDesignId);
    if (!last) return notice;

    const changed = JSON.parse(last.changedCells) as CellChange[];
    const applied = JSON.parse(last.appliedVersions) as VersionStamp;

    const functions: Array<{
      id: number;
      name: string;
      code: string;
      version: number;
    }> = [];

    for (const [functionId, versionId] of Object.entries(applied)) {
      const designFunction = await this.functionRepository.findOne({
        where: { id: Number(functionId) },
      });
      const version = await this.versionRepository.findOne({
        where: { id: versionId },
      });
      if (!designFunction || !version) continue;
      functions.push({
        id: designFunction.id,
        name: designFunction.name,
        code: designFunction.code,
        version: version.version,
      });
    }

    return {
      ...notice,
      recalculatedAt: last.createdAt,
      recalculationId: last.id,
      changedCells: changed,
      functions,
    };
  }

  /** Último recálculo registrado de un sub-diseño. */
  lastRecalculation(
    subDesignId: number,
  ): Promise<SubDesignRecalculation | null> {
    return this.recalculationRepository.findOne({
      where: { subDesignId },
      order: { createdAt: 'DESC' },
    });
  }
}

/** Valores con los que el motor señala que una celda no pudo calcularse. */
const ERROR_VALUES = new Set(['#ERROR', '#CIRCULAR', '#ARGS']);

const isErrorValue = (value: unknown): boolean =>
  typeof value === 'string' && ERROR_VALUES.has(value);

interface ResolvedFunction {
  functionId: number;
  code: string;
  versionId: number;
  /** Expresión cifrada de la versión vigente. */
  expression: string;
  variables: string;
  constants: Record<string, number>;
}
