import {
  parseLocaleNumber,
  parsePercentage,
  parseQuantity,
} from './parse-locale-number';

describe('parse-locale-number', () => {
  describe('parseQuantity', () => {
    it('reads decimal comma', () => {
      expect(parseQuantity('100,00')).toBe(100);
      expect(parseQuantity('9,87')).toBe(9.87);
      expect(parseQuantity('0,0987')).toBeCloseTo(0.0987, 6);
      expect(parseQuantity('13,50')).toBe(13.5);
    });

    it('reads decimal point', () => {
      expect(parseQuantity('0.135')).toBe(0.135);
      expect(parseQuantity('16.66')).toBe(16.66);
    });

    it('reads integers', () => {
      expect(parseQuantity('1')).toBe(1);
      expect(parseQuantity('48')).toBe(48);
    });

    it('reads thousands separator with decimal comma', () => {
      expect(parseQuantity('1.234,56')).toBe(1234.56);
      expect(parseQuantity('12.345.678,9')).toBeCloseTo(12345678.9, 4);
    });

    it('reads thousands separator with decimal point', () => {
      expect(parseQuantity('1,234.56')).toBe(1234.56);
    });

    it('reads negative numbers', () => {
      expect(parseQuantity('-9,87')).toBe(-9.87);
    });

    it('passes ExcelJS numbers through untouched', () => {
      expect(parseQuantity(100)).toBe(100);
      expect(parseQuantity(0.0987)).toBe(0.0987);
    });

    it('returns null for non-numeric values', () => {
      expect(parseQuantity('N/A')).toBeNull();
      expect(parseQuantity('')).toBeNull();
      expect(parseQuantity('   ')).toBeNull();
      expect(parseQuantity(null)).toBeNull();
      expect(parseQuantity(undefined)).toBeNull();
      expect(parseQuantity('12,34,56 kg')).toBeNull();
    });

    it('returns null for infinity and NaN', () => {
      expect(parseQuantity(Number.NaN)).toBeNull();
      expect(parseQuantity(Number.POSITIVE_INFINITY)).toBeNull();
    });
  });

  describe('parsePercentage', () => {
    it('converts the % suffix to a fraction', () => {
      expect(parsePercentage('0%')).toBe(0);
      expect(parsePercentage('5%')).toBe(0.05);
      expect(parsePercentage('2,5%')).toBe(0.025);
      expect(parsePercentage('100%')).toBe(1);
    });

    it('interprets values up to 1 as a fraction', () => {
      expect(parsePercentage(0.05)).toBe(0.05);
      expect(parsePercentage('0,03')).toBe(0.03);
    });

    it('interprets values greater than 1 as a percentage', () => {
      expect(parsePercentage(5)).toBe(0.05);
    });

    it('returns null when not numeric', () => {
      expect(parsePercentage('sin dato')).toBeNull();
      expect(parsePercentage('')).toBeNull();
    });
  });

  describe('parseLocaleNumber', () => {
    it('reports whether the value carried a percentage suffix', () => {
      expect(parseLocaleNumber('5%')).toEqual({ value: 5, isPercentage: true });
      expect(parseLocaleNumber('5')).toEqual({ value: 5, isPercentage: false });
    });
  });
});
