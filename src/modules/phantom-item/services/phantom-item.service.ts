import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import {
  CreatePhantomItemDto,
  UpdatePhantomItemDto,
} from '../dtos/phantom-item.dto';
import {
  CreatePhantomItemComponentDto,
  UpdatePhantomItemComponentDto,
} from '../dtos/phantom-item-component.dto';
import { PhantomItemsFiltersPaginatedDto } from '../dtos/phantom-items-filters-paginated.dto';
import {
  PhantomItemDetailOutputDto,
  PhantomItemListOutputDto,
} from '../dtos/phantom-item-output.dto';
import {
  applyComponentDerivedFields,
  applyHeaderDerivedFields,
  FormulaMap,
  parseFormulaOverrides,
  serializeFormulaOverrides,
  validateLengths,
} from '../utils/derived-fields';
import {
  toPhantomItemDetailOutput,
  toPhantomItemOutput,
} from '../utils/phantom-item.mapper';
import { DEFAULT_REFERENCE_LIMIT } from '../constants/phantom-item-columns';
import { PhantomProcessService } from './phantom-process.service';
import { serializeExtraValues } from '../utils/extra-values';

/**
 * Minimal input to build a header. Accepts the API DTOs as well as the
 * already-persisted entity (where `formulaOverrides` travels as serialized
 * JSON) and the rows built by the importer.
 */
export interface HeaderBuildInput {
  finishedProductType?: string;
  workInProcessType?: string;
  phantomRootCode?: string;
  kvaRatingStandard?: string;
  itemCode?: string;
  reference?: string;
  itemDescription?: string;
  shortDescription?: string;
  unitOfMeasure?: string;
  referenceLengthLimit?: number;
  /** The process's rule; not stored on the phantom item */
  referenceSeparator?: string;
  formulaOverrides?: FormulaMap | string;
  processId?: number;
  familyId?: number | null;
  /** Own header columns of the process: an object, or the stored JSON */
  extraValues?: Record<string, string> | string | null;
}

export interface ComponentBuildInput {
  componentItemCode?: string;
  description?: string;
  baseQuantity?: number;
  requiredQuantity?: number;
  requiredQuantityPerUnit?: number;
  componentUnitOfMeasure?: string;
  wastePercentage?: number;
  consumptionWarehouse?: string;
  sortOrder?: number;
  formulaOverrides?: FormulaMap | string;
  extraValues?: Record<string, string> | string | null;
}

/** Parses stored JSON or passes an object through, for extra values */
const asExtraObject = (
  value: Record<string, string> | string | null | undefined,
): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

@Injectable()
export class PhantomItemService {
  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    @InjectRepository(PhantomItemComponent)
    private readonly componentRepository: Repository<PhantomItemComponent>,
    private readonly dataSource: DataSource,
    private readonly processes: PhantomProcessService,
  ) {}

  async findAllPaginated(
    filters: PhantomItemsFiltersPaginatedDto,
  ): Promise<PhantomItemListOutputDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    const query = this.phantomItemRepository
      .createQueryBuilder('phantomItem')
      .leftJoinAndSelect('phantomItem.family', 'family')
      .loadRelationCountAndMap(
        'phantomItem.componentsCount',
        'phantomItem.components',
        'component',
        (qb) => qb.andWhere('component.deleted_at IS NULL'),
      )
      .where('phantomItem.deleted_at IS NULL');

    if (filters.search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('phantomItem.item_code LIKE :search', {
            search: `%${filters.search}%`,
          })
            .orWhere('phantomItem.reference LIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('phantomItem.short_description LIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    if (filters.finishedProductType) {
      query.andWhere(
        'phantomItem.finished_product_type = :finishedProductType',
        {
          finishedProductType: filters.finishedProductType,
        },
      );
    }
    if (filters.workInProcessType) {
      query.andWhere('phantomItem.work_in_process_type = :workInProcessType', {
        workInProcessType: filters.workInProcessType,
      });
    }
    if (filters.phantomRootCode) {
      query.andWhere('phantomItem.phantom_root_code = :phantomRootCode', {
        phantomRootCode: filters.phantomRootCode,
      });
    }
    if (filters.processId) {
      query.andWhere('phantomItem.process_id = :processId', {
        processId: filters.processId,
      });
    }
    if (filters.familyId) {
      query.andWhere('phantomItem.family_id = :familyId', {
        familyId: filters.familyId,
      });
    }

    // By property, not by column: with the family join TypeORM paginates with
    // an inner query that only knows the entity's properties, and
    // `phantomItem.item_code` broke the list (reading 'databaseName')
    const [phantomItems, total] = await query
      .orderBy('phantomItem.itemCode', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: phantomItems.map((phantomItem) =>
        toPhantomItemOutput(
          phantomItem,
          (phantomItem as PhantomItem & { componentsCount?: number })
            .componentsCount ?? 0,
        ),
      ),
      total,
      page,
      limit,
    };
  }

  /** Returns the entity with its active components, or throws 404 */
  async findEntityOrFail(id: number): Promise<PhantomItem> {
    const phantomItem = await this.phantomItemRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['family'],
    });

    if (!phantomItem) {
      throw new NotFoundException(`Phantom item ${id} does not exist`);
    }

    phantomItem.components = await this.componentRepository.find({
      where: { phantomItemId: id, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });

    return phantomItem;
  }

  async findOne(id: number): Promise<PhantomItemDetailOutputDto> {
    return toPhantomItemDetailOutput(await this.findEntityOrFail(id));
  }

  async create(dto: CreatePhantomItemDto): Promise<PhantomItemDetailOutputDto> {
    await this.assertItemCodeIsAvailable(dto.itemCode);

    const placement = await this.resolvePlacement(dto);
    const header = this.buildHeader({ ...dto, ...placement });

    const id = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(PhantomItem).save(header);
      await this.replaceComponents(manager, saved.id, dto.components ?? []);
      return saved.id;
    });

    return this.findOne(id);
  }

  async update(
    id: number,
    dto: UpdatePhantomItemDto,
  ): Promise<PhantomItemDetailOutputDto> {
    const existing = await this.findEntityOrFail(id);

    if (dto.itemCode && dto.itemCode !== existing.itemCode) {
      await this.assertItemCodeIsAvailable(dto.itemCode);
    }

    // Derived rules are recalculated over the merge of what exists and what
    // arrives, so a partial PATCH doesn't wipe fields that weren't sent.
    const placement = await this.resolvePlacement(dto, existing);
    const merged = {
      ...existing,
      ...dto,
      ...placement,
      extraValues: dto.extraValues ?? existing.extraValues,
      formulaOverrides:
        dto.formulaOverrides ??
        parseFormulaOverrides(existing.formulaOverrides),
    };
    const header = this.buildHeader(merged);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PhantomItem).update(id, header);
      if (dto.components !== undefined) {
        await this.replaceComponents(manager, id, dto.components);
      }
    });

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityOrFail(id);
    const deletedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PhantomItem).update(id, { deletedAt });
      await manager
        .getRepository(PhantomItemComponent)
        .update({ phantomItemId: id, deletedAt: IsNull() }, { deletedAt });
    });
  }

  /**
   * Soft-deletes several phantom items and their components at once. All or
   * nothing: if any id does not exist (or was already deleted), none is
   * deleted, so the screen never shows a half-applied selection.
   */
  async removeMany(ids: number[]): Promise<{ deleted: number }> {
    const unique = [...new Set(ids)];
    const found = await this.phantomItemRepository.find({
      where: { id: In(unique), deletedAt: IsNull() },
      select: { id: true },
    });
    const missing = unique.filter(
      (id) => !found.some((item) => item.id === id),
    );
    if (missing.length > 0) {
      throw new NotFoundException(
        `Phantom items not found: ${missing.join(', ')}`,
      );
    }

    const deletedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(PhantomItem)
        .update({ id: In(unique) }, { deletedAt });
      await manager
        .getRepository(PhantomItemComponent)
        .update(
          { phantomItemId: In(unique), deletedAt: IsNull() },
          { deletedAt },
        );
    });
    return { deleted: unique.length };
  }

  async addComponent(
    phantomItemId: number,
    dto: CreatePhantomItemComponentDto,
  ): Promise<PhantomItemDetailOutputDto> {
    await this.findEntityOrFail(phantomItemId);

    const maxSortOrder = await this.componentRepository
      .createQueryBuilder('component')
      .select('MAX(component.sort_order)', 'max')
      .where('component.phantom_item_id = :phantomItemId', { phantomItemId })
      .andWhere('component.deleted_at IS NULL')
      .getRawOne<{ max: number | null }>();

    const nextSortOrder = dto.sortOrder ?? (maxSortOrder?.max ?? -1) + 1;

    await this.componentRepository.save(
      this.buildComponent(dto, phantomItemId, nextSortOrder),
    );

    return this.findOne(phantomItemId);
  }

  async updateComponent(
    componentId: number,
    dto: UpdatePhantomItemComponentDto,
  ): Promise<PhantomItemDetailOutputDto> {
    const existing = await this.componentRepository.findOne({
      where: { id: componentId, deletedAt: IsNull() },
    });

    if (!existing) {
      throw new NotFoundException(`Component ${componentId} does not exist`);
    }

    const merged = {
      ...existing,
      ...dto,
      formulaOverrides:
        dto.formulaOverrides ??
        parseFormulaOverrides(existing.formulaOverrides),
    };

    await this.componentRepository.update(
      componentId,
      this.buildComponent(merged, existing.phantomItemId, merged.sortOrder),
    );

    return this.findOne(existing.phantomItemId);
  }

  async removeComponent(componentId: number): Promise<void> {
    const existing = await this.componentRepository.findOne({
      where: { id: componentId, deletedAt: IsNull() },
    });

    if (!existing) {
      throw new NotFoundException(`Component ${componentId} does not exist`);
    }

    await this.componentRepository.update(componentId, {
      deletedAt: new Date(),
    });
  }

  /**
   * Process and family of a phantom item being created or edited. The process
   * defaults to the existing one, or to the first process; the family can come
   * by id or by name, and a name is found or created in the process.
   */
  private async resolvePlacement(
    dto: CreatePhantomItemDto | UpdatePhantomItemDto,
    existing?: PhantomItem,
  ): Promise<{
    processId: number;
    familyId: number | null;
    referenceSeparator: string;
  }> {
    const processId =
      dto.processId ??
      existing?.processId ??
      (await this.processes.list())[0]?.id;
    if (processId === undefined) {
      throw new NotFoundException(
        'There is no phantom process to put the item in',
      );
    }
    const { referenceSeparator = '' } =
      await this.processes.findOrFail(processId);

    if (dto.familyName !== undefined && dto.familyName.trim() !== '') {
      return {
        processId,
        referenceSeparator,
        familyId: await this.processes.getOrCreateFamily(
          processId,
          dto.familyName,
        ),
      };
    }
    if (dto.familyId !== undefined) {
      if (dto.familyId !== null)
        await this.processes.assertFamilyInProcess(processId, dto.familyId);
      return { processId, referenceSeparator, familyId: dto.familyId };
    }
    // Moving to another process drops a family that belonged to the old one
    const keepFamily =
      existing && existing.processId === processId ? existing.familyId : null;
    return { processId, referenceSeparator, familyId: keepFamily ?? null };
  }

  private async assertItemCodeIsAvailable(itemCode: string): Promise<void> {
    const duplicate = await this.phantomItemRepository.findOne({
      where: { itemCode, deletedAt: IsNull() },
    });

    if (duplicate) {
      throw new ConflictException(
        `A phantom item with item code ${itemCode} already exists`,
      );
    }
  }

  /**
   * Applies the derived rules, validates length limits and leaves the
   * entity ready to save. This is the single place that assembles the
   * header, so create, update and import all share exactly these rules.
   */
  buildHeader(input: HeaderBuildInput): Partial<PhantomItem> {
    return this.buildHeaderChecked(input).header;
  }

  /**
   * `buildHeader`, plus the length excesses that are accepted with a warning
   * (see `SOFT_LENGTH_FIELDS`), for the importer to report.
   */
  buildHeaderChecked(input: HeaderBuildInput): {
    header: Partial<PhantomItem>;
    warnings: Record<string, string>;
  } {
    const formulaOverrides =
      typeof input.formulaOverrides === 'string'
        ? parseFormulaOverrides(input.formulaOverrides)
        : (input.formulaOverrides ?? {});

    const derived = applyHeaderDerivedFields({
      finishedProductType: input.finishedProductType,
      workInProcessType: input.workInProcessType,
      phantomRootCode: input.phantomRootCode,
      kvaRatingStandard: input.kvaRatingStandard,
      reference: input.reference,
      itemDescription: input.itemDescription,
      shortDescription: input.shortDescription,
      referenceLengthLimit:
        input.referenceLengthLimit ?? DEFAULT_REFERENCE_LIMIT,
      referenceSeparator: input.referenceSeparator,
      formulaOverrides,
    });

    const warnings = validateLengths(derived);

    const header: Partial<PhantomItem> = {
      finishedProductType: derived.finishedProductType,
      workInProcessType: derived.workInProcessType,
      phantomRootCode: derived.phantomRootCode,
      kvaRatingStandard: derived.kvaRatingStandard,
      itemCode: input.itemCode,
      reference: derived.reference,
      itemDescription: derived.itemDescription,
      shortDescription: derived.shortDescription,
      unitOfMeasure: input.unitOfMeasure,
      referenceLengthLimit: derived.referenceLengthLimit,
      formulaOverrides: serializeFormulaOverrides(formulaOverrides),
      ...(input.processId === undefined ? {} : { processId: input.processId }),
      ...(input.familyId === undefined ? {} : { familyId: input.familyId }),
      ...(input.extraValues === undefined
        ? {}
        : {
            extraValues: serializeExtraValues(asExtraObject(input.extraValues)),
          }),
    };
    return { header, warnings };
  }

  buildComponent(
    input: ComponentBuildInput,
    phantomItemId: number,
    sortOrder: number,
  ): Partial<PhantomItemComponent> {
    const formulaOverrides =
      typeof input.formulaOverrides === 'string'
        ? parseFormulaOverrides(input.formulaOverrides)
        : (input.formulaOverrides ?? {});

    const derived = applyComponentDerivedFields({
      baseQuantity: input.baseQuantity,
      requiredQuantity: input.requiredQuantity,
      requiredQuantityPerUnit: input.requiredQuantityPerUnit,
      formulaOverrides,
    });

    return {
      phantomItemId,
      sortOrder,
      componentItemCode: input.componentItemCode,
      description: input.description,
      baseQuantity: input.baseQuantity,
      requiredQuantity: input.requiredQuantity,
      requiredQuantityPerUnit: derived.requiredQuantityPerUnit,
      componentUnitOfMeasure: input.componentUnitOfMeasure,
      wastePercentage: input.wastePercentage,
      consumptionWarehouse: input.consumptionWarehouse,
      formulaOverrides: serializeFormulaOverrides(formulaOverrides),
      extraValues: serializeExtraValues(asExtraObject(input.extraValues)),
    };
  }

  /**
   * Replaces the full list of components: the grid is a whole-document
   * editor, not one for loose fields (see design.md, decision 5).
   */
  async replaceComponents(
    manager: EntityManager,
    phantomItemId: number,
    components: CreatePhantomItemComponentDto[],
  ): Promise<void> {
    const repository = manager.getRepository(PhantomItemComponent);

    await repository.update(
      { phantomItemId, deletedAt: IsNull() },
      { deletedAt: new Date() },
    );

    if (components.length === 0) return;

    const rows = components.map((component, index) =>
      this.buildComponent(
        component,
        phantomItemId,
        component.sortOrder ?? index,
      ),
    );

    // Batched: SQL Server limits statements to 2100 parameters
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await repository.insert(rows.slice(i, i + chunkSize));
    }
  }
}
