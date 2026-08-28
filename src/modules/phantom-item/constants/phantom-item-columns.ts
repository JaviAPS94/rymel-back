/**
 * Column map for the phantom item Excel template.
 *
 * This is the single source of truth relating the file's column letter, the
 * header label as it appears in the sheet, and the model field. Consumed by
 * the importer, the exporter and the `=LARGO(...)` formula resolver.
 *
 * The header labels are the external system's own vocabulary (Spanish,
 * abbreviated) and must match the real template exactly — they are not
 * translated. Only `field` (our internal model) is English.
 */

export enum PhantomItemFieldScope {
  /** Header field (`phantom_item`) */
  HEADER = 'HEADER',
  /** Material line field (`phantom_item_component`) */
  COMPONENT = 'COMPONENT',
  /** Calculated length, never stored */
  LENGTH = 'LENGTH',
}

export interface PhantomItemColumn {
  /** Column letter in the template (A..T) */
  letter: string;
  /** Header label exactly as it appears in the sheet */
  header: string;
  /** Model field */
  field: string;
  scope: PhantomItemFieldScope;
  /** true if the system calculates it from other fields */
  derived?: boolean;
  /** Length columns only: field measured by default */
  defaultLengthSource?: string;
  /** Length columns only: fixed limit, or null if configurable */
  lengthLimit?: number | null;
  /** true if the importer should read it as a number */
  numeric?: boolean;
  /**
   * true if the value's leading whitespace is significant and must not be
   * trimmed. Applies to `kvaRatingStandard`, whose separator (hyphen or
   * space) travels inside the field itself and determines how the
   * reference is assembled.
   */
  preserveLeadingWhitespace?: boolean;
}

export const PHANTOM_ITEM_COLUMNS: PhantomItemColumn[] = [
  {
    letter: 'A',
    header: 'Tipo PT',
    field: 'finishedProductType',
    scope: PhantomItemFieldScope.HEADER,
  },
  {
    letter: 'B',
    header: 'Tipo PP',
    field: 'workInProcessType',
    scope: PhantomItemFieldScope.HEADER,
  },
  {
    letter: 'C',
    header: 'Raiz Fantasma',
    field: 'phantomRootCode',
    scope: PhantomItemFieldScope.HEADER,
  },
  {
    letter: 'D',
    header: 'R kVA + Norma / Otros',
    field: 'kvaRatingStandard',
    scope: PhantomItemFieldScope.HEADER,
    preserveLeadingWhitespace: true,
  },
  {
    letter: 'E',
    header: 'Item',
    field: 'itemCode',
    scope: PhantomItemFieldScope.HEADER,
  },
  {
    letter: 'F',
    header: 'Referencia',
    field: 'reference',
    scope: PhantomItemFieldScope.HEADER,
    derived: true,
  },
  {
    letter: 'G',
    header: 'Largo 40/50',
    field: 'referenceLength',
    scope: PhantomItemFieldScope.LENGTH,
    derived: true,
    defaultLengthSource: 'reference',
    // Configurable per record via `referenceLengthLimit` (40 or 50)
    lengthLimit: null,
  },
  {
    letter: 'H',
    header: 'Desc. item',
    field: 'itemDescription',
    scope: PhantomItemFieldScope.HEADER,
    derived: true,
  },
  {
    letter: 'I',
    header: 'Largo 40',
    field: 'itemDescriptionLength',
    scope: PhantomItemFieldScope.LENGTH,
    derived: true,
    defaultLengthSource: 'itemDescription',
    lengthLimit: 40,
  },
  {
    letter: 'J',
    header: 'Desc. corta',
    field: 'shortDescription',
    scope: PhantomItemFieldScope.HEADER,
    derived: true,
  },
  {
    letter: 'K',
    header: 'Largo 20',
    field: 'shortDescriptionLength',
    scope: PhantomItemFieldScope.LENGTH,
    derived: true,
    defaultLengthSource: 'shortDescription',
    lengthLimit: 20,
  },
  {
    letter: 'L',
    header: 'UM',
    field: 'unitOfMeasure',
    scope: PhantomItemFieldScope.HEADER,
  },
  {
    letter: 'M',
    header: 'ÍTEM - COMPONENTE',
    field: 'componentItemCode',
    scope: PhantomItemFieldScope.COMPONENT,
  },
  {
    letter: 'N',
    header: 'DESCRIPCIÓN',
    field: 'description',
    scope: PhantomItemFieldScope.COMPONENT,
  },
  {
    letter: 'O',
    header: 'CANT. BASE',
    field: 'baseQuantity',
    scope: PhantomItemFieldScope.COMPONENT,
    numeric: true,
  },
  {
    letter: 'P',
    header: 'CANT. REQUERIDA',
    field: 'requiredQuantity',
    scope: PhantomItemFieldScope.COMPONENT,
    numeric: true,
  },
  {
    letter: 'Q',
    header: 'CANT. REQUERIDA UNITARIA',
    field: 'requiredQuantityPerUnit',
    scope: PhantomItemFieldScope.COMPONENT,
    derived: true,
    numeric: true,
  },
  {
    letter: 'R',
    header: 'U.M',
    field: 'componentUnitOfMeasure',
    scope: PhantomItemFieldScope.COMPONENT,
  },
  {
    letter: 'S',
    header: '% DESP.',
    field: 'wastePercentage',
    scope: PhantomItemFieldScope.COMPONENT,
    numeric: true,
  },
  {
    letter: 'T',
    header: 'BODEGA CONSUMO',
    field: 'consumptionWarehouse',
    scope: PhantomItemFieldScope.COMPONENT,
  },
];

/** Columns without which the import cannot be resolved */
export const REQUIRED_IMPORT_HEADERS = ['Item', 'ÍTEM - COMPONENTE'];

/** Allowed limits for `referenceLength`, chosen per phantom item */
export const ALLOWED_REFERENCE_LIMITS = [40, 50];
export const DEFAULT_REFERENCE_LIMIT = 40;

const byField = new Map(PHANTOM_ITEM_COLUMNS.map((c) => [c.field, c]));
const byLetter = new Map(PHANTOM_ITEM_COLUMNS.map((c) => [c.letter, c]));

export const getColumnByField = (
  field: string,
): PhantomItemColumn | undefined => byField.get(field);

export const getColumnByLetter = (
  letter: string,
): PhantomItemColumn | undefined => byLetter.get(letter.toUpperCase());

/**
 * Resolves a column identifier that can come either as a field name
 * (`reference`) or as the template's column letter (`F`).
 */
export const resolveColumn = (
  identifier: string,
): PhantomItemColumn | undefined => {
  const trimmed = identifier.trim();
  return byField.get(trimmed) ?? byLetter.get(trimmed.toUpperCase());
};

/** Normalizes a header label for comparison, stripping accents, casing and extra whitespace */
export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
