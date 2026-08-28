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
  formulaOverrides?: FormulaMap | string;
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
}

@Injectable()
export class PhantomItemService {
  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    @InjectRepository(PhantomItemComponent)
    private readonly componentRepository: Repository<PhantomItemComponent>,
    private readonly dataSource: DataSource,
  ) {}

  async findAllPaginated(
    filters: PhantomItemsFiltersPaginatedDto,
  ): Promise<PhantomItemListOutputDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    const query = this.phantomItemRepository
      .createQueryBuilder('phantomItem')
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

    const [phantomItems, total] = await query
      .orderBy('phantomItem.item_code', 'ASC')
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

    const header = this.buildHeader(dto);

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
    const merged = {
      ...existing,
      ...dto,
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
      formulaOverrides,
    });

    validateLengths(derived);

    return {
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
    };
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
