/**
 * Lectura y escritura de las celdas de un sub-diseño.
 *
 * `sub_design.data` no tiene una sola forma. En la base conviven tres:
 *
 *   - 23 sub-diseños con envoltorio: `{ id, name, cells, columnWidths, rowHeights }`
 *   - 4 con las celdas directamente en la raíz: `{ A1: {...}, A2: {...} }`
 *   - 10 con un objeto vacío
 *
 * El formato con envoltorio es el que escribe project-front hoy; el plano es
 * anterior. Cualquier cosa que toque estos datos tiene que soportar los dos y,
 * sobre todo, **devolverlos en la misma forma en que los encontró**: reescribir
 * un sub-diseño antiguo con la forma nueva sería un cambio de formato colado
 * dentro de un recálculo, y nadie lo esperaría.
 */

/** Una celda tal como la guarda el diseñador. */
export interface StoredCell {
  /** Lo que escribió el usuario: un literal o una fórmula que empieza por `=`. */
  formula?: string;
  value?: unknown;
  /** Resultado calculado. */
  computed?: unknown;
  [extra: string]: unknown;
}

export type StoredCells = Record<string, StoredCell>;

const looksLikeCell = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  ('formula' in value || 'computed' in value || 'value' in value);

/** `true` si el objeto es un mapa de celdas y no un envoltorio de hoja. */
const isCellMap = (data: Record<string, unknown>): boolean =>
  Object.values(data).some(looksLikeCell);

export interface ParsedSubDesign {
  /** Documento completo, para volver a serializarlo conservando su forma. */
  document: Record<string, unknown>;
  /** Celdas, referenciadas dentro del documento (mutarlas muta el documento). */
  cells: StoredCells;
  /** `true` si las celdas viven bajo `cells`, `false` si están en la raíz. */
  wrapped: boolean;
}

/**
 * Interpreta `sub_design.data`. Devuelve `null` si no hay celdas que recalcular.
 */
export const parseSubDesignData = (
  raw: string | null | undefined,
): ParsedSubDesign | null => {
  if (raw === null || raw === undefined || raw.trim() === '') return null;

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  ) {
    return null;
  }

  const record = document as Record<string, unknown>;

  const wrappedCells = record.cells;
  if (wrappedCells !== null && typeof wrappedCells === 'object') {
    return {
      document: record,
      cells: wrappedCells as StoredCells,
      wrapped: true,
    };
  }

  if (isCellMap(record)) {
    return { document: record, cells: record as StoredCells, wrapped: false };
  }

  return null;
};

/** Vuelve a serializar conservando la forma original. */
export const serializeSubDesignData = (parsed: ParsedSubDesign): string =>
  JSON.stringify(parsed.document);

/** `true` si la celda contiene una fórmula y no un valor escrito a mano. */
export const isFormulaCell = (cell: StoredCell | undefined): boolean =>
  typeof cell?.formula === 'string' && cell.formula.trimStart().startsWith('=');

/** Referencias de las celdas que llevan fórmula. */
export const formulaCellRefs = (cells: StoredCells): string[] =>
  Object.keys(cells).filter((ref) => isFormulaCell(cells[ref]));

/**
 * Códigos de función personalizada que invocan las celdas.
 *
 * El código se reconoce como unidad léxica completa: `ASSOCIATE_COST` no debe
 * contar como una invocación de `COST`.
 */
export const invokedFunctionCodes = (
  cells: StoredCells,
  knownCodes: readonly string[],
): string[] =>
  knownCodes.filter((code) => {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${code}\\s*\\(`);
    return Object.values(cells).some(
      (cell) => isFormulaCell(cell) && pattern.test(cell.formula as string),
    );
  });
