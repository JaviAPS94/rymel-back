import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PhantomItemsFiltersPaginatedDto } from '../dtos/phantom-items-filters-paginated.dto';
import {
  PHANTOM_ITEM_COLUMNS,
  PhantomItemFieldScope,
} from '../constants/phantom-item-columns';
import {
  calculateLengths,
  parseFormulaOverrides,
} from '../utils/derived-fields';

const SHEET_NAME = 'ITEMS FANTASMAS';

@Injectable()
export class PhantomItemExportService {
  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    @InjectRepository(PhantomItemComponent)
    private readonly componentRepository: Repository<PhantomItemComponent>,
  ) {}

  /**
   * Generates the flat `.xlsx` with columns A–T, repeating the header on
   * every row of its group, exactly like the original template.
   */
  async export(
    filters: PhantomItemsFiltersPaginatedDto,
    ids?: number[],
  ): Promise<ExcelJS.Buffer> {
    const phantomItems = await this.findForExport(filters, ids);
    const workbook = this.createWorkbook();
    const sheet = workbook.getWorksheet(SHEET_NAME);

    if (phantomItems.length > 0) {
      const components = await this.componentRepository.find({
        where: {
          phantomItemId: In(phantomItems.map((phantomItem) => phantomItem.id)),
          deletedAt: IsNull(),
        },
        order: { phantomItemId: 'ASC', sortOrder: 'ASC' },
      });

      const byPhantomItem = new Map<number, PhantomItemComponent[]>();
      components.forEach((component) => {
        const list = byPhantomItem.get(component.phantomItemId) ?? [];
        list.push(component);
        byPhantomItem.set(component.phantomItemId, list);
      });

      phantomItems.forEach((phantomItem) => {
        const list = byPhantomItem.get(phantomItem.id) ?? [];
        // A phantom item without components still appears, with columns M–T empty
        if (list.length === 0) {
          sheet.addRow(this.buildRow(phantomItem, null));
          return;
        }
        list.forEach((component) =>
          sheet.addRow(this.buildRow(phantomItem, component)),
        );
      });
    }

    return workbook.xlsx.writeBuffer();
  }

  /** Empty template: headers and the limits row from the original */
  async buildTemplate(): Promise<ExcelJS.Buffer> {
    return this.createWorkbook().xlsx.writeBuffer();
  }

  private createWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);

    // Row 1: the length limits, above their columns
    const limitsRow: (number | null)[] = PHANTOM_ITEM_COLUMNS.map((column) =>
      column.scope === PhantomItemFieldScope.LENGTH
        ? (column.lengthLimit ?? 40)
        : null,
    );
    sheet.addRow(limitsRow);

    // Row 2: the headers
    const headerRow = sheet.addRow(
      PHANTOM_ITEM_COLUMNS.map((column) => column.header),
    );
    headerRow.font = { bold: true };

    PHANTOM_ITEM_COLUMNS.forEach((column, index) => {
      sheet.getColumn(index + 1).width = Math.max(column.header.length + 4, 12);
    });

    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    return workbook;
  }

  private buildRow(
    phantomItem: PhantomItem,
    component: PhantomItemComponent | null,
  ): (string | number | null)[] {
    const formulaOverrides = parseFormulaOverrides(
      phantomItem.formulaOverrides,
    );
    const lengths = calculateLengths({ ...phantomItem, formulaOverrides });

    const source: Record<string, string | number | null> = {
      finishedProductType: phantomItem.finishedProductType,
      workInProcessType: phantomItem.workInProcessType,
      phantomRootCode: phantomItem.phantomRootCode,
      kvaRatingStandard: phantomItem.kvaRatingStandard,
      itemCode: phantomItem.itemCode,
      reference: phantomItem.reference,
      referenceLength: lengths.referenceLength,
      itemDescription: phantomItem.itemDescription,
      itemDescriptionLength: lengths.itemDescriptionLength,
      shortDescription: phantomItem.shortDescription,
      shortDescriptionLength: lengths.shortDescriptionLength,
      unitOfMeasure: phantomItem.unitOfMeasure,
      componentItemCode: component?.componentItemCode ?? null,
      description: component?.description ?? null,
      baseQuantity: component?.baseQuantity ?? null,
      requiredQuantity: component?.requiredQuantity ?? null,
      requiredQuantityPerUnit: component?.requiredQuantityPerUnit ?? null,
      componentUnitOfMeasure: component?.componentUnitOfMeasure ?? null,
      wastePercentage: component?.wastePercentage ?? null,
      consumptionWarehouse: component?.consumptionWarehouse ?? null,
    };

    return PHANTOM_ITEM_COLUMNS.map((column) => source[column.field] ?? null);
  }

  private async findForExport(
    filters: PhantomItemsFiltersPaginatedDto,
    ids?: number[],
  ): Promise<PhantomItem[]> {
    const query = this.phantomItemRepository
      .createQueryBuilder('phantomItem')
      .where('phantomItem.deleted_at IS NULL');

    if (ids?.length) {
      query.andWhere('phantomItem.id IN (:...ids)', { ids });
    }

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

    return query.orderBy('phantomItem.item_code', 'ASC').getMany();
  }
}
