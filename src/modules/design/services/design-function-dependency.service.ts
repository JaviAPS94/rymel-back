/**
 * Dependencias entre fórmulas: qué invoca cada una y quién la invoca.
 *
 * El grafo se arma siempre con las **versiones vigentes**, porque es con ellas
 * con las que se evalúa. El texto de las expresiones no pasa por aquí: los
 * códigos invocados los devolvió el motor cifrado al validar cada versión.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import { DesignFunctionDependency } from '../entities/design-function-dependency.entity';
import { parseConstants } from '../dtos/design-function-output.dto';
import {
  parseVariables,
  ValidationError,
} from '../validation/design-function-rules';
import {
  findCycleThrough,
  invert,
  longestChainFrom,
  MAX_NESTING_DEPTH,
  reachableFrom,
  type InvocationGraph,
} from '../validation/function-composition';
import type { TemplateType } from '../../../common/enums';

/** Una invocación a otra fórmula dentro de una expresión, tal como la devuelve el motor. */
export interface FormulaCall {
  name: string;
  argCount: number;
}

/** Una fórmula del cierre, lista para enviarla al motor. */
export interface ResolvedDependency {
  functionId: number;
  code: string;
  versionId: number;
  encryptedFunction: string;
  variables: string[];
  constants: Record<string, number>;
}

@Injectable()
export class DesignFunctionDependencyService {
  constructor(
    @InjectRepository(DesignFunction)
    private readonly functionRepository: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly versionRepository: Repository<DesignFunctionVersion>,
    @InjectRepository(DesignFunctionDependency)
    private readonly dependencyRepository: Repository<DesignFunctionDependency>,
  ) {}

  /** De cada fórmula activa a las que invoca su versión vigente. */
  async currentGraph(): Promise<Map<number, number[]>> {
    const rows: { callerId: number; calleeId: number }[] =
      await this.dependencyRepository
        .createQueryBuilder('dependency')
        .innerJoin('dependency.version', 'version')
        .innerJoin('version.designFunction', 'caller')
        .select('version.designFunctionId', 'callerId')
        .addSelect('dependency.dependsOnFunctionId', 'calleeId')
        .where('version.isCurrent = 1')
        .andWhere('caller.deletedAt IS NULL')
        .getRawMany();

    const graph = new Map<number, number[]>();
    for (const { callerId, calleeId } of rows) {
      graph.set(callerId, [...(graph.get(callerId) ?? []), calleeId]);
    }
    return graph;
  }

  /**
   * Comprueba que una versión nueva pueda invocar lo que invoca, y devuelve
   * los ids de las fórmulas de las que depende.
   *
   * Rechaza un código que no es una fórmula activa del mismo tipo, una
   * aridad distinta de la de sus variables, un ciclo —contando las versiones
   * vigentes de las demás— y un anidamiento de más de cinco niveles.
   */
  async checkComposition(input: {
    /** Ausente en una fórmula que aún no existe. */
    functionId?: number;
    code?: string;
    type: TemplateType;
    calls: readonly FormulaCall[];
  }): Promise<number[]> {
    if (input.calls.length === 0) return [];

    const names = [...new Set(input.calls.map((call) => call.name))];
    if (input.code !== undefined && names.includes(input.code)) {
      throw new ValidationError(
        `Referencia circular entre fórmulas: ${input.code} → ${input.code}`,
      );
    }

    const targets = await this.functionRepository.find({
      where: { code: In(names), type: input.type, deletedAt: IsNull() },
    });
    const byCode = new Map(targets.map((target) => [target.code, target]));

    const missing = names.filter((name) => !byCode.has(name));
    if (missing.length > 0) {
      throw new ValidationError(
        `${missing.map((name) => `"${name}"`).join(', ')} no ${
          missing.length === 1 ? 'es una fórmula activa' : 'son fórmulas activas'
        } de tipo ${input.type}`,
      );
    }

    const versions = await this.versionRepository.find({
      where: {
        designFunctionId: In(targets.map((target) => target.id)),
        isCurrent: true,
      },
    });
    const variablesOf = new Map(
      versions.map((version) => [version.designFunctionId, parseVariables(version.variables)]),
    );
    for (const call of input.calls) {
      const target = byCode.get(call.name)!;
      const expected = variablesOf.get(target.id)?.length ?? 0;
      if (call.argCount !== expected) {
        throw new ValidationError(
          `${call.name} espera ${expected} argumento(s) y recibe ${call.argCount}`,
        );
      }
    }

    const dependsOn = targets.map((target) => target.id);

    // El grafo tal como quedaría con esta versión vigente. Una fórmula nueva
    // todavía no tiene id: se le da uno que no choca con ninguno real.
    const self = input.functionId ?? -1;
    const graph = await this.currentGraph();
    graph.set(self, dependsOn);

    const codes = await this.codesOf(graph);
    const label = (id: number) =>
      id === self ? (input.code ?? 'la fórmula') : (codes.get(id) ?? `#${id}`);

    const cycle = findCycleThrough(graph, self);
    if (cycle) {
      throw new ValidationError(
        `Referencia circular entre fórmulas: ${cycle.map(label).join(' → ')}`,
      );
    }

    // Anidar esta fórmula alarga también la cadena de quien ya la invoca.
    const deepest = this.deepestChainThrough(graph, self);
    if (deepest.length - 1 > MAX_NESTING_DEPTH) {
      throw new ValidationError(
        `Las fórmulas se anidan más de ${MAX_NESTING_DEPTH} niveles: ${deepest
          .map(label)
          .join(' → ')}`,
      );
    }

    return dependsOn;
  }

  /** La cadena más larga que pasa por `node`: desde quien más arriba lo invoca hasta lo más hondo que invoca. */
  private deepestChainThrough(graph: InvocationGraph, node: number): number[] {
    const callers = invert(graph);
    const upward = (current: number): number[] => {
      let best: number[] = [];
      for (const caller of callers.get(current) ?? []) {
        const chain = [...upward(caller), caller];
        if (chain.length > best.length) best = chain;
      }
      return best;
    };
    return [...upward(node), node, ...longestChainFrom(graph, node)];
  }

  private async codesOf(graph: InvocationGraph): Promise<Map<number, string>> {
    const ids = new Set<number>();
    for (const [caller, callees] of graph) {
      ids.add(caller);
      callees.forEach((callee) => ids.add(callee));
    }
    const functions = await this.functionRepository.find({
      where: { id: In([...ids].filter((id) => id > 0)) },
    });
    return new Map(functions.map((item) => [item.id, item.code]));
  }

  /**
   * El cierre de lo que invoca una fórmula, con la versión vigente de cada
   * una: lo que el motor necesita para evaluarla.
   */
  async closure(functionId: number): Promise<ResolvedDependency[]> {
    return this.resolve(reachableFrom(await this.currentGraph(), functionId));
  }

  /** Cada fórmula con su versión vigente, lista para el motor. */
  private async resolve(ids: number[]): Promise<ResolvedDependency[]> {
    if (ids.length === 0) return [];

    const [functions, versions] = await Promise.all([
      this.functionRepository.find({ where: { id: In(ids) } }),
      this.versionRepository.find({
        where: { designFunctionId: In(ids), isCurrent: true },
      }),
    ]);
    const codeOf = new Map(functions.map((item) => [item.id, item.code]));

    return versions.map((version) => ({
      functionId: version.designFunctionId,
      code: codeOf.get(version.designFunctionId) ?? '',
      versionId: version.id,
      encryptedFunction: version.expression,
      variables: parseVariables(version.variables),
      constants: parseConstants(version.constants),
    }));
  }

  /**
   * Lo que el motor necesita para evaluar una expresión que aún no es una
   * versión —la del probador—: las fórmulas que invoca por código y todo lo
   * que éstas invocan.
   */
  async forCodes(
    codes: readonly string[],
    type?: TemplateType,
  ): Promise<ResolvedDependency[]> {
    if (codes.length === 0) return [];
    const invoked = await this.functionRepository.find({
      where: {
        code: In([...new Set(codes)]),
        deletedAt: IsNull(),
        ...(type === undefined ? {} : { type }),
      },
    });
    const graph = await this.currentGraph();
    const ids = new Set<number>();
    for (const item of invoked) {
      ids.add(item.id);
      reachableFrom(graph, item.id).forEach((id) => ids.add(id));
    }
    return this.resolve([...ids]);
  }

  /** Las fórmulas que invoca la versión vigente de ésta, sin bajar más. */
  async directCallees(functionId: number): Promise<number[]> {
    return (await this.currentGraph()).get(functionId) ?? [];
  }

  /** Las que invocan a ésta con su versión vigente, sin subir más. */
  async directCallers(functionId: number): Promise<number[]> {
    return invert(await this.currentGraph()).get(functionId) ?? [];
  }

  /** Las fórmulas que invocan a ésta, directa o indirectamente. */
  async callersOf(functionId: number): Promise<number[]> {
    return reachableFrom(invert(await this.currentGraph()), functionId);
  }

  /** Lo que el motor recibe en `dependencies`: por código. */
  static toEngine(
    closure: readonly ResolvedDependency[],
  ): Record<string, { encryptedFunction: string; variables: string[]; constants: Record<string, number> }> {
    return Object.fromEntries(
      closure.map((dependency) => [
        dependency.code,
        {
          encryptedFunction: dependency.encryptedFunction,
          variables: dependency.variables,
          constants: dependency.constants,
        },
      ]),
    );
  }
}
