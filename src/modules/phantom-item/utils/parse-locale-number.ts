/**
 * Normaliza los números que vienen de las hojas de Excel de migración, donde
 * conviven `100,00`, `1.234,56`, `0.135` y porcentajes como `0%` o `2,5%`.
 *
 * Devuelve `null` cuando el valor está vacío o no es numérico, para que el
 * importador pueda reportar la fila sin abortar el archivo.
 */
export const parseLocaleNumber = (
  raw: unknown,
): { value: number | null; isPercentage: boolean } => {
  if (raw === null || raw === undefined) {
    return { value: null, isPercentage: false };
  }

  // ExcelJS ya entrega number para las celdas numéricas
  if (typeof raw === 'number') {
    return {
      value: Number.isFinite(raw) ? raw : null,
      isPercentage: false,
    };
  }

  let text = String(raw).trim();
  if (text === '') return { value: null, isPercentage: false };

  const isPercentage = text.endsWith('%');
  if (isPercentage) text = text.slice(0, -1).trim();

  // Signo aparte, para no confundirlo con los separadores
  const isNegative = text.startsWith('-');
  if (isNegative || text.startsWith('+')) text = text.slice(1).trim();

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Ambos presentes: el último es el separador decimal
    if (lastComma > lastDot) {
      // 1.234,56 -> el punto agrupa millares
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56 -> la coma agrupa millares
      text = text.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Varias comas solo pueden agrupar millares; una sola es el decimal,
    // que es como vienen todas las cantidades de estas plantillas.
    const commaCount = (text.match(/,/g) || []).length;
    text = commaCount > 1 ? text.replace(/,/g, '') : text.replace(',', '.');
  }

  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') {
    return { value: null, isPercentage };
  }

  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return { value: null, isPercentage };

  return { value: isNegative ? -parsed : parsed, isPercentage };
};

/**
 * Lee una cantidad de la hoja. Devuelve `null` si la celda no es numérica.
 */
export const parseQuantity = (raw: unknown): number | null =>
  parseLocaleNumber(raw).value;

/**
 * Lee el `% DESP.` y lo devuelve como fracción: `0%` -> 0, `2,5%` -> 0.025.
 * Un valor sin `%` se interpreta como fracción si es ≤ 1, y como porcentaje
 * si es mayor (algunas hojas guardan `5` queriendo decir 5%).
 */
export const parsePercentage = (raw: unknown): number | null => {
  const { value, isPercentage } = parseLocaleNumber(raw);
  if (value === null) return null;
  if (isPercentage) return value / 100;
  return value > 1 ? value / 100 : value;
};
