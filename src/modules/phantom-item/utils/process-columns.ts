/**
 * Columns of a process: which ones it uses, in which order and with which
 * header. Pure functions, shared by the process service, the importer and
 * the exporter.
 *
 * A column is either a catalog field (typed, validated, with its derived
 * rules) or one of the process's own text columns, whose key starts with
 * `custom:`. The same catalog field can carry a different header in each
 * process — «CANT. REQUERIDA LMS» in EMBLEMADO — and is still the same field.
 */

import {
  PHANTOM_ITEM_COLUMNS,
  PhantomItemFieldScope,
  getColumnByField,
  normalizeHeader,
} from '../constants/phantom-item-columns';
import { PhantomColumnScope } from '../entities/phantom-process-column.entity';
import { resolveField } from './xlsx-header-mapper';

export const CUSTOM_PREFIX = 'custom:';

/** The family column, always first in the workbook. Not part of a process's columns. */
export const FAMILY_HEADER = 'Fantasma';
export const FAMILY_KEY = '__family';

/**
 * Columns a process cannot drop: without them a row can't be grouped into a
 * phantom item or turned into a component.
 */
export const REQUIRED_KEYS = [
  'itemCode',
  'componentItemCode',
  'baseQuantity',
  'requiredQuantity',
];

/**
 * Columns of the business's workbook that are out of scope for now (the
 * phantom's relation with BOM structures and design templates). When a new
 * process is inferred from a sheet they are reported as ignored instead of
 * becoming own columns.
 */
export const OUT_OF_SCOPE_HEADERS = ['estructura lm', 'plantillas diseno'];

export interface ProcessColumnDef {
  key: string;
  header: string;
  scope: PhantomColumnScope;
}

export const isCustomKey = (key: string): boolean =>
  key.startsWith(CUSTOM_PREFIX);

/** `custom:` key for a header: «MAYOR 1» → `custom:mayor_1` */
export const customKeyFor = (header: string): string =>
  CUSTOM_PREFIX +
  normalizeHeader(header)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Where a column's values live: a catalog field's own scope, or the declared one */
export const scopeOf = (column: ProcessColumnDef): PhantomColumnScope => {
  if (isCustomKey(column.key)) return column.scope;
  const catalog = getColumnByField(column.key);
  return catalog?.scope === PhantomItemFieldScope.COMPONENT
    ? PhantomColumnScope.COMPONENT
    : PhantomColumnScope.HEADER;
};

/** The catalog as it was before processes existed: what the «General» process uses */
export const defaultProcessColumns = (): ProcessColumnDef[] =>
  PHANTOM_ITEM_COLUMNS.map((column) => ({
    key: column.field,
    header: column.header,
    scope:
      column.scope === PhantomItemFieldScope.COMPONENT
        ? PhantomColumnScope.COMPONENT
        : PhantomColumnScope.HEADER,
  }));

/** Problems with a process's column list; empty if it is valid */
export const validateProcessColumns = (
  columns: ProcessColumnDef[],
): string[] => {
  const problems: string[] = [];
  const keys = new Set<string>();
  const headers = new Set<string>();

  for (const column of columns) {
    const header = column.header?.trim() ?? '';
    if (header === '') problems.push('Every column needs a header.');
    if (header.length > 100)
      problems.push(`Header "${header}" is longer than 100 characters.`);
    if (!isCustomKey(column.key) && !getColumnByField(column.key)) {
      problems.push(`"${column.key}" is not a known column.`);
    }
    if (isCustomKey(column.key) && column.key === CUSTOM_PREFIX) {
      problems.push(`Own column "${header}" needs a key.`);
    }
    if (keys.has(column.key))
      problems.push(`Column "${column.key}" is repeated.`);
    keys.add(column.key);

    const normalized = normalizeHeader(header);
    if (normalized === normalizeHeader(FAMILY_HEADER)) {
      problems.push(`"${FAMILY_HEADER}" is reserved for the family column.`);
    }
    if (headers.has(normalized))
      problems.push(`Header "${header}" is repeated.`);
    headers.add(normalized);
  }

  for (const required of REQUIRED_KEYS) {
    if (!keys.has(required)) {
      problems.push(
        `Column "${getColumnByField(required)?.header ?? required}" cannot be removed.`,
      );
    }
  }

  return problems;
};

/**
 * Normalized header → column key for a process. Besides the process's own
 * header, a catalog column also answers to its canonical header and its
 * known aliases, so a workbook exported before a rename still imports.
 */
export const headerMatcher = (
  columns: ProcessColumnDef[],
): Map<string, string> => {
  const matcher = new Map<string, string>();
  matcher.set(normalizeHeader(FAMILY_HEADER), FAMILY_KEY);
  for (const column of columns) {
    matcher.set(normalizeHeader(column.header), column.key);
  }
  const used = new Set(columns.map((column) => column.key));
  for (const catalog of PHANTOM_ITEM_COLUMNS) {
    if (!used.has(catalog.field)) continue;
    const canonical = normalizeHeader(catalog.header);
    if (!matcher.has(canonical)) matcher.set(canonical, catalog.field);
  }
  return matcher;
};

/** Resolves one header with a matcher, falling back on the catalog's aliases */
export const matchHeader = (
  matcher: Map<string, string>,
  columns: ProcessColumnDef[],
  rawHeader: string,
): string | undefined => {
  const normalized = normalizeHeader(rawHeader);
  if (normalized === '') return undefined;
  const direct = matcher.get(normalized);
  if (direct) return direct;
  const alias = resolveField(rawHeader);
  return alias && columns.some((column) => column.key === alias)
    ? alias
    : undefined;
};

export interface InferredColumns {
  columns: ProcessColumnDef[];
  /** Headers that are not columns of the new process */
  ignored: string[];
}

/**
 * The columns of a new process, from the header row of its sheet.
 *
 * Catalog headers (and their aliases) become catalog columns with the sheet's
 * own label. Other headers become own text columns, and their scope follows
 * the workbook's layout: left of the first component column they describe the
 * phantom item (PLAN1, MAYOR1… sit between UM and ÍTEM - COMPONENTE), right
 * of it they describe each line. Repeated headers keep the first occurrence.
 */
export const inferProcessColumns = (headerRow: unknown[]): InferredColumns => {
  const headers = headerRow.map((value) =>
    value === null || value === undefined ? '' : String(value).trim(),
  );

  const firstComponentIndex = headers.findIndex((header) => {
    const field = header ? resolveField(header) : undefined;
    return (
      field !== undefined &&
      getColumnByField(field)?.scope === PhantomItemFieldScope.COMPONENT
    );
  });

  const columns: ProcessColumnDef[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  headers.forEach((header, index) => {
    if (header === '') return;
    const normalized = normalizeHeader(header);
    if (normalized === normalizeHeader(FAMILY_HEADER)) return;
    if (OUT_OF_SCOPE_HEADERS.includes(normalized)) {
      ignored.push(header);
      return;
    }

    const field = resolveField(header);
    const key = field ?? customKeyFor(header);
    if (seen.has(key)) return;
    seen.add(key);

    columns.push({
      key,
      header,
      scope: field
        ? scopeOf({ key: field, header, scope: PhantomColumnScope.COMPONENT })
        : firstComponentIndex !== -1 && index > firstComponentIndex
          ? PhantomColumnScope.COMPONENT
          : PhantomColumnScope.HEADER,
    });
  });

  return { columns, ignored };
};

/** Process names compare without case, accents or extra whitespace */
export const sameName = (a: string, b: string): boolean =>
  normalizeHeader(a) === normalizeHeader(b);
