import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PhantomItemsFiltersPaginatedDto } from '../dtos/phantom-items-filters-paginated.dto';
import {
  PhantomItemFieldScope,
  getColumnByField,
} from '../constants/phantom-item-columns';
import {
  calculateLengths,
  parseFormulaOverrides,
} from '../utils/derived-fields';
import { parseExtraValues } from '../utils/extra-values';
import { FAMILY_HEADER, isCustomKey, scopeOf } from '../utils/process-columns';
import { PhantomColumnScope } from '../entities/phantom-process-column.entity';
import { PhantomProcessService, ProcessView } from './phantom-process.service';

/** Excel's limit for a sheet name, and the characters it forbids */
const MAX_SHEET_NAME = 31;
const FORBIDDEN_SHEET_CHARS = /[\\/?*[\]:]/g;

@Injectable()
export class PhantomItemExportService {
  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    @InjectRepository(PhantomItemComponent)
    private readonly componentRepository: Repository<PhantomItemComponent>,
    private readonly processes: PhantomProcessService,
  ) {}

  /**
   * The workbook as the business keeps it: one sheet per process, in order,
   * with that process's columns and headers and the family («Fantasma») first.
   * Each component is a row and the header repeats on every row of its
   * phantom item, like the original template. With `processId` in the
   * filters, only that process's sheet.
   */
  async export(
    filters: PhantomItemsFiltersPaginatedDto,
    ids?: number[],
  ): Promise<ExcelJS.Buffer> {
    const processes = await this.selectedProcesses(filters.processId);
    const phantomItems = await this.findForExport(filters, ids);

    const components = phantomItems.length
      ? await this.componentRepository.find({
          where: {
            phantomItemId: In(phantomItems.map((item) => item.id)),
            deletedAt: IsNull(),
          },
          order: { phantomItemId: 'ASC', sortOrder: 'ASC' },
        })
      : [];
    const byPhantomItem = new Map<number, PhantomItemComponent[]>();
    components.forEach((component) => {
      byPhantomItem.set(component.phantomItemId, [
        ...(byPhantomItem.get(component.phantomItemId) ?? []),
        component,
      ]);
    });

    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set<string>();
    for (const process of processes) {
      const sheet = this.addSheet(workbook, process, usedNames);
      for (const phantomItem of phantomItems.filter(
        (item) => item.processId === process.id,
      )) {
        const list = byPhantomItem.get(phantomItem.id) ?? [];
        // A phantom item without components still appears, with the line columns empty
        if (list.length === 0) {
          sheet.addRow(this.buildRow(process, phantomItem, null));
          continue;
        }
        list.forEach((component) =>
          sheet.addRow(this.buildRow(process, phantomItem, component)),
        );
      }
    }

    return workbook.xlsx.writeBuffer();
  }

  /** Empty workbook: one sheet per process with its limits and headers */
  async buildTemplate(processId?: number): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set<string>();
    for (const process of await this.selectedProcesses(processId)) {
      this.addSheet(workbook, process, usedNames);
    }
    return workbook.xlsx.writeBuffer();
  }

  private async selectedProcesses(processId?: number): Promise<ProcessView[]> {
    const all = await this.processes.list();
    return processId ? all.filter((process) => process.id === processId) : all;
  }

  /**
   * Row 1: the length limits above their columns. Row 2: the headers. The
   * family column comes first, as in the business's workbook.
   */
  private addSheet(
    workbook: ExcelJS.Workbook,
    process: ProcessView,
    usedNames: Set<string>,
  ): ExcelJS.Worksheet {
    const sheet = workbook.addWorksheet(
      this.sheetName(process.name, usedNames),
    );

    sheet.addRow([
      null,
      ...process.columns.map((column) => {
        const catalog = isCustomKey(column.key)
          ? undefined
          : getColumnByField(column.key);
        return catalog?.scope === PhantomItemFieldScope.LENGTH
          ? (catalog.lengthLimit ?? 40)
          : null;
      }),
    ]);
    const headerRow = sheet.addRow([
      FAMILY_HEADER,
      ...process.columns.map((column) => column.header),
    ]);
    headerRow.font = { bold: true };

    [FAMILY_HEADER, ...process.columns.map((column) => column.header)].forEach(
      (header, index) => {
        sheet.getColumn(index + 1).width = Math.max(header.length + 4, 12);
      },
    );
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    return sheet;
  }

  /** A valid, unique sheet name: Excel forbids some characters and caps the length */
  private sheetName(name: string, usedNames: Set<string>): string {
    const base =
      name
        .replace(FORBIDDEN_SHEET_CHARS, ' ')
        .trim()
        .slice(0, MAX_SHEET_NAME) || 'Proceso';
    let candidate = base;
    for (let suffix = 2; usedNames.has(candidate.toLowerCase()); suffix++) {
      candidate = `${base.slice(0, MAX_SHEET_NAME - String(suffix).length - 1)} ${suffix}`;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  private buildRow(
    process: ProcessView,
    phantomItem: PhantomItem,
    component: PhantomItemComponent | null,
  ): (string | number | null)[] {
    const formulaOverrides = parseFormulaOverrides(
      phantomItem.formulaOverrides,
    );
    const lengths = calculateLengths({ ...phantomItem, formulaOverrides });
    const headerExtras = parseExtraValues(phantomItem.extraValues);
    const lineExtras = parseExtraValues(component?.extraValues);

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

    return [
      phantomItem.family?.name ?? null,
      ...process.columns.map((column) => {
        if (!isCustomKey(column.key)) return source[column.key] ?? null;
        const values =
          scopeOf(column) === PhantomColumnScope.HEADER
            ? headerExtras
            : lineExtras;
        return values[column.key] ?? null;
      }),
    ];
  }

  private async findForExport(
    filters: PhantomItemsFiltersPaginatedDto,
    ids?: number[],
  ): Promise<PhantomItem[]> {
    const query = this.phantomItemRepository
      .createQueryBuilder('phantomItem')
      .leftJoinAndSelect('phantomItem.family', 'family')
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

    // Within a process, the order the business reads them: family, then item
    return query
      .orderBy('family.name', 'ASC')
      .addOrderBy('phantomItem.itemCode', 'ASC')
      .getMany();
  }
}
