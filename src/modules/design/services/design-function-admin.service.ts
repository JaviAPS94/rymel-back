/**
 * Administración de fórmulas de diseño.
 *
 * Reúne lo que el administrador necesita para gestionar el catálogo: listar,
 * ver en claro para editar, publicar versiones, dar de baja, asignar a
 * subtipos y medir el impacto de un cambio antes de hacerlo.
 *
 * La medición de impacto es la parte que no es obvia. Un cambio de fórmula no
 * rompe nada visible: sigue evaluando y devuelve otro número. Por eso, antes
 * de publicar, aquí se cuenta cuántos sub-diseños tienen celdas que la
 * invocan, para que la decisión se tome sabiendo a cuántos alcanza.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import { DesignSubTypeFunction } from '../entities/design-subtype-function.entity';
import { DesignSubType } from '../entities/design-subtype.entity';
import { SubDesign } from '../entities/sub-design.entity';
import {
  DesignFunctionVersionService,
  type ActingUser,
} from './design-function-version.service';
import { SecureFunctionEngineClient } from './secure-function-engine.client';
import {
  findCodeCollisions,
  parseVariables,
  validateCode,
  ValidationError,
  type ExistingCode,
} from '../validation/design-function-rules';
import {
  type CreateDesignFunctionAdminDto,
  DesignFunctionDetailDto,
  DesignFunctionImpactDto,
  DesignFunctionListItemDto,
  type ListDesignFunctionsDto,
  PaginatedDesignFunctionsDto,
  type TestExpressionDto,
  TestExpressionResultDto,
  type UpdateDesignFunctionDto,
  type FunctionSummaryDto,
} from '../dtos/design-function-admin.dto';
import { TemplateType } from '../../../common/enums';
import { DesignFunctionDependencyService } from './design-function-dependency.service';
import { parseConstants } from '../dtos/design-function-output.dto';

@Injectable()
export class DesignFunctionAdminService {
  constructor(
    @InjectRepository(DesignFunction)
    private readonly functionRepository: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly versionRepository: Repository<DesignFunctionVersion>,
    @InjectRepository(DesignSubTypeFunction)
    private readonly subTypeFunctionRepository: Repository<DesignSubTypeFunction>,
    @InjectRepository(DesignSubType)
    private readonly subTypeRepository: Repository<DesignSubType>,
    @InjectRepository(SubDesign)
    private readonly subDesignRepository: Repository<SubDesign>,
    private readonly versions: DesignFunctionVersionService,
    private readonly engine: SecureFunctionEngineClient,
    private readonly dependencies: DesignFunctionDependencyService,
  ) {}

  async list(
    query: ListDesignFunctionsDto,
  ): Promise<PaginatedDesignFunctionsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const builder = this.functionRepository
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.versions', 'v')
      .leftJoin('f.designSubTypeFunctions', 'stf')
      .orderBy('f.name', 'ASC');

    if (query.includeDeleted !== true) {
      builder.andWhere('f.deletedAt IS NULL');
    }
    if (query.type) {
      builder.andWhere('f.type = :type', { type: query.type });
    }
    if (query.search) {
      builder.andWhere('(f.name LIKE :search OR f.code LIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.designSubTypeId) {
      builder.andWhere('stf.design_subtype_id = :subTypeId', {
        subTypeId: query.designSubTypeId,
      });
    }

    const all = await builder.getMany();
    const total = all.length;
    const pageItems = all.slice((page - 1) * limit, page * limit);

    const active = all.filter((item) => item.deletedAt === null);
    const collisions = findCodeCollisions(active.map(toExistingCode));

    const conflictById = new Map<number, string>();
    for (const collision of collisions) {
      conflictById.set(collision.a.id, collision.reason);
      conflictById.set(collision.b.id, collision.reason);
    }

    const subTypeCounts = await this.countSubTypesByFunction(
      pageItems.map((item) => item.id),
    );

    const items = pageItems.map((designFunction) => {
      const current = designFunction.versions?.find((v) => v.isCurrent);
      const item = new DesignFunctionListItemDto();
      item.id = designFunction.id;
      item.name = designFunction.name;
      item.code = designFunction.code;
      item.type = designFunction.type;
      item.description = designFunction.description;
      item.version = current?.version ?? 0;
      item.variables = current?.variables ?? '';
      item.versionCount = designFunction.versions?.length ?? 0;
      item.subTypeCount = subTypeCounts.get(designFunction.id) ?? 0;
      item.deleted = designFunction.deletedAt !== null;
      item.codeConflict = conflictById.get(designFunction.id);
      return item;
    });

    const result = new PaginatedDesignFunctionsDto();
    result.items = items;
    result.total = total;
    result.page = page;
    result.limit = limit;
    result.codeConflicts = collisions.map(
      (collision) =>
        `"${collision.a.name}" (#${collision.a.id}) y "${collision.b.name}" (#${collision.b.id}): ${collision.reason}`,
    );
    return result;
  }

  /**
   * Detalle para editar, con la expresión en claro.
   *
   * Si el motor cifrado no responde, se devuelve el resto igualmente y se
   * explica por qué falta la expresión: poder corregir el nombre o la
   * descripción de una fórmula no debería depender de que un servicio
   * externo esté disponible.
   */
  async detail(id: number, user: ActingUser): Promise<DesignFunctionDetailDto> {
    const designFunction = await this.requireFunction(id);
    const current = await this.versions.currentVersion(id);

    const detail = new DesignFunctionDetailDto();
    detail.id = designFunction.id;
    detail.name = designFunction.name;
    detail.code = designFunction.code;
    detail.type = designFunction.type;
    detail.description = designFunction.description;
    detail.variables = current.variables;
    detail.constants = parseConstants(current.constants);
    detail.version = current.version;
    detail.versionId = current.id;
    detail.designSubTypeIds = await this.assignedSubTypeIds(id);
    detail.invokes = await this.summaries(await this.dependencies.directCallees(id));
    detail.invokedBy = await this.summaries(await this.dependencies.directCallers(id));

    try {
      detail.expression = await this.versions.revealExpression(id, user);
    } catch (error) {
      detail.expressionUnavailable =
        error instanceof Error
          ? error.message
          : 'No se pudo recuperar la expresión';
    }

    return detail;
  }

  async create(
    dto: CreateDesignFunctionAdminDto,
  ): Promise<{ id: number; warnings: string[] }> {
    const type = dto.type ?? TemplateType.DESIGN;
    validateCode(dto.code, type, await this.existingCodes());

    const duplicateName = await this.functionRepository.findOne({
      where: { name: dto.name },
    });
    if (duplicateName) {
      throw new ValidationError(`Ya existe una fórmula llamada "${dto.name}"`);
    }

    const designFunction = await this.functionRepository.save(
      this.functionRepository.create({
        name: dto.name,
        code: dto.code,
        description: dto.description,
        type,
      }),
    );

    try {
      const published = await this.versions.publish({
        designFunctionId: designFunction.id,
        expression: dto.expression,
        variables: dto.variables,
        constants: dto.constants ?? {},
      });
      return {
        id: designFunction.id,
        warnings: published.warnings.map((warning) => warning.message),
      };
    } catch (error) {
      // Una fórmula sin versión vigente no se puede evaluar y no debería
      // quedar en el catálogo: si la expresión no pasa, se retira la
      // identidad recién creada.
      await this.functionRepository.delete({ id: designFunction.id });
      throw error;
    }
  }

  async update(id: number, dto: UpdateDesignFunctionDto): Promise<void> {
    const designFunction = await this.requireFunction(id);

    if (dto.code !== undefined || dto.type !== undefined) {
      validateCode(
        dto.code ?? designFunction.code,
        dto.type ?? designFunction.type,
        await this.existingCodes(),
        { excludeId: id, currentCode: designFunction.code },
      );
    }

    if (dto.name !== undefined && dto.name !== designFunction.name) {
      const duplicate = await this.functionRepository.findOne({
        where: { name: dto.name },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ValidationError(
          `Ya existe una fórmula llamada "${dto.name}"`,
        );
      }
    }

    await this.functionRepository.update(
      { id },
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
      },
    );
  }

  /** Baja lógica: la fórmula deja de ofrecerse pero su historial se conserva. */
  async softDelete(id: number): Promise<void> {
    await this.requireFunction(id);

    // Dar de baja una fórmula que otra invoca dejaría a esa otra sin poder
    // evaluarse, lejos de aquí y sin relación aparente.
    const callers = await this.summaries(await this.dependencies.directCallers(id));
    if (callers.length > 0) {
      throw new ValidationError(
        `No se puede dar de baja: la invoca${callers.length === 1 ? '' : 'n'} ${callers
          .map((caller) => caller.code)
          .join(', ')}`,
      );
    }

    await this.functionRepository.update({ id }, { deletedAt: new Date() });
  }

  /** Código y nombre de unas fórmulas, para mostrarlas. */
  private async summaries(ids: readonly number[]): Promise<FunctionSummaryDto[]> {
    if (ids.length === 0) return [];
    const functions = await this.functionRepository.find({
      where: { id: In([...ids]) },
      order: { code: 'ASC' },
    });
    return functions.map((item) => ({ id: item.id, code: item.code, name: item.name }));
  }

  async restoreDeleted(id: number): Promise<void> {
    await this.functionRepository.update(
      { id },
      { deletedAt: null as unknown as Date },
    );
  }

  /**
   * Prueba una expresión sin guardarla.
   *
   * Cifra en memoria para evaluar y descarta el resultado: el motor solo sabe
   * evaluar expresiones cifradas, y hacer una excepción para las pruebas
   * significaría una segunda ruta de evaluación que podría comportarse
   * distinto que la real.
   */
  async testExpression(
    dto: TestExpressionDto,
  ): Promise<TestExpressionResultDto> {
    const result = new TestExpressionResultDto();
    result.missingVariables = [];

    const validation = await this.engine.validate(dto.expression);
    if (!validation.valid) {
      result.ok = false;
      result.error = validation.error;
      return result;
    }

    const constants = dto.constants ?? {};
    const provided = new Set(Object.keys(dto.parameters ?? {}));
    result.missingVariables = (validation.symbols ?? []).filter(
      (symbol) =>
        !provided.has(symbol) &&
        !Object.prototype.hasOwnProperty.call(constants, symbol),
    );

    if (result.missingVariables.length > 0) {
      result.ok = false;
      result.error = `Faltan valores para: ${result.missingVariables.join(', ')}`;
      return result;
    }

    try {
      const encrypted = await this.engine.encrypt(dto.expression);
      // Las fórmulas que invoca, con su versión vigente, como en un cálculo real.
      const closure = await this.dependencies.forCodes(
        (validation.formulaCalls ?? []).map((call) => call.name),
        dto.type,
      );
      result.result = await this.engine.evaluate(
        encrypted,
        dto.parameters ?? {},
        constants,
        DesignFunctionDependencyService.toEngine(closure),
      );
      result.ok = true;
    } catch (error) {
      result.ok = false;
      result.error =
        error instanceof Error ? error.message : 'No se pudo evaluar';
    }

    return result;
  }

  async assignedSubTypeIds(designFunctionId: number): Promise<number[]> {
    const relations = await this.subTypeFunctionRepository.find({
      where: {
        designFunction: { id: designFunctionId },
        deletedAt: IsNull(),
      },
      relations: ['designSubType'],
    });
    return relations
      .map((relation) => relation.designSubType?.id)
      .filter((id): id is number => id !== undefined);
  }

  /**
   * Deja la fórmula asignada exactamente a los subtipos indicados.
   *
   * Rechaza una asignación que ponga dos códigos que colisionan dentro del
   * mismo subtipo y tipo: es exactamente la situación que hoy existe con
   * `COST` y `ASSOCIATE_COST`, y que hace que una hoja no pueda distinguir a
   * cuál se invoca.
   */
  async setSubTypes(
    designFunctionId: number,
    subTypeIds: readonly number[],
  ): Promise<void> {
    const designFunction = await this.requireFunction(designFunctionId);

    for (const subTypeId of subTypeIds) {
      const already = await this.functionsOfSubType(subTypeId);
      const others = already.filter((item) => item.id !== designFunctionId);
      const collisions = findCodeCollisions([
        ...others.map(toExistingCode),
        toExistingCode(designFunction),
      ]);
      const involving = collisions.filter(
        (collision) =>
          collision.a.id === designFunctionId ||
          collision.b.id === designFunctionId,
      );
      if (involving.length > 0) {
        const collision = involving[0];
        throw new ValidationError(
          `No se puede asignar al subtipo ${subTypeId}: "${collision.a.name}" y ` +
            `"${collision.b.name}" chocan porque ${collision.reason}`,
        );
      }
    }

    const current = await this.subTypeFunctionRepository.find({
      where: { designFunction: { id: designFunctionId }, deletedAt: IsNull() },
      relations: ['designSubType'],
    });

    const currentIds = new Set(
      current.map((relation) => relation.designSubType?.id),
    );
    const wanted = new Set(subTypeIds);

    const toRemove = current.filter(
      (relation) => !wanted.has(relation.designSubType?.id as number),
    );
    if (toRemove.length > 0) {
      await this.subTypeFunctionRepository.delete(
        toRemove.map((relation) => relation.id),
      );
    }

    const toAdd = subTypeIds.filter((id) => !currentIds.has(id));
    for (const subTypeId of toAdd) {
      await this.subTypeFunctionRepository.save(
        this.subTypeFunctionRepository.create({
          designFunction: { id: designFunctionId } as DesignFunction,
          designSubType: { id: subTypeId } as DesignSubType,
        }),
      );
    }
  }

  /**
   * Mide a qué alcanza un cambio en la fórmula.
   *
   * El conteo de sub-diseños se hace recorriendo las celdas guardadas y
   * buscando invocaciones de su código. Es lo único fiable: los diseños
   * anteriores al versionado no tienen estampado, así que no hay ningún
   * registro de qué fórmula usa cada uno más allá de sus propias fórmulas.
   */
  async impact(designFunctionId: number): Promise<DesignFunctionImpactDto> {
    const designFunction = await this.requireFunction(designFunctionId);

    const relations = await this.subTypeFunctionRepository.find({
      where: { designFunction: { id: designFunctionId }, deletedAt: IsNull() },
      relations: ['designSubType'],
    });

    const subDesigns = await this.subDesignRepository.find({
      relations: ['design'],
    });

    // Quien la invoca, directa o indirectamente, arrastra a sus diseños.
    const callers = await this.summaries(
      await this.dependencies.callersOf(designFunctionId),
    );
    const codes = [designFunction.code, ...callers.map((caller) => caller.code)];
    const invocation = new RegExp(
      `(?<![A-Za-z0-9_])(?:${codes.join('|')})\\s*\\(`,
    );

    let subDesignCount = 0;
    let staleCount = 0;
    const designIds = new Set<number>();

    for (const subDesign of subDesigns) {
      if (!subDesign.data) continue;
      if (!invocation.test(subDesign.data)) continue;

      subDesignCount += 1;
      if (subDesign.isStale) staleCount += 1;
      if (subDesign.design?.id !== undefined)
        designIds.add(subDesign.design.id);
    }

    const impact = new DesignFunctionImpactDto();
    impact.designFunctionId = designFunctionId;
    impact.subTypeCount = relations.length;
    impact.subTypeNames = relations
      .map((relation) => relation.designSubType?.name)
      .filter((name): name is string => name !== undefined);
    impact.subDesignCount = subDesignCount;
    impact.designCount = designIds.size;
    impact.staleSubDesignCount = staleCount;
    impact.invokedBy = callers;
    return impact;
  }

  private async requireFunction(id: number): Promise<DesignFunction> {
    const designFunction = await this.functionRepository.findOne({
      where: { id },
    });
    if (!designFunction) {
      throw new NotFoundException(`No existe la fórmula ${id}`);
    }
    return designFunction;
  }

  private async existingCodes(): Promise<ExistingCode[]> {
    const all = await this.functionRepository.find({
      where: { deletedAt: IsNull() },
    });
    return all.map(toExistingCode);
  }

  private async functionsOfSubType(
    subTypeId: number,
  ): Promise<DesignFunction[]> {
    const relations = await this.subTypeFunctionRepository.find({
      where: {
        designSubType: { id: subTypeId },
        deletedAt: IsNull(),
      },
      relations: ['designFunction'],
    });
    return relations
      .map((relation) => relation.designFunction)
      .filter(
        (item): item is DesignFunction => item !== null && item !== undefined,
      );
  }

  private async countSubTypesByFunction(
    ids: readonly number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (ids.length === 0) return counts;

    const relations = await this.subTypeFunctionRepository.find({
      where: { designFunction: { id: In([...ids]) }, deletedAt: IsNull() },
      relations: ['designFunction'],
    });

    for (const relation of relations) {
      const id = relation.designFunction?.id;
      if (id === undefined) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }
}

const toExistingCode = (designFunction: DesignFunction): ExistingCode => ({
  id: designFunction.id,
  code: designFunction.code,
  type: designFunction.type,
  name: designFunction.name,
});

export { parseVariables };
