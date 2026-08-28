import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemService } from './phantom-item.service';
import {
  PhantomItemImportMode,
  ImportIssueDto,
  ImportResultDto,
} from '../dtos/import-phantom-items.dto';
import { CreatePhantomItemComponentDto } from '../dtos/phantom-item-component.dto';
import { ColumnIndexMap, detectHeaderRow } from '../utils/xlsx-header-mapper';
import {
  buildShortDescription,
  buildReference,
  FormulaMap,
} from '../utils/derived-fields';
import {
  getColumnByField,
  PHANTOM_ITEM_COLUMNS,
} from '../constants/phantom-item-columns';
import { parsePercentage, parseQuantity } from '../utils/parse-locale-number';

/** A data row already read from the file */
interface RawRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

/** Consecutive rows that share the same `Item` */
interface PhantomItemGroup {
  itemCode: string;
  rows: RawRow[];
}

const MAX_HEADER_SCAN_ROWS = 10;

@Injectable()
export class PhantomItemImportService {
  private readonly logger = new Logger(PhantomItemImportService.name);

  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    private readonly phantomItemService: PhantomItemService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Reads the file, groups rows by item and writes each group in its own
   * transaction. Errors accumulate per row: a bad row doesn't abort the
   * whole file (see spec phantom-item-excel-io).
   */
  async import(
    filePath: string,
    mode: PhantomItemImportMode,
    dryRun: boolean,
  ): Promise<ImportResultDto> {
    const result: ImportResultDto = {
      dryRun,
      created: 0,
      updated: 0,
      skipped: 0,
      rowsRead: 0,
      phantomItemsDetected: 0,
      errors: [],
      warnings: [],
    };

    const { columnIndexes, rows } = await this.readRows(filePath);
    result.rowsRead = rows.length;

    const groups = this.groupByItemCode(rows, columnIndexes, result);
    result.phantomItemsDetected = groups.length;

    for (const group of groups) {
      await this.processGroup(group, columnIndexes, mode, dryRun, result);
    }

    return result;
  }

  /**
   * Reads the first sheet of the file.
   *
   * The non-streaming reader is used on purpose: exceljs 4.4's
   * `WorkbookReader` accesses `this.model.sheets` before `xl/workbook.xml`
   * has been parsed when the zip carries `sharedStrings` ahead of the
   * workbook, and fails with "Cannot read properties of undefined (reading
   * 'sheets')" on every file with text — which is all of ours. The
   * endpoint's 10 MB limit bounds what this can cost in memory.
   */
  private async readRows(filePath: string): Promise<{
    columnIndexes: ColumnIndexMap;
    rows: RawRow[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { file: ['The file does not contain any sheets with data.'] },
      });
    }

    const allRows: { rowNumber: number; values: unknown[] }[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      allRows.push({ rowNumber, values: this.toPlainValues(row) });
    });

    if (allRows.length === 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { file: ['The sheet does not contain any rows.'] },
      });
    }

    const detection = detectHeaderRow(allRows.slice(0, MAX_HEADER_SCAN_ROWS));
    const rows: RawRow[] = [];

    allRows
      .filter((row) => row.rowNumber > detection.headerRowNumber)
      .forEach((row) => {
        const mapped = this.mapRow(row.values, detection.columnIndexes);
        if (!this.isEmptyRow(mapped)) {
          rows.push({ rowNumber: row.rowNumber, values: mapped });
        }
      });

    return { columnIndexes: detection.columnIndexes, rows };
  }

  /** Normalizes ExcelJS values into a flat, 1-based array */
  private toPlainValues(row: ExcelJS.Row): unknown[] {
    const raw = row.values as unknown[];
    if (!Array.isArray(raw)) return [];

    return raw.map((cell) => {
      if (cell === null || cell === undefined) return null;
      // Formula cells: the result matters, not the expression
      if (typeof cell === 'object') {
        const asObject = cell as Record<string, unknown>;
        if ('result' in asObject) return asObject.result;
        if ('richText' in asObject) {
          return (asObject.richText as { text: string }[])
            .map((part) => part.text)
            .join('');
        }
        if ('text' in asObject) return asObject.text;
        return null;
      }
      return cell;
    });
  }

  private mapRow(
    values: unknown[],
    columnIndexes: ColumnIndexMap,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    Object.entries(columnIndexes).forEach(([field, index]) => {
      const value = values[index];
      if (typeof value !== 'string') {
        mapped[field] = value;
        return;
      }
      // In `kvaRatingStandard` the leading space is the reference's
      // separator: trimming it would change the calculated reference.
      mapped[field] = getColumnByField(field)?.preserveLeadingWhitespace
        ? value.trimEnd()
        : value.trim();
    });
    return mapped;
  }

  private isEmptyRow(values: Record<string, unknown>): boolean {
    return Object.values(values).every(
      (value) => value === null || value === undefined || value === '',
    );
  }

  /** Groups consecutive rows that share the same `Item` */
  private groupByItemCode(
    rows: RawRow[],
    columnIndexes: ColumnIndexMap,
    result: ImportResultDto,
  ): PhantomItemGroup[] {
    const groups: PhantomItemGroup[] = [];
    let current: PhantomItemGroup | null = null;

    for (const row of rows) {
      const itemCode = this.asText(row.values.itemCode);

      if (itemCode) {
        if (!current || current.itemCode !== itemCode) {
          current = { itemCode, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
        continue;
      }

      // Row without an item code: belongs to the open group, or is discarded
      if (current) {
        current.rows.push(row);
      } else {
        result.errors.push(
          this.issue(row.rowNumber, 'item', 'The row has no header item.'),
        );
      }
    }

    return groups;
  }

  private async processGroup(
    group: PhantomItemGroup,
    columnIndexes: ColumnIndexMap,
    mode: PhantomItemImportMode,
    dryRun: boolean,
    result: ImportResultDto,
  ): Promise<void> {
    const headerRow = group.rows[0];
    const header = this.buildHeaderInput(group, result);

    const components: CreatePhantomItemComponentDto[] = [];
    let hasRowErrors = false;

    group.rows.forEach((row, index) => {
      const component = this.buildComponentInput(row, index, result);
      if (component) {
        components.push(component);
      } else {
        hasRowErrors = true;
      }
    });

    if (hasRowErrors && components.length === 0) {
      result.skipped += 1;
      return;
    }

    const existing = await this.phantomItemRepository.findOne({
      where: { itemCode: group.itemCode, deletedAt: IsNull() },
    });

    if (existing && mode === PhantomItemImportMode.CREATE) {
      result.skipped += 1;
      result.errors.push(
        this.issue(
          headerRow.rowNumber,
          'Item',
          `A phantom item with item code ${group.itemCode} already exists. Use upsert mode to update it.`,
        ),
      );
      return;
    }

    // The header is validated before touching the database, so a length
    // error is reported as a row, not as a whole-file failure.
    let headerEntity: Partial<PhantomItem>;
    try {
      headerEntity = this.phantomItemService.buildHeader(header);
    } catch (error) {
      result.skipped += 1;
      result.errors.push(
        this.issue(
          headerRow.rowNumber,
          'Referencia',
          this.describeValidationError(error),
        ),
      );
      return;
    }

    if (dryRun) {
      if (existing) result.updated += 1;
      else result.created += 1;
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(PhantomItem);

        if (existing) {
          await repository.update(existing.id, headerEntity);
          await this.phantomItemService.replaceComponents(
            manager,
            existing.id,
            components,
          );
        } else {
          const saved = await repository.save(headerEntity);
          await this.phantomItemService.replaceComponents(
            manager,
            saved.id,
            components,
          );
        }
      });

      if (existing) result.updated += 1;
      else result.created += 1;
    } catch (error) {
      this.logger.error(
        `Failed to write phantom item ${group.itemCode}`,
        error instanceof Error ? error.stack : String(error),
      );
      result.skipped += 1;
      result.errors.push(
        this.issue(
          headerRow.rowNumber,
          'Item',
          `Could not save phantom item ${group.itemCode}: ${this.describeValidationError(error)}`,
        ),
      );
    }
  }

  /**
   * Builds the header from the group's first row's data, and warns when the
   * following rows carry different values or when the file's derived fields
   * don't match the default rule.
   */
  private buildHeaderInput(
    group: PhantomItemGroup,
    result: ImportResultDto,
  ): Record<string, unknown> & { formulaOverrides: FormulaMap } {
    const first = group.rows[0].values;
    const headerFields = [
      'finishedProductType',
      'workInProcessType',
      'phantomRootCode',
      'kvaRatingStandard',
      'unitOfMeasure',
    ];

    group.rows.slice(1).forEach((row) => {
      headerFields.forEach((field) => {
        const value = this.asText(row.values[field]);
        const reference = this.asText(first[field]);
        if (value && value !== reference) {
          result.warnings.push(
            this.issue(
              row.rowNumber,
              getColumnByField(field)?.header ?? field,
              `Differs from the item's first row ("${value}" vs "${reference}"). The first row's value is kept.`,
            ),
          );
        }
      });
    });

    const header = {
      finishedProductType: this.asText(first.finishedProductType),
      workInProcessType: this.asText(first.workInProcessType),
      phantomRootCode: this.asText(first.phantomRootCode),
      // No trim: this field's leading separator is significant
      kvaRatingStandard: this.asRawText(first.kvaRatingStandard),
      itemCode: group.itemCode,
      unitOfMeasure: this.asText(first.unitOfMeasure),
      reference: this.asText(first.reference),
      itemDescription: this.asText(first.itemDescription),
      shortDescription: this.asText(first.shortDescription),
      formulaOverrides: {} as FormulaMap,
    };

    // If the file brings a derived value different from the calculated one,
    // the file's value is kept and marked literal, to avoid losing real data.
    this.preserveIfDifferent(
      header,
      'reference',
      buildReference(header),
      group.rows[0].rowNumber,
      result,
    );
    this.preserveIfDifferent(
      header,
      'shortDescription',
      buildShortDescription(header),
      group.rows[0].rowNumber,
      result,
    );

    return header;
  }

  private preserveIfDifferent(
    header: Record<string, unknown> & { formulaOverrides: FormulaMap },
    field: string,
    computed: string,
    rowNumber: number,
    result: ImportResultDto,
  ): void {
    const fromFile = this.asText(header[field]);
    if (!fromFile || fromFile === computed) return;

    header.formulaOverrides[field] = `="${fromFile.replace(/"/g, '""')}"`;
    result.warnings.push(
      this.issue(
        rowNumber,
        getColumnByField(field)?.header ?? field,
        `The file has "${fromFile}" and the default rule computes "${computed}". The file's value is kept.`,
      ),
    );
  }

  /** Returns null if the row has errors that prevent creating the component */
  private buildComponentInput(
    row: RawRow,
    sortOrder: number,
    result: ImportResultDto,
  ): CreatePhantomItemComponentDto | null {
    const values = row.values;
    const componentItemCode = this.asText(values.componentItemCode);

    if (!componentItemCode) {
      result.errors.push(
        this.issue(
          row.rowNumber,
          'ÍTEM - COMPONENTE',
          'The row has no component item.',
        ),
      );
      return null;
    }

    const baseQuantity = parseQuantity(values.baseQuantity);
    if (baseQuantity === null) {
      result.errors.push(
        this.issue(
          row.rowNumber,
          'CANT. BASE',
          `Value "${this.asText(values.baseQuantity) || '(empty)'}" is not numeric.`,
        ),
      );
      return null;
    }

    const requiredQuantity = parseQuantity(values.requiredQuantity);
    if (requiredQuantity === null) {
      result.errors.push(
        this.issue(
          row.rowNumber,
          'CANT. REQUERIDA',
          `Value "${this.asText(values.requiredQuantity) || '(empty)'}" is not numeric.`,
        ),
      );
      return null;
    }

    const wastePercentage = parsePercentage(values.wastePercentage);

    return {
      componentItemCode,
      description: this.asText(values.description) || undefined,
      baseQuantity,
      requiredQuantity,
      componentUnitOfMeasure:
        this.asText(values.componentUnitOfMeasure) || undefined,
      wastePercentage: wastePercentage ?? undefined,
      consumptionWarehouse:
        this.asText(values.consumptionWarehouse) || undefined,
      sortOrder,
    };
  }

  private asText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  /** Preserves the leading space; `mapRow` already trimmed the trailing one */
  private asRawText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trimEnd();
  }

  private issue(
    row: number,
    column: string | undefined,
    message: string,
  ): ImportIssueDto {
    return { row, column, message };
  }

  /** Extracts a readable message from the validator's BadRequestException */
  private describeValidationError(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as {
        errors?: Record<string, string[]>;
      };
      if (response?.errors) {
        return Object.entries(response.errors)
          .map(([field, messages]) => `${field}: ${messages.join(' ')}`)
          .join(' | ');
      }
    }
    return error instanceof Error ? error.message : String(error);
  }

  /** Expected columns, so the client can display the template */
  getExpectedColumns() {
    return PHANTOM_ITEM_COLUMNS.map((column) => ({
      letter: column.letter,
      header: column.header,
      field: column.field,
      derived: column.derived ?? false,
    }));
  }
}
