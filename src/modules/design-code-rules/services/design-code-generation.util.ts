import { DesignCodeSuffixPattern } from '../enums/design-code-suffix-pattern.enum';

/** Convierte 1, 2, 3... en A, B, C... Z, AA, AB... (estilo columnas de spreadsheet). */
export function numberToLetters(n: number): string {
  let result = '';
  let value = n;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/** Token de desambiguación a insertar después del año, según el formato de sufijo. */
export function buildSuffixToken(
  pattern: DesignCodeSuffixPattern,
  n: number,
): string {
  switch (pattern) {
    case DesignCodeSuffixPattern.LETTER_SUFFIX:
      return numberToLetters(n);
    case DesignCodeSuffixPattern.LETTER_SUFFIX_DASH:
      return `-${numberToLetters(n)}`;
    case DesignCodeSuffixPattern.NUMERIC_SUFFIX:
      return String(n);
    case DesignCodeSuffixPattern.NUMERIC_SUFFIX_DASH:
      return `-${n}`;
    default:
      throw new Error(`Formato de sufijo desconocido: ${pattern}`);
  }
}

export interface AssembleDesignCodeParams {
  phase: string;
  powerLetter: string;
  primaryTensionLetter: string;
  secondaryTensionLetter: string;
  year: string;
  disambiguationToken?: string;
  moValue: string;
  materialDevanadoValue: string;
  countryCode: string;
  finalSegment: string;
}

/**
 * Ensambla el código de diseño en el orden definido en la spec `design-code-generation`:
 * fase + letra potencia + letra tensión primaria + letra tensión secundaria + año
 * + [token de desambiguación] + MO + material de devanado + "-" + país + " " + segmento final.
 */
export function assembleDesignCode(params: AssembleDesignCodeParams): string {
  const {
    phase,
    powerLetter,
    primaryTensionLetter,
    secondaryTensionLetter,
    year,
    disambiguationToken = '',
    moValue,
    materialDevanadoValue,
    countryCode,
    finalSegment,
  } = params;

  return (
    `${phase}${powerLetter}${primaryTensionLetter}${secondaryTensionLetter}${year}` +
    `${disambiguationToken}${moValue}${materialDevanadoValue}` +
    `-${countryCode} ${finalSegment}`
  );
}
