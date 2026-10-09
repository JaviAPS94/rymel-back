import { BadRequestException } from '@nestjs/common';
import {
  applyComponentDerivedFields,
  applyHeaderDerivedFields,
  buildRequiredQuantityPerUnit,
  buildShortDescription,
  buildReference,
  calculateLengths,
  getDefaultLengthFormula,
  parseFormulaOverrides,
  resolveLengthSource,
  serializeFormulaOverrides,
  validateLengths,
} from './derived-fields';

// Data taken from the real migration templates
const KIT_EMBLE = {
  finishedProductType: '1CA',
  workInProcessType: 'TPI',
  phantomRootCode: 'KIT EMBLE',
  kvaRatingStandard: '-GY-GENERICO-AD-AZ',
};

const KIT_ENCU = {
  finishedProductType: '3CV',
  workInProcessType: 'EEN',
  phantomRootCode: 'KIT ENCU',
  kvaRatingStandard: ' 43_3/4_4H_125',
};

describe('derived-fields', () => {
  describe('buildReference', () => {
    it('builds the KIT EMBLE reference with 37 characters', () => {
      const reference = buildReference(KIT_EMBLE);
      expect(reference).toBe('F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ');
      expect(reference).toHaveLength(37);
    });

    it('builds the KIT ENCU reference with 32 characters', () => {
      const reference = buildReference(KIT_ENCU);
      expect(reference).toBe('F-3CV-EEN-KIT ENCU 43_3/4_4H_125');
      expect(reference).toHaveLength(32);
    });

    it('tolerates a missing kvaRatingStandard', () => {
      expect(
        buildReference({ ...KIT_EMBLE, kvaRatingStandard: undefined }),
      ).toBe('F-1CA-TPI-KIT EMBLE');
    });
  });

  describe('buildReference with the process rule', () => {
    it('adds the space the formula of ALISTAMIENTO Y ENCUBE adds', () => {
      expect(
        buildReference({
          finishedProductType: '1AU',
          workInProcessType: 'EEN',
          phantomRootCode: 'KIT ALIS',
          kvaRatingStandard: '0-75 KVA GT',
          referenceSeparator: ' ',
        }),
      ).toBe('F-1AU-EEN-KIT ALIS 0-75 KVA GT');
    });

    it('adds nothing in EMBLEMADO, whose kVA brings its own hyphen', () => {
      expect(buildReference({ ...KIT_EMBLE, referenceSeparator: '' })).toBe(
        buildReference(KIT_EMBLE),
      );
    });
  });

  describe('buildShortDescription', () => {
    it('prepends FANTASMA to the root code', () => {
      const shortDescription = buildShortDescription(KIT_EMBLE);
      expect(shortDescription).toBe('FANTASMA KIT EMBLE');
      expect(shortDescription).toHaveLength(18);
    });
  });

  describe('buildRequiredQuantityPerUnit', () => {
    it('divides required quantity by base quantity', () => {
      expect(
        buildRequiredQuantityPerUnit({
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ).toBeCloseTo(0.0987, 6);
    });

    it('calculates 0.135 for 13.50 over 100', () => {
      expect(
        buildRequiredQuantityPerUnit({
          baseQuantity: 100,
          requiredQuantity: 13.5,
        }),
      ).toBeCloseTo(0.135, 6);
    });

    it('returns null when base quantity is zero', () => {
      expect(
        buildRequiredQuantityPerUnit({ baseQuantity: 0, requiredQuantity: 4 }),
      ).toBeNull();
    });

    it('returns null when required quantity is not numeric', () => {
      expect(
        buildRequiredQuantityPerUnit({
          baseQuantity: 1,
          requiredQuantity: undefined,
        }),
      ).toBeNull();
    });
  });

  describe('applyHeaderDerivedFields', () => {
    it('derives reference, itemDescription and shortDescription', () => {
      const result = applyHeaderDerivedFields({ ...KIT_EMBLE });
      expect(result.reference).toBe('F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ');
      expect(result.itemDescription).toBe(result.reference);
      expect(result.shortDescription).toBe('FANTASMA KIT EMBLE');
    });

    it('respects the client value when the field has its own formula', () => {
      const result = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        shortDescription: 'OTRA COSA',
        formulaOverrides: { shortDescription: '="OTRA COSA"' },
      });
      expect(result.shortDescription).toBe('OTRA COSA');
      // fields without their own formula keep being derived
      expect(result.reference).toBe('F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ');
    });
  });

  describe('applyComponentDerivedFields', () => {
    it('derives the per-unit quantity', () => {
      const result = applyComponentDerivedFields({
        baseQuantity: 100,
        requiredQuantity: 0.72,
      });
      expect(result.requiredQuantityPerUnit).toBeCloseTo(0.0072, 6);
    });

    it('respects the client value when there is an own formula', () => {
      const result = applyComponentDerivedFields({
        baseQuantity: 100,
        requiredQuantity: 9.87,
        requiredQuantityPerUnit: 0.1974,
        formulaOverrides: { requiredQuantityPerUnit: '=P3/O3*2' },
      });
      expect(result.requiredQuantityPerUnit).toBe(0.1974);
    });
  });

  describe('calculateLengths', () => {
    it('measures the default fields', () => {
      const header = applyHeaderDerivedFields({ ...KIT_EMBLE });
      expect(calculateLengths(header)).toEqual({
        referenceLength: 37,
        itemDescriptionLength: 37,
        shortDescriptionLength: 18,
      });
    });

    it('measures KIT ENCU with a 32-character reference', () => {
      const header = applyHeaderDerivedFields({ ...KIT_ENCU });
      expect(calculateLengths(header)).toEqual({
        referenceLength: 32,
        itemDescriptionLength: 32,
        shortDescriptionLength: 17,
      });
    });

    it('measures a different column when the formula says so', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        formulaOverrides: { referenceLength: '=LARGO(shortDescription)' },
      });
      expect(calculateLengths(header).referenceLength).toBe(18);
      expect(calculateLengths(header).itemDescriptionLength).toBe(37);
    });

    it('accepts the template column letter', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        formulaOverrides: { shortDescriptionLength: '=LARGO(H)' },
      });
      expect(calculateLengths(header).shortDescriptionLength).toBe(37);
    });
  });

  describe('resolveLengthSource', () => {
    it('resolves by field name', () => {
      expect(
        resolveLengthSource('itemDescriptionLength', '=LARGO(reference)'),
      ).toBe('reference');
    });

    it('resolves by column letter', () => {
      expect(resolveLengthSource('itemDescriptionLength', '=LARGO(J)')).toBe(
        'shortDescription',
      );
    });

    it('tolerates spaces and lowercase', () => {
      expect(
        resolveLengthSource(
          'itemDescriptionLength',
          '= largo ( itemDescription )',
        ),
      ).toBe('itemDescription');
    });

    it('rejects an unknown field', () => {
      expect(() =>
        resolveLengthSource('shortDescriptionLength', '=LARGO(noExiste)'),
      ).toThrow(BadRequestException);
    });

    it('rejects pointing to another length column', () => {
      expect(() =>
        resolveLengthSource(
          'shortDescriptionLength',
          '=LARGO(itemDescriptionLength)',
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a formula with a different shape', () => {
      expect(() =>
        resolveLengthSource('shortDescriptionLength', '=A1+B1'),
      ).toThrow(BadRequestException);
    });
  });

  describe('validateLengths', () => {
    it('accepts a phantom item within the limits', () => {
      const header = applyHeaderDerivedFields({ ...KIT_EMBLE });
      expect(() => validateLengths(header)).not.toThrow();
    });

    it('rejects a 45-character reference with the default limit', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        phantomRootCode: 'KIT EMBLE EXTRA LARGO PARA PROBAR',
      });
      expect(() => validateLengths(header)).toThrow(BadRequestException);
    });

    it('accepts that same reference when the limit is 50', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        phantomRootCode: 'KIT EMBLE LARGO',
        referenceLengthLimit: 50,
        // itemDescriptionLength has a fixed limit of 40, so it's measured over a short field
        formulaOverrides: {
          itemDescriptionLength: '=LARGO(finishedProductType)',
          shortDescriptionLength: '=LARGO(finishedProductType)',
        },
      });
      expect(calculateLengths(header).referenceLength).toBeGreaterThan(40);
      expect(() => validateLengths(header)).not.toThrow();
    });

    it('accepts «Desc. item» over 40 with a warning, as METALMECANICA has it', () => {
      // 500558: «Desc. item» copies a 42-character reference
      const header = applyHeaderDerivedFields({
        finishedProductType: '1AU',
        workInProcessType: 'TSO',
        phantomRootCode: 'KITSOLD',
        kvaRatingStandard: '>=75KVA/D(28-54)CM/M12 HR',
        referenceLengthLimit: 50,
        formulaOverrides: {
          shortDescriptionLength: '=LARGO(finishedProductType)',
        },
      });

      expect(header.itemDescription).toHaveLength(42);
      expect(validateLengths(header)).toEqual({
        itemDescription:
          'Measures 42 characters and exceeds the limit of 40 (column "Largo 40").',
      });
    });

    it('rejects a reference limit other than 40 or 50', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        referenceLengthLimit: 45,
      });
      expect(() => validateLengths(header)).toThrow(BadRequestException);
    });

    it('rejects a short description longer than 20 characters', () => {
      const header = applyHeaderDerivedFields({
        ...KIT_EMBLE,
        phantomRootCode: 'KIT ENCUBRIMIENTO XL',
      });
      expect(calculateLengths(header).shortDescriptionLength).toBe(29);
      expect(() => validateLengths(header)).toThrow(BadRequestException);
    });
  });

  describe('formula overrides serialization', () => {
    it('serializes and deserializes a map', () => {
      const formulaOverrides = { requiredQuantityPerUnit: '=P3/O3' };
      expect(
        parseFormulaOverrides(serializeFormulaOverrides(formulaOverrides)),
      ).toEqual(formulaOverrides);
    });

    it('returns null for an empty map', () => {
      expect(serializeFormulaOverrides({})).toBeNull();
      expect(serializeFormulaOverrides(undefined)).toBeNull();
    });

    it('returns an empty map on corrupt JSON', () => {
      expect(parseFormulaOverrides('{no es json')).toEqual({});
      expect(parseFormulaOverrides(null)).toEqual({});
    });
  });

  describe('getDefaultLengthFormula', () => {
    it('exposes the default formula of each length column', () => {
      expect(getDefaultLengthFormula('referenceLength')).toBe(
        '=LARGO(reference)',
      );
      expect(getDefaultLengthFormula('itemDescriptionLength')).toBe(
        '=LARGO(itemDescription)',
      );
      expect(getDefaultLengthFormula('shortDescriptionLength')).toBe(
        '=LARGO(shortDescription)',
      );
    });
  });
});
