import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_REFERENCE_LIMITS,
  DEFAULT_REFERENCE_LIMIT,
  PHANTOM_ITEM_COLUMNS,
  PhantomItemFieldScope,
  getColumnByField,
  resolveColumn,
} from '../constants/phantom-item-columns';

/** `field -> expression` map that overrides the default rule */
export type FormulaMap = Record<string, string>;

export interface HeaderDerivationInput {
  finishedProductType?: string;
  workInProcessType?: string;
  phantomRootCode?: string;
  kvaRatingStandard?: string;
  reference?: string;
  itemDescription?: string;
  shortDescription?: string;
  referenceLengthLimit?: number;
  formulaOverrides?: FormulaMap;
}

export interface ComponentDerivationInput {
  baseQuantity?: number;
  requiredQuantity?: number;
  requiredQuantityPerUnit?: number;
  formulaOverrides?: FormulaMap;
}

export interface DerivedLengths {
  referenceLength: number;
  itemDescriptionLength: number;
  shortDescriptionLength: number;
}

/** Serializes/deserializes the `formula_overrides` JSON column without breaking on corrupt data */
export const parseFormulaOverrides = (raw?: string | null): FormulaMap => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as FormulaMap) : {};
  } catch {
    return {};
  }
};

export const serializeFormulaOverrides = (
  formulaOverrides?: FormulaMap,
): string | null => {
  if (!formulaOverrides || Object.keys(formulaOverrides).length === 0)
    return null;
  return JSON.stringify(formulaOverrides);
};

/**
 * Default rule for `reference`.
 *
 * The separator before `kvaRatingStandard` travels inside the field itself:
 * in the KIT EMBLE template it is `-GY-GENERICO-AD-AZ` (own hyphen) and in
 * the KIT ENCU one ` 43_3/4_4H_125` (own space). That's why it's a direct
 * concatenation.
 */
export const buildReference = (input: HeaderDerivationInput): string =>
  `F-${input.finishedProductType ?? ''}-${input.workInProcessType ?? ''}-${
    input.phantomRootCode ?? ''
  }${input.kvaRatingStandard ?? ''}`;

export const buildShortDescription = (input: HeaderDerivationInput): string =>
  `FANTASMA ${input.phantomRootCode ?? ''}`;

export const buildRequiredQuantityPerUnit = (
  input: ComponentDerivationInput,
): number | null => {
  const base = Number(input.baseQuantity);
  const required = Number(input.requiredQuantity);
  if (!Number.isFinite(base) || base === 0) return null;
  if (!Number.isFinite(required)) return null;
  return required / base;
};

/**
 * Applies the header's default rules. A field with its own formula in
 * `formulaOverrides` keeps the value sent by the client: the grid already
 * evaluated it and the backend doesn't recalculate it (see design.md,
 * decision 2).
 */
export const applyHeaderDerivedFields = <T extends HeaderDerivationInput>(
  input: T,
): T &
  Required<
    Pick<
      HeaderDerivationInput,
      'reference' | 'itemDescription' | 'shortDescription'
    >
  > => {
  const formulaOverrides = input.formulaOverrides ?? {};

  const reference = formulaOverrides.reference
    ? (input.reference ?? '')
    : buildReference(input);

  const itemDescription = formulaOverrides.itemDescription
    ? (input.itemDescription ?? '')
    : reference;

  const shortDescription = formulaOverrides.shortDescription
    ? (input.shortDescription ?? '')
    : buildShortDescription(input);

  return { ...input, reference, itemDescription, shortDescription };
};

export const applyComponentDerivedFields = <T extends ComponentDerivationInput>(
  input: T,
): T & { requiredQuantityPerUnit: number | null } => {
  const formulaOverrides = input.formulaOverrides ?? {};

  const requiredQuantityPerUnit = formulaOverrides.requiredQuantityPerUnit
    ? (input.requiredQuantityPerUnit ?? null)
    : buildRequiredQuantityPerUnit(input);

  return { ...input, requiredQuantityPerUnit };
};

const LENGTH_FORMULA_PATTERN = /^=\s*LARGO\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*$/i;

/**
 * Resolves a `=LARGO(<field>)` length formula to the field that must be
 * measured. The identifier can be either the field name (`reference`) or the
 * template's column letter (`F`).
 *
 * @throws BadRequestException if the formula doesn't have the expected shape
 *         or points to a column that doesn't exist.
 */
export const resolveLengthSource = (
  lengthField: string,
  formula: string,
): string => {
  const match = LENGTH_FORMULA_PATTERN.exec(formula.trim());
  if (!match) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: {
        [`formulaOverrides.${lengthField}`]: [
          `Formula "${formula}" is not valid. Expected the form =LARGO(field).`,
        ],
      },
    });
  }

  const column = resolveColumn(match[1]);
  if (!column || column.scope === PhantomItemFieldScope.LENGTH) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: {
        [`formulaOverrides.${lengthField}`]: [
          `Formula references unknown column "${match[1]}".`,
        ],
      },
    });
  }

  return column.field;
};

/** Default formula of each length column, to expose it to the client */
export const getDefaultLengthFormula = (lengthField: string): string => {
  const column = getColumnByField(lengthField);
  return `=LARGO(${column?.defaultLengthSource ?? ''})`;
};

/**
 * Calculates the three lengths by measuring the field indicated by the
 * record's own formula, or the column's default field when there is none.
 */
export const calculateLengths = (
  header: HeaderDerivationInput,
): DerivedLengths => {
  const formulaOverrides = header.formulaOverrides ?? {};
  const lengths: Record<string, number> = {};

  PHANTOM_ITEM_COLUMNS.filter(
    (column) => column.scope === PhantomItemFieldScope.LENGTH,
  ).forEach((column) => {
    const sourceField = formulaOverrides[column.field]
      ? resolveLengthSource(column.field, formulaOverrides[column.field])
      : column.defaultLengthSource;

    const value = header[sourceField as keyof HeaderDerivationInput];
    lengths[column.field] = String(value ?? '').length;
  });

  return lengths as unknown as DerivedLengths;
};

export const resolveReferenceLimit = (limit?: number): number => {
  if (limit === undefined || limit === null) return DEFAULT_REFERENCE_LIMIT;
  return limit;
};

/**
 * Validates that each length fits its limit. `itemDescriptionLength` and
 * `shortDescriptionLength` use the template's fixed limits;
 * `referenceLength` uses the phantom item's own limit.
 */
export const validateLengths = (header: HeaderDerivationInput): void => {
  const referenceLengthLimit = resolveReferenceLimit(
    header.referenceLengthLimit,
  );

  if (!ALLOWED_REFERENCE_LIMITS.includes(referenceLengthLimit)) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: {
        referenceLengthLimit: [
          `Only the values ${ALLOWED_REFERENCE_LIMITS.join(' and ')} are allowed.`,
        ],
      },
    });
  }

  const lengths = calculateLengths(header);
  const errors: Record<string, string[]> = {};

  PHANTOM_ITEM_COLUMNS.filter(
    (column) => column.scope === PhantomItemFieldScope.LENGTH,
  ).forEach((column) => {
    const limit = column.lengthLimit ?? referenceLengthLimit;
    const actual = lengths[column.field as keyof DerivedLengths];
    if (actual > limit) {
      const sourceField = (header.formulaOverrides ?? {})[column.field]
        ? resolveLengthSource(
            column.field,
            header.formulaOverrides[column.field],
          )
        : column.defaultLengthSource;
      errors[sourceField] = [
        `Measures ${actual} characters and exceeds the limit of ${limit} (column "${column.header}").`,
      ];
    }
  });

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({ message: 'Validation failed', errors });
  }
};
