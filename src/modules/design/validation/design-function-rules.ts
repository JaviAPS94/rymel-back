/**
 * Reglas de validación de una fórmula de diseño.
 *
 * Funciones puras, sin base de datos ni HTTP: las reglas son la parte que más
 * conviene poder probar exhaustivamente, y son las que impiden que vuelvan a
 * producirse los defectos que ya existen en los datos.
 */

import { TemplateType } from '../../../common/enums';

/** Formato de un código de invocación: `CUBIC`, `ASSOCIATE_COST`. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
/** Formato del nombre de una constante. */
const CONSTANT_PATTERN = /^[A-Z][A-Z0-9_]*$/;
/** Formato del nombre de una variable: son símbolos matemáticos, admiten minúsculas. */
const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ExistingCode {
  id: number;
  code: string;
  type: TemplateType;
  name: string;
}

export class ValidationError extends Error {}

/** Aviso que no impide publicar, pero que el administrador debe confirmar. */
export interface Warning {
  kind:
    | 'variables-reordenadas'
    | 'variables-eliminadas'
    | 'variables-agregadas'
    | 'constante-sin-uso';
  message: string;
}

/**
 * Valida el código de invocación.
 *
 * Además de la unicidad, rechaza que un código sea sufijo de otro. Es el
 * defecto que hoy existe en producción: `COST` y `ASSOCIATE_COST` conviven en
 * el mismo subtipo, y el resolutor por expresión regular de project-front
 * evalúa `=ASSOCIATE_COST(A1,B2)` como `COST`. El motor compartido ya no
 * tiene ese defecto, pero un código ambiguo sigue siendo mala idea: quien lea
 * la hoja no sabrá cuál se invoca.
 */
export const validateCode = (
  code: string,
  type: TemplateType,
  existing: readonly ExistingCode[],
  options: { excludeId?: number; currentCode?: string } = {},
): void => {
  if (!code || code.trim() === '') {
    throw new ValidationError('El código es obligatorio');
  }

  if (!CODE_PATTERN.test(code)) {
    throw new ValidationError(
      `El código "${code}" no es válido: debe empezar por una letra mayúscula y ` +
        `contener solo letras mayúsculas, dígitos y guiones bajos`,
    );
  }

  // Un código que ya estaba se deja pasar tal cual. Los datos actuales tienen
  // `CUBIC` y `QUADRATIC` duplicados desde antes de existir esta regla: si el
  // conflicto heredado bloqueara toda edición, no se podría ni corregir la
  // descripción de esas fórmulas sin antes tomar una decisión de negocio que
  // no le corresponde a quien está editando un texto. Lo que se impide es
  // crear conflictos nuevos.
  if (options.currentCode !== undefined && code === options.currentCode) {
    return;
  }

  const sameType = existing.filter(
    (item) => item.type === type && item.id !== options.excludeId,
  );

  const duplicate = sameType.find((item) => item.code === code);
  if (duplicate) {
    throw new ValidationError(
      `El código "${code}" ya lo usa la fórmula "${duplicate.name}" (#${duplicate.id})`,
    );
  }

  for (const item of sameType) {
    if (item.code.endsWith(code)) {
      throw new ValidationError(
        `El código "${code}" es sufijo de "${item.code}" ("${item.name}"). ` +
          `Una hoja con ambos no podría distinguir a cuál se invoca`,
      );
    }
    if (code.endsWith(item.code)) {
      throw new ValidationError(
        `El código "${item.code}" ("${item.name}") es sufijo de "${code}". ` +
          `Una hoja con ambos no podría distinguir a cuál se invoca`,
      );
    }
  }
};

/** Parte la lista de variables tal como se guarda: `"x,c,d"`. */
export const parseVariables = (raw: string): string[] =>
  raw
    .split(',')
    .map((variable) => variable.trim())
    .filter((variable) => variable !== '');

export const validateVariables = (
  variables: readonly string[],
  constants: Readonly<Record<string, number>>,
): void => {
  if (variables.length === 0) {
    throw new ValidationError('La fórmula debe declarar al menos una variable');
  }

  for (const variable of variables) {
    if (!VARIABLE_PATTERN.test(variable)) {
      throw new ValidationError(
        `El nombre de variable "${variable}" no es válido`,
      );
    }
  }

  const seen = new Set<string>();
  for (const variable of variables) {
    if (seen.has(variable)) {
      throw new ValidationError(`La variable "${variable}" está repetida`);
    }
    seen.add(variable);
  }

  for (const variable of variables) {
    if (Object.prototype.hasOwnProperty.call(constants, variable)) {
      throw new ValidationError(
        `"${variable}" está declarada como variable y como constante a la vez`,
      );
    }
  }
};

export const validateConstants = (
  constants: Readonly<Record<string, number>>,
): void => {
  for (const [name, value] of Object.entries(constants)) {
    if (!CONSTANT_PATTERN.test(name)) {
      throw new ValidationError(
        `El nombre de constante "${name}" no es válido: debe empezar por una ` +
          `letra mayúscula y contener solo letras mayúsculas, dígitos y guiones bajos`,
      );
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(
        `La constante "${name}" debe tener un valor numérico finito`,
      );
    }
  }
};

/**
 * Comprueba que todo símbolo que usa la expresión esté declarado.
 *
 * `symbolsUsed` lo devuelve el motor cifrado al validar: es el único que
 * puede analizar la expresión, porque es el único que la ve.
 */
export const validateSymbolsDeclared = (
  symbolsUsed: readonly string[],
  variables: readonly string[],
  constants: Readonly<Record<string, number>>,
): Warning[] => {
  const declared = new Set<string>([...variables, ...Object.keys(constants)]);

  const undeclared = symbolsUsed.filter((symbol) => !declared.has(symbol));
  if (undeclared.length > 0) {
    throw new ValidationError(
      `La expresión usa símbolos que no están declarados: ${undeclared.join(', ')}`,
    );
  }

  const used = new Set(symbolsUsed);
  const warnings: Warning[] = [];

  for (const name of Object.keys(constants)) {
    if (!used.has(name)) {
      warnings.push({
        kind: 'constante-sin-uso',
        message: `La constante "${name}" está declarada pero la expresión no la usa`,
      });
    }
  }

  return warnings;
};

/**
 * Detecta cambios en las variables que alteran el significado de las
 * invocaciones ya escritas en las hojas.
 *
 * Las hojas pasan los argumentos **por posición**: `=CUBIC(A1, B2)` asigna
 * `A1` a la primera variable declarada. Reordenar `x,c,d` a `c,x,d` no rompe
 * nada visible — sigue evaluando — pero cambia el resultado de todas las
 * hojas ya guardadas, en silencio. Es el peor tipo de cambio posible, y por
 * eso se detecta y se avisa en vez de dejarlo pasar.
 */
export const detectIncompatibleVariableChange = (
  previous: readonly string[],
  next: readonly string[],
): Warning[] => {
  if (
    previous.length === next.length &&
    previous.every((v, i) => v === next[i])
  ) {
    return [];
  }

  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  const removed = previous.filter((v) => !nextSet.has(v));
  const added = next.filter((v) => !previousSet.has(v));

  if (removed.length === 0 && added.length === 0) {
    return [
      {
        kind: 'variables-reordenadas',
        message:
          `El orden de las variables cambia de "${previous.join(',')}" a ` +
          `"${next.join(',')}". Las hojas pasan los argumentos por posición, ` +
          `así que las invocaciones existentes darán otro resultado sin avisar`,
      },
    ];
  }

  const warnings: Warning[] = [];

  if (removed.length > 0) {
    warnings.push({
      kind: 'variables-eliminadas',
      message:
        `Se eliminan las variables ${removed.join(', ')}. Las invocaciones ` +
        `existentes con ${previous.length} argumento(s) quedarán en error`,
    });
  }

  if (added.length > 0) {
    warnings.push({
      kind: 'variables-agregadas',
      message:
        `Se agregan las variables ${added.join(', ')}. Las invocaciones ` +
        `existentes con ${previous.length} argumento(s) quedarán incompletas`,
    });
  }

  return warnings;
};

/** Códigos que colisionan entre sí dentro de un mismo conjunto. */
export const findCodeCollisions = (
  functions: readonly ExistingCode[],
): Array<{ a: ExistingCode; b: ExistingCode; reason: string }> => {
  const collisions: Array<{
    a: ExistingCode;
    b: ExistingCode;
    reason: string;
  }> = [];

  for (let i = 0; i < functions.length; i++) {
    for (let j = i + 1; j < functions.length; j++) {
      const a = functions[i];
      const b = functions[j];
      if (a.type !== b.type) continue;

      if (a.code === b.code) {
        collisions.push({ a, b, reason: `ambas usan el código "${a.code}"` });
      } else if (b.code.endsWith(a.code)) {
        collisions.push({
          a,
          b,
          reason: `"${a.code}" es sufijo de "${b.code}"`,
        });
      } else if (a.code.endsWith(b.code)) {
        collisions.push({
          a,
          b,
          reason: `"${b.code}" es sufijo de "${a.code}"`,
        });
      }
    }
  }

  return collisions;
};
