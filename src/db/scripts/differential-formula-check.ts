/**
 * Contraste diferencial entre el evaluador anterior y el motor compartido.
 *
 * La verificación en sombra sobre los datos reales no puede cubrir la
 * aritmética: las 104 celdas con fórmula que hay en la base invocan todas una
 * función personalizada, y no existe ni una `=A1*2`. Es decir, la categoría
 * "defecto del motor" salía vacía por falta de casos, no por estar demostrada.
 *
 * Este script cierra ese hueco por otra vía: reproduce el núcleo del
 * evaluador de project-front —sustituir las referencias por sus valores,
 * traducir los nombres de función a `Math.*` y evaluar con `Function()`— y lo
 * contrasta contra el motor compartido sobre un corpus de fórmulas que cubre
 * los operadores y funciones soportados.
 *
 * No toca la base de datos.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/differential-formula-check.ts
 */

import { evaluateFormula } from '@rymel/formula-engine';

/** Valores de celda usados por todo el corpus. */
const CELLS: Record<string, number> = {
  A1: 9,
  A2: 4,
  A3: 2,
  B1: -4,
  B2: 0.5,
  C1: 100,
};

/**
 * Núcleo del evaluador de project-front (`SpreadSheet.tsx`, línea 3084 y las
 * pasadas de `replace` que la preceden), reproducido lo más fielmente posible.
 */
const legacyEvaluate = (formula: string): number | string => {
  try {
    let expression = formula.slice(1);

    // Referencias de celda por su valor, de más larga a más corta para que
    // `A10` no se rompa al sustituir `A1`.
    for (const ref of Object.keys(CELLS).sort((a, b) => b.length - a.length)) {
      expression = expression.replace(
        new RegExp(`\\b${ref}\\b`, 'g'),
        String(CELLS[ref]),
      );
    }

    expression = expression.replace(/\b(?:SENO|SIN)\(/gi, 'Math.sin(');
    expression = expression.replace(/\b(?:COSENO|COS)\(/gi, 'Math.cos(');
    expression = expression.replace(/\b(?:TANGENTE|TAN)\(/gi, 'Math.tan(');
    expression = expression.replace(/\b(?:ASENO|ASIN)\(/gi, 'Math.asin(');
    expression = expression.replace(/\b(?:ACOSENO|ACOS)\(/gi, 'Math.acos(');
    expression = expression.replace(/\bATAN\(/gi, 'Math.atan(');
    expression = expression.replace(/\b(?:LOGARITMO|LOG)\(/gi, 'Math.log10(');
    expression = expression.replace(/\bLN\(/gi, 'Math.log(');
    expression = expression.replace(/\b(?:RAIZ|SQRT)\(/gi, 'Math.sqrt(');
    expression = expression.replace(/\bABS\(/gi, 'Math.abs(');
    expression = expression.replace(/\b(?:POTENCIA|POWER)\(/gi, 'Math.pow(');
    expression = expression.replace(
      /\b(?:REDONDEAR|ROUND)\(([^,]+),\s*(\d+)\)/gi,
      (_, value: string, decimals: string) =>
        `(Math.round(${value} * Math.pow(10, ${decimals})) / Math.pow(10, ${decimals}))`,
    );
    expression = expression.replace(/\b(?:TECHO|CEILING)\(/gi, 'Math.ceil(');
    expression = expression.replace(/\b(?:PISO|FLOOR)\(/gi, 'Math.floor(');
    expression = expression.replace(/\bPI\(\)/gi, 'Math.PI');
    expression = expression.replace(
      /\b(?:RADIANES|RADIANS)\(/gi,
      '(Math.PI/180)*(',
    );
    expression = expression.replace(
      /\b(?:GRADOS|DEGREES)\(/gi,
      '(180/Math.PI)*(',
    );
    expression = expression.replace(/\^/g, '**');

    if (!expression.trim() || expression.trim() === '()') return '#ERROR';

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const result: unknown = Function(
      `"use strict"; return (${expression})`,
    )() as unknown;
    return typeof result === 'number' && !isNaN(result) ? result : '#ERROR';
  } catch {
    return '#ERROR';
  }
};

/**
 * Tabla de búsqueda, como la que tendría una hoja: código, valor, etiqueta.
 * Se declara aparte porque `BUSCARV` la lee del grid, no de la expresión.
 */
const TABLE: Record<string, number | string> = {
  F1: 10,
  G1: 100,
  H1: 'diez',
  F2: 20,
  G2: 200,
  H2: 'veinte',
  F3: 30,
  G3: 300,
  H3: 'treinta',
};

/**
 * `BUSCARV` del evaluador anterior, sobre el grid.
 *
 * Se reproduce aparte porque no pasa por la sustitución de referencias: lee
 * las celdas directamente. Incluye sus dos rarezas: la tolerancia de 0.0001 y
 * que un resultado de texto se devuelve como `0`.
 */
const legacyVlookup = (
  needle: number,
  columnIndex: number,
  exact: boolean,
): number | string => {
  const rows: Array<[number, number, string]> = [
    [TABLE.F1 as number, TABLE.G1 as number, TABLE.H1 as string],
    [TABLE.F2 as number, TABLE.G2 as number, TABLE.H2 as string],
    [TABLE.F3 as number, TABLE.G3 as number, TABLE.H3 as string],
  ];

  const valueAt = (row: [number, number, string]): number | string => {
    const found = row[columnIndex - 1];
    return typeof found === 'number' ? found : '0';
  };

  if (exact) {
    for (const row of rows) {
      if (Math.abs(needle - row[0]) < 0.0001) return valueAt(row);
    }
    return '0';
  }

  let last: [number, number, string] | null = null;
  for (const row of rows) {
    if (row[0] > needle) break;
    last = row;
  }
  return last === null ? '0' : valueAt(last);
};

/** Corpus: operadores, precedencia, funciones y casos límite. */
const CORPUS: string[] = [
  // Aritmética y precedencia
  '=A1+A2',
  '=A1-A2',
  '=A1*A2',
  '=A1/A2',
  '=A1+A2*A3',
  '=(A1+A2)*A3',
  '=A1^A3',
  '=A1^A3^A3',
  '=-A2+A1',
  '=-(A1-A2)',
  '=A1*-A2',
  '=A1/A2/A3',
  '=A1+A2-A3*A3/A3',
  '=((A1))',
  '=2*(A1+3)-A2',
  // Comparadores
  '=A1>A2',
  '=A1<A2',
  '=A1>=A1',
  '=A1<=A2',
  '=A1=A1',
  '=A1<>A2',
  // Trigonometría
  '=SENO(0)',
  '=SIN(A3)',
  '=COSENO(0)',
  '=COS(A3)',
  '=TANGENTE(0)',
  '=ASENO(1)',
  '=ACOSENO(1)',
  '=ATAN(1)',
  // Logaritmos y raíces
  '=LOGARITMO(C1)',
  '=LOG(C1)',
  '=LN(A1)',
  '=RAIZ(A1)',
  '=SQRT(A2)',
  // Otras
  '=ABS(B1)',
  '=POTENCIA(A3,A2)',
  '=POWER(A3,A3)',
  '=TECHO(B2)',
  '=PISO(B2)',
  '=REDONDEAR(A1/A2,2)',
  '=ROUND(C1/A1,3)',
  '=PI()',
  '=RADIANES(180)',
  '=GRADOS(PI())',
  // Combinaciones
  '=RAIZ(A1)+ABS(B1)',
  '=REDONDEAR(GRADOS(PI()),2)',
  '=ABS(B1)*POTENCIA(A3,A3)',
  '=RAIZ(POTENCIA(A1,A3))',
  '=LN(POTENCIA(A3,A3))+A2',
];

const equivalent = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-12);
  }
  // El evaluador anterior devuelve 1/0 para los comparadores porque JavaScript
  // los evalúa a booleanos y luego los descarta; el motor devuelve 1/0
  // directamente. Se comparan como números.
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(a) === Number(b);
  }
  return false;
};

/**
 * Contraste de `BUSCARV`, que va aparte porque el evaluador anterior la
 * resuelve leyendo el grid en vez de sustituir texto.
 */
const vlookupCases: Array<{
  descripcion: string;
  needle: number;
  column: number;
  exact: boolean;
}> = [
  {
    descripcion: 'exacta, columna numérica',
    needle: 20,
    column: 2,
    exact: true,
  },
  {
    descripcion: 'exacta, primer registro',
    needle: 10,
    column: 2,
    exact: true,
  },
  {
    descripcion: 'exacta, último registro',
    needle: 30,
    column: 2,
    exact: true,
  },
  {
    descripcion: 'tolerancia de 0.0001',
    needle: 20.00005,
    column: 2,
    exact: true,
  },
  { descripcion: 'aproximada, entre dos', needle: 25, column: 2, exact: false },
  {
    descripcion: 'aproximada, por encima',
    needle: 35,
    column: 2,
    exact: false,
  },
];

const checkVlookup = (): number => {
  const cells: Record<string, number | string> = { ...CELLS, ...TABLE };
  let divergent = 0;

  for (const caso of vlookupCases) {
    const legacy = legacyVlookup(caso.needle, caso.column, caso.exact);
    const formula = `=BUSCARV(${caso.needle}, F1:H3, ${caso.column}, ${caso.exact ? 'TRUE' : 'FALSE'})`;
    const engine = evaluateFormula(formula, cells);

    if (!equivalent(legacy, engine)) {
      divergent += 1;
      console.log(
        `   BUSCARV ${caso.descripcion}: anterior=${JSON.stringify(legacy)} motor=${JSON.stringify(engine)}`,
      );
    }
  }

  console.log(
    `BUSCARV contrastada: ${vlookupCases.length} casos | divergentes: ${divergent}`,
  );
  return divergent;
};

const main = (): void => {
  let matching = 0;
  const divergences: Array<{
    formula: string;
    legacy: unknown;
    engine: unknown;
  }> = [];

  for (const formula of CORPUS) {
    const legacy = legacyEvaluate(formula);
    const engine = evaluateFormula(formula, CELLS);
    if (equivalent(legacy, engine)) {
      matching += 1;
    } else {
      divergences.push({ formula, legacy, engine });
    }
  }

  console.log(
    `fórmulas contrastadas: ${CORPUS.length} | coincidentes: ${matching} | divergentes: ${divergences.length}`,
  );

  if (divergences.length > 0) {
    console.log('\ndivergencias:');
    for (const divergence of divergences) {
      console.log(
        `   ${divergence.formula.padEnd(30)} anterior=${JSON.stringify(divergence.legacy)}  motor=${JSON.stringify(divergence.engine)}`,
      );
    }
  }

  const vlookupDivergences = checkVlookup();

  process.exit(divergences.length + vlookupDivergences === 0 ? 0 : 1);
};

main();
