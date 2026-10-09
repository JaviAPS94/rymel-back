import { BadRequestException } from '@nestjs/common';
import {
  PHANTOM_ITEM_COLUMNS,
  PhantomItemFieldScope,
  REQUIRED_IMPORT_HEADERS,
  normalizeHeader,
} from '../constants/phantom-item-columns';

/** `model field -> column index (1-based, as ExcelJS)` map */
export type ColumnIndexMap = Record<string, number>;

export interface HeaderDetectionResult {
  headerRowNumber: number;
  columnIndexes: ColumnIndexMap;
}

/** Rows scanned looking for the header before giving up */
const MAX_HEADER_SCAN_ROWS = 10;

/**
 * How many known columns must appear in a row to consider it the header.
 * Avoids confusing it with the limits row (40, 40, 20) that the real
 * template has above it.
 */
const MIN_MATCHES_TO_ACCEPT = 5;

const normalizedHeaderToField = new Map(
  PHANTOM_ITEM_COLUMNS.map((column) => [
    normalizeHeader(column.header),
    column.field,
  ]),
);

/** Variants found in real files that aren't identical to the canonical header */
const HEADER_ALIASES: Record<string, string> = {
  'raiz fantasma': 'phantomRootCode',
  'r kva + norma / otros': 'kvaRatingStandard',
  'r kva + norma/otros': 'kvaRatingStandard',
  'r kva norma otros': 'kvaRatingStandard',
  'item - componente': 'componentItemCode',
  'item-componente': 'componentItemCode',
  'largo 40/50': 'referenceLength',
  'largo 40 50': 'referenceLength',
  'desc item': 'itemDescription',
  'desc. item': 'itemDescription',
  'desc corta': 'shortDescription',
  'desc. corta': 'shortDescription',
  'cant base': 'baseQuantity',
  'cant. base': 'baseQuantity',
  'cant requerida': 'requiredQuantity',
  'cant. requerida': 'requiredQuantity',
  // EMBLEMADO's name for the same quantity
  'cant requerida lms': 'requiredQuantity',
  'cant. requerida lms': 'requiredQuantity',
  'cant requerida unitaria': 'requiredQuantityPerUnit',
  'cant. requerida unitaria': 'requiredQuantityPerUnit',
  'u.m': 'componentUnitOfMeasure',
  um: 'unitOfMeasure',
  '% desp.': 'wastePercentage',
  '% desp': 'wastePercentage',
  // METALMECANICA's name for the same waste percentage
  '% desp. lamina': 'wastePercentage',
  '% desp lamina': 'wastePercentage',
  'bodega consumo': 'consumptionWarehouse',
};

export const resolveField = (rawHeader: string): string | undefined => {
  const normalized = normalizeHeader(rawHeader);
  if (!normalized) return undefined;
  return normalizedHeaderToField.get(normalized) ?? HEADER_ALIASES[normalized];
};

/**
 * Counts how many known columns a row brings. Used to pick the header
 * without depending on it being at a fixed row.
 */
export const matchHeaderRow = (values: unknown[]): ColumnIndexMap => {
  const columnIndexes: ColumnIndexMap = {};

  values.forEach((value, index) => {
    if (value === null || value === undefined) return;
    const field = resolveField(String(value));
    if (!field) return;
    // On repeated headers the first one wins, matching the template's order

    if (columnIndexes[field] === undefined) {
      columnIndexes[field] = index;
    }
  });

  return columnIndexes;
};

/**
 * Scans the first rows looking for the one containing the headers and
 * returns the `field -> column index` map.
 *
 * @throws BadRequestException if it can't find the header, or if required
 *         columns are missing.
 */
export const detectHeaderRow = (
  rows: { rowNumber: number; values: unknown[] }[],
): HeaderDetectionResult => {
  let best: HeaderDetectionResult | null = null;
  let bestMatches = 0;

  for (const row of rows.slice(0, MAX_HEADER_SCAN_ROWS)) {
    const columnIndexes = matchHeaderRow(row.values);
    const matches = Object.keys(columnIndexes).length;

    if (matches > bestMatches) {
      bestMatches = matches;
      best = { headerRowNumber: row.rowNumber, columnIndexes };
    }
  }

  if (!best || bestMatches < MIN_MATCHES_TO_ACCEPT) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: {
        file: [
          'Could not find the header row in the first ' +
            `${MAX_HEADER_SCAN_ROWS} rows of the file.`,
        ],
      },
    });
  }

  assertRequiredColumns(best.columnIndexes);
  return best;
};

export const assertRequiredColumns = (columnIndexes: ColumnIndexMap): void => {
  const missing = REQUIRED_IMPORT_HEADERS.filter((header) => {
    const column = PHANTOM_ITEM_COLUMNS.find((c) => c.header === header);
    return !column || columnIndexes[column.field] === undefined;
  });

  if (missing.length > 0) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: {
        file: [`Required columns missing in the file: ${missing.join(', ')}.`],
      },
    });
  }
};

/** Fields the import reads from the file (derived ones are recalculated) */
export const READABLE_FIELDS = PHANTOM_ITEM_COLUMNS.filter(
  (column) => column.scope !== PhantomItemFieldScope.LENGTH,
).map((column) => column.field);
