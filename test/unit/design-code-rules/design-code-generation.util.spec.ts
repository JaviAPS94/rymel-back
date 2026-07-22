import {
  assembleDesignCode,
  buildSuffixToken,
  numberToLetters,
} from '../../../src/modules/design-code-rules/services/design-code-generation.util';
import { DesignCodeSuffixPattern } from '../../../src/modules/design-code-rules/enums/design-code-suffix-pattern.enum';

describe('design-code-generation.util', () => {
  describe('numberToLetters', () => {
    it('converts 1-26 into A-Z', () => {
      expect(numberToLetters(1)).toBe('A');
      expect(numberToLetters(2)).toBe('B');
      expect(numberToLetters(26)).toBe('Z');
    });

    it('rolls over into AA after Z', () => {
      expect(numberToLetters(27)).toBe('AA');
      expect(numberToLetters(28)).toBe('AB');
    });
  });

  describe('buildSuffixToken', () => {
    it('builds a letter token pegado al año', () => {
      expect(buildSuffixToken(DesignCodeSuffixPattern.LETTER_SUFFIX, 1)).toBe(
        'A',
      );
      expect(buildSuffixToken(DesignCodeSuffixPattern.LETTER_SUFFIX, 2)).toBe(
        'B',
      );
    });

    it('builds a letter token con guion', () => {
      expect(
        buildSuffixToken(DesignCodeSuffixPattern.LETTER_SUFFIX_DASH, 1),
      ).toBe('-A');
    });

    it('builds a numeric token pegado al año', () => {
      expect(buildSuffixToken(DesignCodeSuffixPattern.NUMERIC_SUFFIX, 1)).toBe(
        '1',
      );
    });

    it('builds a numeric token con guion', () => {
      expect(
        buildSuffixToken(DesignCodeSuffixPattern.NUMERIC_SUFFIX_DASH, 1),
      ).toBe('-1');
    });
  });

  describe('assembleDesignCode', () => {
    it('matches the example from the design-code-generation spec', () => {
      const code = assembleDesignCode({
        phase: '1',
        powerLetter: 'D',
        primaryTensionLetter: 'A',
        secondaryTensionLetter: 'A',
        year: '26',
        moValue: 'MO',
        materialDevanadoValue: 'AL',
        countryCode: 'CO',
        finalSegment: 'CV',
      });

      expect(code).toBe('1DAA26MOAL-CO CV');
    });

    it('inserts the disambiguation token right after the year segment', () => {
      const code = assembleDesignCode({
        phase: '1',
        powerLetter: 'D',
        primaryTensionLetter: 'A',
        secondaryTensionLetter: 'A',
        year: '26',
        disambiguationToken: 'A',
        moValue: 'MO',
        materialDevanadoValue: 'AL',
        countryCode: 'CO',
        finalSegment: 'CV',
      });

      expect(code).toBe('1DAA26AMOAL-CO CV');
    });

    it('supports a dashed numeric disambiguation token', () => {
      const code = assembleDesignCode({
        phase: '1',
        powerLetter: 'D',
        primaryTensionLetter: 'A',
        secondaryTensionLetter: 'A',
        year: '26',
        disambiguationToken: '-1',
        moValue: 'MO',
        materialDevanadoValue: 'AL',
        countryCode: 'CO',
        finalSegment: 'CV',
      });

      expect(code).toBe('1DAA26-1MOAL-CO CV');
    });
  });
});
