import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomColumnScope } from '../entities/phantom-process-column.entity';
import { PhantomItemService } from './phantom-item.service';
import { PhantomProcessService, ProcessView } from './phantom-process.service';
import {
  PhantomItemImportMode,
  ImportIssueDto,
  ImportResultDto,
  SheetImportSummaryDto,
} from '../dtos/import-phantom-items.dto';
import { CreatePhantomItemComponentDto } from '../dtos/phantom-item-component.dto';
import { resolveField } from '../utils/xlsx-header-mapper';
import {
  buildShortDescription,
  buildReference,
  FormulaMap,
  REFERENCE_SEPARATORS,
} from '../utils/derived-fields';
import {
  ALLOWED_REFERENCE_LIMITS,
  DEFAULT_REFERENCE_LIMIT,
  getColumnByField,
  normalizeHeader,
  PHANTOM_ITEM_COLUMNS,
} from '../constants/phantom-item-columns';
import { parsePercentage, parseQuantity } from '../utils/parse-locale-number';
import {
  FAMILY_HEADER,
  FAMILY_KEY,
  ProcessColumnDef,
  headerMatcher,
  inferProcessColumns,
  isCustomKey,
  matchHeader,
  scopeOf,
} from '../utils/process-columns';
import { ExtraValues, cleanExtraValues } from '../utils/extra-values';

/**
 * A sheet to import: from a workbook, or the block pasted into a process.
 * Values are 1-based, as ExcelJS gives them.
 */
export interface SheetInput {
  name: string;
  hidden: boolean;
  rows: { rowNumber: number; values: unknown[] }[];
  /** Set when the sheet belongs to a known process (pasting) */
  processId?: number;
  /** Pasted blocks may come without headers: then the process's order applies */
  allowPositional?: boolean;
}

/** A data row already read from the sheet, by column key */
interface RawRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

/** Consecutive rows that share the same `Item` */
interface PhantomItemGroup {
  itemCode: string;
  rows: RawRow[];
}

/** How one sheet is read: its process, its columns and where each one is */
interface SheetPlan {
  sheet: SheetInput;
  process?: ProcessView;
  columns: ProcessColumnDef[];
  newProcess: boolean;
  headerRowNumber: number;
  /** Column key → candidate indexes (more than one when a header repeats) */
  candidates: Map<string, number[]>;
  ignored: string[];
  /** The process's reference rule; inferred from the sheet for a new one */
  referenceSeparator?: string;
}

const MAX_HEADER_SCAN_ROWS = 10;

/** Known columns a row must bring to be taken as the header */
const MIN_MATCHES_TO_ACCEPT = 5;

const REQUIRED_FOR_ROWS = ['itemCode', 'componentItemCode'];

/** Catalog fields whose leading whitespace is significant */
const RAW_TEXT_FIELDS = new Set(
  PHANTOM_ITEM_COLUMNS.filter((column) => column.preserveLeadingWhitespace).map(
    (column) => column.field,
  ),
);

/** Catalog header fields compared across the rows of a group */
const HEADER_FIELDS = [
  'finishedProductType',
  'workInProcessType',
  'phantomRootCode',
  'kvaRatingStandard',
  'unitOfMeasure',
];

/**
 * Imports phantom items from the business's workbook: one sheet per plant
 * process, each read with the columns of its process.
 *
 * A file and a pasted block go through the same path (`importSheets`), so
 * pasting cannot accept what importing rejects. In upsert mode only the
 * items present are touched: a workbook with one new phantom item adds it and
 * leaves the rest alone.
 */
@Injectable()
export class PhantomItemImportService {
  private readonly logger = new Logger(PhantomItemImportService.name);

  constructor(
    @InjectRepository(PhantomItem)
    private readonly phantomItemRepository: Repository<PhantomItem>,
    private readonly phantomItemService: PhantomItemService,
    private readonly dataSource: DataSource,
    private readonly processes: PhantomProcessService,
  ) {}

  async import(
    filePath: string,
    mode: PhantomItemImportMode,
    dryRun: boolean,
  ): Promise<ImportResultDto> {
    return this.importSheets(await this.readWorkbook(filePath), mode, dryRun);
  }

  /**
   * Imports a block copied from Excel into a process. Tab-separated, one
   * line per row; the first line may be the header row.
   */
  async importPasted(
    processId: number,
    text: string,
    mode: PhantomItemImportMode,
    dryRun: boolean,
  ): Promise<ImportResultDto> {
    const process = await this.processes.findOrFail(processId);
    const lines = (text ?? '').replace(/\r/g, '').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '')
      lines.pop();

    const rows = lines
      .map((line, index) => ({
        rowNumber: index + 1,
        // 1-based like ExcelJS: index 0 is never a column
        values: [
          null,
          ...line.split('\t').map((cell) => (cell === '' ? null : cell)),
        ],
      }))
      .filter((row) =>
        row.values.some((value, index) => index > 0 && value !== null),
      );

    if (rows.length === 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { text: ['There is nothing to paste.'] },
      });
    }

    return this.importSheets(
      [
        {
          name: process.name,
          hidden: false,
          rows,
          processId,
          allowPositional: true,
        },
      ],
      mode,
      dryRun,
    );
  }

  async importSheets(
    sheets: SheetInput[],
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
      sheets: [],
    };

    const visible = sheets.filter((sheet) => !sheet.hidden);
    for (const sheet of sheets.filter((item) => item.hidden)) {
      result.warnings.push({
        sheet: sheet.name,
        row: 0,
        message: 'Hidden sheet: not imported.',
      });
      result.sheets.push(
        this.summary(sheet.name, sheet.name, { hidden: true }),
      );
    }

    const plans: SheetPlan[] = [];
    const headerProblems: ImportIssueDto[] = [];
    for (const sheet of visible) {
      try {
        plans.push(await this.plan(sheet));
      } catch (error) {
        headerProblems.push({
          sheet: sheet.name,
          row: 0,
          message: this.describeValidationError(error),
        });
      }
    }

    // Nothing readable at all: the file is rejected, as before processes
    if (plans.length === 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          file:
            headerProblems.length > 0
              ? headerProblems.map((issue) =>
                  sheets.length > 1
                    ? `${issue.sheet}: ${issue.message}`
                    : issue.message,
                )
              : ['The file does not contain any sheets with data.'],
        },
      });
    }
    result.errors.push(...headerProblems);

    for (const plan of plans) {
      await this.importSheet(plan, mode, dryRun, result);
    }

    return result;
  }

  // --- Reading ------------------------------------------------------------

  /**
   * Reads every sheet of the workbook.
   *
   * The non-streaming reader is used on purpose: exceljs 4.4's
   * `WorkbookReader` accesses `this.model.sheets` before `xl/workbook.xml`
   * has been parsed when the zip carries `sharedStrings` ahead of the
   * workbook, and fails with "Cannot read properties of undefined (reading
   * 'sheets')" on every file with text — which is all of ours. The
   * endpoint's 10 MB limit bounds what this can cost in memory; the real
   * workbook, with 5,235 lines, weighs 1.1 MB.
   */
  private async readWorkbook(filePath: string): Promise<SheetInput[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets = workbook.worksheets.map((worksheet) => {
      const rows: SheetInput['rows'] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        rows.push({ rowNumber, values: this.toPlainValues(row) });
      });
      return {
        name: worksheet.name,
        hidden: worksheet.state !== 'visible',
        rows,
      };
    });

    if (sheets.every((sheet) => sheet.rows.length === 0)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { file: ['The file does not contain any sheets with data.'] },
      });
    }
    return sheets.filter((sheet) => sheet.rows.length > 0);
  }

  /** Normalizes ExcelJS values into a flat, 1-based array */
  private toPlainValues(row: ExcelJS.Row): unknown[] {
    const raw = row.values as unknown[];
    if (!Array.isArray(raw)) return [];

    return raw.map((cell) => {
      if (cell === null || cell === undefined) return null;
      // Formula cells: the result matters, not the expression
      if (typeof cell === 'object' && !(cell instanceof Date)) {
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

  /**
   * Decides how to read a sheet: which process it goes to, which row is the
   * header, and where each column is.
   */
  private async plan(sheet: SheetInput): Promise<SheetPlan> {
    const process = sheet.processId
      ? await this.processes.findOrFail(sheet.processId)
      : await this.processes.findByName(sheet.name);

    const scan = sheet.rows.slice(0, MAX_HEADER_SCAN_ROWS);

    if (process) {
      const matcher = headerMatcher(process.columns);
      let best: {
        rowNumber: number;
        candidates: Map<string, number[]>;
        matches: number;
        values: unknown[];
      } | null = null;
      for (const row of scan) {
        const candidates = this.locate(row.values, (header) =>
          matchHeader(matcher, process.columns, header),
        );
        const matches = [...candidates.keys()].filter(
          (key) => key !== FAMILY_KEY,
        ).length;
        if (!best || matches > best.matches)
          best = {
            rowNumber: row.rowNumber,
            candidates,
            matches,
            values: row.values,
          };
      }

      if (best && best.matches >= MIN_MATCHES_TO_ACCEPT) {
        this.assertRequired(best.candidates, process.columns);
        return {
          sheet,
          process,
          columns: process.columns,
          newProcess: false,
          headerRowNumber: best.rowNumber,
          candidates: best.candidates,
          ignored: this.unmatchedHeaders(best.values, best.candidates),
        };
      }

      // A pasted block without its header: the columns of the process, in order
      if (sheet.allowPositional) {
        const candidates = new Map<string, number[]>([[FAMILY_KEY, [1]]]);
        process.columns.forEach((column, index) =>
          candidates.set(column.key, [index + 2]),
        );
        return {
          sheet,
          process,
          columns: process.columns,
          newProcess: false,
          headerRowNumber: 0,
          candidates,
          ignored: [],
        };
      }

      throw this.headerNotFound();
    }

    // A sheet without a process: its columns are inferred from its header row
    let best: { rowNumber: number; values: unknown[]; matches: number } | null =
      null;
    for (const row of scan) {
      const matches = new Set(
        row.values
          .map((value) =>
            value === null || value === undefined
              ? undefined
              : resolveField(String(value)),
          )
          .filter((field): field is string => field !== undefined),
      ).size;
      if (!best || matches > best.matches)
        best = { rowNumber: row.rowNumber, values: row.values, matches };
    }
    if (!best || best.matches < MIN_MATCHES_TO_ACCEPT)
      throw this.headerNotFound();

    const inferred = inferProcessColumns(best.values.slice(1));
    const matcher = headerMatcher(inferred.columns);
    const candidates = this.locate(best.values, (header) =>
      matchHeader(matcher, inferred.columns, header),
    );
    this.assertRequired(candidates, inferred.columns);

    return {
      sheet,
      columns: inferred.columns,
      newProcess: true,
      headerRowNumber: best.rowNumber,
      candidates,
      ignored: inferred.ignored,
    };
  }

  /** Column key → every index whose header resolves to it */
  private locate(
    values: unknown[],
    resolve: (header: string) => string | undefined,
  ): Map<string, number[]> {
    const candidates = new Map<string, number[]>();
    values.forEach((value, index) => {
      if (index === 0 || value === null || value === undefined) return;
      const key = resolve(String(value));
      if (!key) return;
      candidates.set(key, [...(candidates.get(key) ?? []), index]);
    });
    return candidates;
  }

  private assertRequired(
    candidates: Map<string, number[]>,
    columns: ProcessColumnDef[],
  ): void {
    const missing = REQUIRED_FOR_ROWS.filter((key) => !candidates.has(key)).map(
      (key) =>
        columns.find((column) => column.key === key)?.header ??
        getColumnByField(key)?.header ??
        key,
    );
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          file: [
            `Required columns missing in the file: ${missing.join(', ')}.`,
          ],
        },
      });
    }
  }

  private headerNotFound(): BadRequestException {
    return new BadRequestException({
      message: 'Validation failed',
      errors: {
        file: [
          'Could not find the header row in the first ' +
            `${MAX_HEADER_SCAN_ROWS} rows of the file.`,
        ],
      },
    });
  }

  /** Headers of the row that the process doesn't use (family excluded) */
  private unmatchedHeaders(
    values: unknown[],
    candidates: Map<string, number[]>,
  ): string[] {
    const used = new Set([...candidates.values()].flat());
    return values
      .map((value, index) => ({
        index,
        header:
          value === null || value === undefined ? '' : String(value).trim(),
      }))
      .filter(
        ({ index, header }) => index > 0 && header !== '' && !used.has(index),
      )
      .filter(
        ({ header }) =>
          normalizeHeader(header) !== normalizeHeader(FAMILY_HEADER),
      )
      .map(({ header }) => header);
  }

  /**
   * Picks one index per column. A repeated header (METALMECANICA's two
   * «Item») resolves to the one that carries data; if more than one does and
   * they disagree, the first with data wins and it is reported.
   */
  private resolveIndexes(
    plan: SheetPlan,
    dataRows: SheetInput['rows'],
    result: ImportResultDto,
  ): Map<string, number> {
    const indexes = new Map<string, number>();
    for (const [key, candidates] of plan.candidates) {
      if (candidates.length === 1) {
        indexes.set(key, candidates[0]);
        continue;
      }
      // The column with the most data wins: in METALMECANICA the first «Item»
      // holds a label on 6 rows and the second one the codes on 2,642
      const filled = candidates.map((index) => ({
        index,
        count: dataRows.filter((row) => this.asText(row.values[index]) !== '')
          .length,
      }));
      const chosen = filled.reduce((best, candidate) =>
        candidate.count > best.count ? candidate : best,
      );
      indexes.set(key, chosen.index);
      const withData = filled
        .filter((candidate) => candidate.count > 0)
        .map((candidate) => candidate.index);
      if (withData.length > 1) {
        const differ = dataRows.some(
          (row) =>
            new Set(withData.map((index) => this.asText(row.values[index])))
              .size > 1,
        );
        if (differ) {
          result.warnings.push({
            sheet: plan.sheet.name,
            row: plan.headerRowNumber,
            column: this.headerOf(plan, key),
            message:
              'The header is repeated with different data in each column; the one with the most data is used.',
          });
        }
      }
    }
    return indexes;
  }

  private mapRow(
    values: unknown[],
    indexes: Map<string, number>,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [key, index] of indexes) {
      const value = values[index];
      if (typeof value !== 'string') {
        mapped[key] = value;
        continue;
      }
      // In `kvaRatingStandard` the leading space is the reference's
      // separator: trimming it would change the calculated reference.
      mapped[key] = RAW_TEXT_FIELDS.has(key) ? value.trimEnd() : value.trim();
    }
    return mapped;
  }

  /**
   * A row with nothing but the family is blank: the business's workbook drags
   * «Fantasma» down past the last line of a phantom item.
   */
  private isEmptyRow(values: Record<string, unknown>): boolean {
    return Object.entries(values).every(
      ([key, value]) =>
        key === FAMILY_KEY ||
        value === null ||
        value === undefined ||
        value === '',
    );
  }

  // --- Writing ------------------------------------------------------------

  private async importSheet(
    plan: SheetPlan,
    mode: PhantomItemImportMode,
    dryRun: boolean,
    result: ImportResultDto,
  ): Promise<void> {
    const dataRows = plan.sheet.rows.filter(
      (row) => row.rowNumber > plan.headerRowNumber,
    );
    const indexes = this.resolveIndexes(plan, dataRows, result);
    const rows: RawRow[] = dataRows
      .map((row) => ({
        rowNumber: row.rowNumber,
        values: this.mapRow(row.values, indexes),
      }))
      .filter((row) => !this.isEmptyRow(row.values));
    result.rowsRead += rows.length;

    const summary = this.summary(
      plan.sheet.name,
      plan.process?.name ?? plan.sheet.name,
      {
        processId: plan.process?.id,
        newProcess: plan.newProcess,
        ignoredColumns: plan.ignored,
        columns: plan.newProcess ? plan.columns : [],
      },
    );
    result.sheets.push(summary);

    for (const header of plan.ignored) {
      result.warnings.push({
        sheet: plan.sheet.name,
        row: plan.headerRowNumber,
        column: header,
        message: 'The process does not use this column: it is ignored.',
      });
    }

    const groups = this.groupByItemCode(plan, rows, result);
    plan.referenceSeparator =
      plan.process?.referenceSeparator ?? this.inferReferenceSeparator(groups);
    summary.referenceSeparator = plan.referenceSeparator;

    let processId = plan.process?.id;
    if (plan.newProcess && !dryRun) {
      const created = await this.processes.create(
        plan.sheet.name,
        plan.columns,
        { referenceSeparator: plan.referenceSeparator },
      );
      processId = created.id;
      summary.processId = created.id;
    }

    summary.phantomItemsDetected = groups.length;
    result.phantomItemsDetected += groups.length;

    for (const group of groups) {
      await this.processGroup(
        group,
        plan,
        processId,
        mode,
        dryRun,
        result,
        summary,
      );
    }
  }

  /** Groups consecutive rows that share the same `Item` */
  private groupByItemCode(
    plan: SheetPlan,
    rows: RawRow[],
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
          this.issue(
            plan,
            row.rowNumber,
            'itemCode',
            'The row has no header item.',
          ),
        );
      }
    }

    return groups;
  }

  private async processGroup(
    group: PhantomItemGroup,
    plan: SheetPlan,
    processId: number | undefined,
    mode: PhantomItemImportMode,
    dryRun: boolean,
    result: ImportResultDto,
    summary: SheetImportSummaryDto,
  ): Promise<void> {
    const headerRow = group.rows[0];
    const header = this.buildHeaderInput(group, plan, result);
    const familyName = this.asText(headerRow.values[FAMILY_KEY]);

    const components: CreatePhantomItemComponentDto[] = [];
    let hasRowErrors = false;

    // Numbered among the accepted lines: a rejected row leaves no gap, so
    // exporting and importing again gives back the same order
    group.rows.forEach((row) => {
      const component = this.buildComponentInput(
        plan,
        row,
        components.length,
        result,
      );
      if (component) components.push(component);
      else hasRowErrors = true;
    });

    if (hasRowErrors && components.length === 0) {
      this.count(result, summary, 'skipped');
      return;
    }

    const existing = await this.phantomItemRepository.findOne({
      where: { itemCode: group.itemCode, deletedAt: IsNull() },
    });

    if (existing && mode === PhantomItemImportMode.CREATE) {
      this.count(result, summary, 'skipped');
      result.errors.push(
        this.issue(
          plan,
          headerRow.rowNumber,
          'itemCode',
          `A phantom item with item code ${group.itemCode} already exists. Use upsert mode to update it.`,
        ),
      );
      return;
    }

    // An item that exists in another process moves to the sheet's one
    const moves =
      existing !== null &&
      (processId === undefined || existing.processId !== processId);
    if (moves) {
      summary.moved += 1;
      result.warnings.push(
        this.issue(
          plan,
          headerRow.rowNumber,
          'itemCode',
          `Item ${group.itemCode} is in another process and moves to "${summary.processName}".`,
        ),
      );
    }

    // The header is validated before touching the database, so a length
    // error is reported as a row, not as a whole-file failure.
    let headerEntity: Partial<PhantomItem>;
    try {
      const checked = this.phantomItemService.buildHeaderChecked(header);
      headerEntity = checked.header;
      for (const [field, message] of Object.entries(checked.warnings)) {
        result.warnings.push(
          this.issue(plan, headerRow.rowNumber, field, `${message} Accepted.`),
        );
      }
    } catch (error) {
      this.count(result, summary, 'skipped');
      result.errors.push(
        this.issue(
          plan,
          headerRow.rowNumber,
          'reference',
          this.describeValidationError(error),
        ),
      );
      return;
    }

    if (dryRun) {
      this.count(result, summary, existing ? 'updated' : 'created');
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(PhantomItem);
        const familyId = familyName
          ? await this.processes.getOrCreateFamily(
              processId as number,
              familyName,
              manager,
            )
          : null;
        const entity = { ...headerEntity, processId, familyId };

        if (existing) {
          await repository.update(existing.id, entity);
          await this.phantomItemService.replaceComponents(
            manager,
            existing.id,
            components,
          );
        } else {
          const saved = await repository.save(entity);
          await this.phantomItemService.replaceComponents(
            manager,
            saved.id,
            components,
          );
        }
      });

      this.count(result, summary, existing ? 'updated' : 'created');
    } catch (error) {
      this.logger.error(
        `Failed to write phantom item ${group.itemCode}`,
        error instanceof Error ? error.stack : String(error),
      );
      this.count(result, summary, 'skipped');
      result.errors.push(
        this.issue(
          plan,
          headerRow.rowNumber,
          'itemCode',
          `Could not save phantom item ${group.itemCode}: ${this.describeValidationError(error)}`,
        ),
      );
    }
  }

  private count(
    result: ImportResultDto,
    summary: SheetImportSummaryDto,
    key: 'created' | 'updated' | 'skipped',
  ): void {
    result[key] += 1;
    summary[key] += 1;
  }

  /** Own columns of the process with the given scope */
  private ownColumns(
    plan: SheetPlan,
    scope: PhantomColumnScope,
  ): ProcessColumnDef[] {
    return plan.columns.filter(
      (column) => isCustomKey(column.key) && scopeOf(column) === scope,
    );
  }

  /**
   * Builds the header from the group's first row's data, and warns when the
   * following rows carry different values or when the file's derived fields
   * don't match the default rule.
   */
  private buildHeaderInput(
    group: PhantomItemGroup,
    plan: SheetPlan,
    result: ImportResultDto,
  ): Record<string, unknown> & {
    formulaOverrides: FormulaMap;
    extraValues: ExtraValues;
  } {
    const first = group.rows[0].values;
    const ownHeader = this.ownColumns(plan, PhantomColumnScope.HEADER);
    const compared = [
      ...HEADER_FIELDS,
      ...ownHeader.map((column) => column.key),
      FAMILY_KEY,
    ];

    group.rows.slice(1).forEach((row) => {
      compared.forEach((key) => {
        const value = this.asText(row.values[key]);
        const reference = this.asText(first[key]);
        if (value && value !== reference) {
          result.warnings.push(
            this.issue(
              plan,
              row.rowNumber,
              key,
              `Differs from the item's first row ("${value}" vs "${reference}"). The first row's value is kept.`,
            ),
          );
        }
      });
    });

    const header = {
      ...this.referenceParts(first),
      referenceSeparator: plan.referenceSeparator ?? '',
      referenceLengthLimit: DEFAULT_REFERENCE_LIMIT,
      itemCode: group.itemCode,
      unitOfMeasure: this.asText(first.unitOfMeasure),
      reference: this.asText(first.reference),
      itemDescription: this.asText(first.itemDescription),
      shortDescription: this.asText(first.shortDescription),
      formulaOverrides: {} as FormulaMap,
      extraValues: cleanExtraValues(
        Object.fromEntries(
          ownHeader.map((column) => [column.key, first[column.key]]),
        ),
      ),
    };

    // If the file brings a derived value different from the calculated one,
    // the file's value is kept and marked literal, to avoid losing real data.
    this.preserveIfDifferent(
      plan,
      header,
      'reference',
      buildReference(header),
      group.rows[0].rowNumber,
      result,
    );
    this.preserveIfDifferent(
      plan,
      header,
      'shortDescription',
      buildShortDescription(header),
      group.rows[0].rowNumber,
      result,
    );

    // «Largo 40/50»: the workbook does not say which limit each phantom item
    // uses, its length does. 46 references in METALMECANICA measure 41 to 50.
    const reference = header.formulaOverrides.reference
      ? header.reference
      : buildReference(header);
    if (reference.length > DEFAULT_REFERENCE_LIMIT) {
      header.referenceLengthLimit = Math.max(...ALLOWED_REFERENCE_LIMITS);
    }

    return header;
  }

  /** The fields the reference is built from, as the row brings them */
  private referenceParts(values: Record<string, unknown>) {
    return {
      finishedProductType: this.asText(values.finishedProductType),
      workInProcessType: this.asText(values.workInProcessType),
      phantomRootCode: this.asText(values.phantomRootCode),
      // No trim: this field's leading separator is significant
      kvaRatingStandard: this.asRawText(values.kvaRatingStandard),
    };
  }

  /**
   * The reference rule a new process's sheet follows: the separator whose
   * reference matches the file in more phantom items. EMBLEMADO matches
   * without one; the other sheets, with a space. A tie keeps none, the rule
   * the system always had.
   */
  private inferReferenceSeparator(groups: PhantomItemGroup[]): string {
    const matches = REFERENCE_SEPARATORS.map((separator) => ({
      separator,
      count: groups.filter((group) => {
        const first = group.rows[0].values;
        const fromFile = this.asText(first.reference);
        return (
          fromFile !== '' &&
          buildReference({
            ...this.referenceParts(first),
            referenceSeparator: separator,
          }) === fromFile
        );
      }).length,
    }));
    return matches.reduce((best, candidate) =>
      candidate.count > best.count ? candidate : best,
    ).separator;
  }

  private preserveIfDifferent(
    plan: SheetPlan,
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
        plan,
        rowNumber,
        field,
        `The file has "${fromFile}" and the default rule computes "${computed}". The file's value is kept.`,
      ),
    );
  }

  /** Returns null if the row has errors that prevent creating the component */
  private buildComponentInput(
    plan: SheetPlan,
    row: RawRow,
    sortOrder: number,
    result: ImportResultDto,
  ): CreatePhantomItemComponentDto | null {
    const values = row.values;
    const componentItemCode = this.asText(values.componentItemCode);

    if (!componentItemCode) {
      result.errors.push(
        this.issue(
          plan,
          row.rowNumber,
          'componentItemCode',
          'The row has no component item.',
        ),
      );
      return null;
    }

    const baseQuantity = parseQuantity(values.baseQuantity);
    if (baseQuantity === null) {
      result.errors.push(
        this.issue(
          plan,
          row.rowNumber,
          'baseQuantity',
          `Value "${this.asText(values.baseQuantity) || '(empty)'}" is not numeric.`,
        ),
      );
      return null;
    }

    const requiredQuantity = parseQuantity(values.requiredQuantity);
    if (requiredQuantity === null) {
      result.errors.push(
        this.issue(
          plan,
          row.rowNumber,
          'requiredQuantity',
          `Value "${this.asText(values.requiredQuantity) || '(empty)'}" is not numeric.`,
        ),
      );
      return null;
    }

    const wastePercentage = parsePercentage(values.wastePercentage);
    const ownLine = this.ownColumns(plan, PhantomColumnScope.COMPONENT);

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
      extraValues: cleanExtraValues(
        Object.fromEntries(
          ownLine.map((column) => [column.key, values[column.key]]),
        ),
      ),
    };
  }

  private summary(
    sheet: string,
    processName: string,
    overrides: Partial<SheetImportSummaryDto>,
  ): SheetImportSummaryDto {
    return {
      sheet,
      processName,
      newProcess: false,
      hidden: false,
      phantomItemsDetected: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      moved: 0,
      ignoredColumns: [],
      columns: [],
      ...overrides,
    };
  }

  /** The label a column carries in this sheet's process */
  private headerOf(plan: SheetPlan, key: string): string {
    if (key === FAMILY_KEY) return FAMILY_HEADER;
    return (
      plan.columns.find((column) => column.key === key)?.header ??
      getColumnByField(key)?.header ??
      key
    );
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
    plan: SheetPlan,
    row: number,
    key: string,
    message: string,
  ): ImportIssueDto {
    return {
      sheet: plan.sheet.name,
      row,
      column: this.headerOf(plan, key),
      message,
    };
  }

  /** Extracts a readable message from the validator's BadRequestException */
  private describeValidationError(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as {
        errors?: Record<string, string[]>;
      };
      if (response?.errors) {
        return Object.entries(response.errors)
          .map(([field, messages]) =>
            field === 'file'
              ? messages.join(' ')
              : `${field}: ${messages.join(' ')}`,
          )
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
