/**
 * Auditoría sistemática de sintaxis: qué acepta el evaluador de project-front
 * y qué acepta el motor compartido.
 *
 * Hasta ahora las incompatibilidades aparecían de una en una, al tropezarse
 * con ellas: faltaban veinte funciones matemáticas, `PI()` no se podía
 * invocar, `BUSCARV` no existía, `TRUE` no se analizaba, las referencias entre
 * instancias no se reconocían. Cuatro de cuatro por accidente.
 *
 * Este script sustituye ese método por un inventario. Cada caso sale de una
 * expresión regular concreta del evaluador de `SpreadSheet.tsx`, citada en el
 * propio caso, de modo que la lista es cerrada y no una muestra.
 *
 * No toca la base de datos.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/syntax-compatibility-audit.ts
 */

import { evaluateFormula, FORMULA_ERROR } from '@rymel/formula-engine';

interface Case {
  /** Qué forma sintáctica se comprueba. */
  feature: string;
  /** De qué parte del evaluador anterior sale. */
  origin: string;
  formula: string;
  /** Qué debería devolver el motor si es compatible. */
  expected: number | string;
  /**
   * Si el motor diverge a propósito del evaluador anterior, qué devolvía este.
   * La fila no cuenta como compatible: cuenta como divergencia documentada.
   */
  divergesFromLegacy?: string;
}

/** Celdas de apoyo, incluidas hojas con nombres reales del sistema. */
const CELLS: Record<string, number | string> = {
  A1: 9,
  A2: 4,
  A3: 2,
  B1: -4,
  T1: 'texto',
  'Hoja1!A1': 7,
  'design:Hoja1!A1': 21,
  '1F!A1': 5,
  'Template 1F!A1': 11,
  F1: 10,
  G1: 100,
  F2: 20,
  G2: 200,
};

const CASES: Case[] = [
  // --- Referencias ---
  {
    feature: 'referencia local',
    origin: '/\\$?[A-Z]+\\$?\\d+/',
    formula: '=A1',
    expected: 9,
  },
  {
    feature: 'referencia absoluta con $',
    origin: 'mismo patrón, `\\$?`',
    formula: '=$A$1',
    expected: 9,
  },
  {
    feature: 'referencia a otra hoja',
    origin: '`[A-Za-z0-9]+!` del patrón de referencias',
    formula: '=Hoja1!A1',
    expected: 7,
  },
  {
    feature: 'referencia entre instancias',
    origin: '`[A-Za-z0-9]+:[A-Za-z0-9]+!` del patrón de referencias',
    formula: '=design:Hoja1!A1',
    expected: 21,
  },
  {
    feature: 'hoja cuyo nombre empieza por dígito',
    origin: '`[A-Za-z0-9]+!`: admite nombres como `1F`',
    formula: '=1F!A1',
    expected: 5,
  },
  {
    feature: 'hoja con espacios entre comillas simples',
    origin: 'parseCrossSheetRef, `/^(.+?)!([A-Z]+\\d+)$/`',
    formula: "='Template 1F'!A1",
    expected: 11,
  },
  {
    feature: 'rango',
    origin: 'SUM/AVERAGE expanden `A1:B5`',
    formula: '=SUMA(F1:G2)',
    expected: 330,
  },

  // --- Literales ---
  {
    feature: 'número entero',
    origin: '/\\d+(?:\\.\\d+)?/',
    formula: '=42',
    expected: 42,
  },
  {
    feature: 'número decimal',
    origin: 'mismo patrón',
    formula: '=1.5+1.5',
    expected: 3,
  },
  {
    feature: 'texto entre comillas dobles',
    origin: 'Function() evalúa literales de JavaScript',
    formula: '="hola"',
    expected: 'hola',
  },
  {
    feature: 'texto entre comillas simples',
    origin: '/^["\']|["\']$/g: el evaluador las trata como literales',
    formula: "='hola'",
    expected: 'hola',
  },
  {
    feature: 'literal TRUE',
    origin: 'ejemplo de la ayuda: =BUSCARV(A1, B1:E10, 3, TRUE)',
    formula: '=SI(TRUE, 1, 2)',
    expected: 1,
  },

  // --- Operadores ---
  { feature: 'suma', origin: 'Function()', formula: '=A1+A2', expected: 13 },
  { feature: 'resta', origin: 'Function()', formula: '=A1-A2', expected: 5 },
  {
    feature: 'multiplicación',
    origin: 'Function()',
    formula: '=A1*A2',
    expected: 36,
  },
  {
    feature: 'división',
    origin: 'Function()',
    formula: '=A1/A2',
    expected: 2.25,
  },
  {
    feature: 'potencia con ^',
    origin: '/(\\d+|\\(...\\))\\s*\\^\\s*(...)/ -> Math.pow',
    formula: '=A3^A2',
    expected: 16,
  },
  {
    feature: 'negación unaria',
    origin: 'Function()',
    formula: '=-A2+A1',
    expected: 5,
  },
  {
    feature: 'paréntesis y precedencia',
    origin: 'Function()',
    formula: '=(A1+A2)*A3',
    expected: 26,
  },
  {
    feature: 'concatenación de texto',
    origin: 'CONCATENAR no existe en project-front; el motor usa &',
    formula: '="a" & "b"',
    expected: 'ab',
  },

  // --- Funciones de agregado ---
  {
    feature: 'SUM sobre rango',
    origin: '/SUM\\(([^)]*)\\)/g',
    formula: '=SUM(F1:G2)',
    expected: 330,
  },
  {
    feature: 'AVERAGE sobre rango',
    origin: '/AVERAGE\\(([^)]*)\\)/g',
    formula: '=AVERAGE(F1:F2)',
    expected: 15,
  },
  {
    feature: 'SUM con celdas sueltas separadas por coma',
    origin: 'el mismo patrón parte por comas',
    formula: '=SUM(F1,G1)',
    expected: 110,
  },

  // --- Búsqueda ---
  {
    feature: 'BUSCARV exacta',
    origin: '/BUSCARV\\(([^)]*)\\)/g',
    formula: '=BUSCARV(20, F1:G2, 2, TRUE)',
    expected: 200,
  },
  {
    feature: 'VLOOKUP (alias en inglés)',
    origin: '/VLOOKUP\\(([^)]*)\\)/g',
    formula: '=VLOOKUP(10, F1:G2, 2, TRUE)',
    expected: 100,
  },
  {
    feature: 'COINCIDIR',
    origin: '/COINCIDIR\\(([^)]*)\\)/g',
    formula: '=COINCIDIR(20, F1:F2, 0)',
    expected: 2,
  },

  // --- Lógica ---
  {
    feature: 'SI/IF',
    origin: '/\\b(?:SI|IF)\\(/i',
    formula: '=SI(A1>A2, 1, 2)',
    expected: 1,
  },
  {
    feature: 'SI en minúsculas',
    origin: 'la bandera /i del patrón',
    formula: '=si(A1>A2, 1, 2)',
    expected: 1,
  },
  {
    feature: 'AND',
    origin: '/\\bAND\\(/i',
    formula: '=AND(1,1)',
    expected: 1,
  },
  {
    feature: 'OR',
    origin: '/\\b(?:OR|O)\\(/i',
    formula: '=OR(0,1)',
    expected: 1,
  },

  // --- Matemáticas ---
  {
    feature: 'SENO/SIN',
    origin: '/\\b(?:SENO|SIN)\\(/gi',
    formula: '=SENO(0)',
    expected: 0,
  },
  {
    feature: 'nombre de función en minúsculas',
    origin: 'la bandera /i',
    formula: '=abs(B1)',
    expected: 4,
  },
  {
    feature: 'RAIZ/SQRT',
    origin: '/\\b(?:RAIZ|SQRT)\\(/gi',
    formula: '=RAIZ(A1)',
    expected: 3,
  },
  {
    feature: 'LOGARITMO base 10',
    origin: '-> Math.log10',
    formula: '=LOGARITMO(100)',
    expected: 2,
  },
  { feature: 'LN', origin: '-> Math.log', formula: '=LN(1)', expected: 0 },
  {
    feature: 'POTENCIA/POWER',
    origin: '/\\b(?:POTENCIA|POWER)\\(/gi',
    formula: '=POTENCIA(A3,A2)',
    expected: 16,
  },
  {
    feature: 'REDONDEAR con decimales',
    origin: '/\\b(?:REDONDEAR|ROUND)\\(([^,]+),\\s*(\\d+)\\)/gi',
    formula: '=REDONDEAR(A1/A2,2)',
    expected: 2.25,
  },
  {
    feature: 'TECHO/CEILING',
    origin: '/\\b(?:TECHO|CEILING)\\(/gi',
    formula: '=TECHO(1.2)',
    expected: 2,
  },
  {
    feature: 'PISO/FLOOR',
    origin: '/\\b(?:PISO|FLOOR)\\(/gi',
    formula: '=PISO(1.8)',
    expected: 1,
  },
  {
    feature: 'PI()',
    origin: '/\\bPI\\(\\)/gi',
    formula: '=REDONDEAR(PI(),4)',
    expected: 3.1416,
  },
  {
    feature: 'RADIANES',
    origin: '/\\b(?:RADIANES|RADIANS)\\(/gi',
    formula: '=REDONDEAR(RADIANES(180),4)',
    expected: 3.1416,
  },
  {
    feature: 'GRADOS',
    origin: '/\\b(?:GRADOS|DEGREES)\\(/gi',
    formula: '=GRADOS(PI())',
    expected: 180,
  },
  // --- Celdas no numéricas: divergencia deliberada ---
  {
    feature: 'aritmética sobre una celda de texto',
    origin:
      'resolveCellValue devuelve 0 para lo no numérico; el motor da error',
    formula: '=T1+1',
    expected: FORMULA_ERROR,
    divergesFromLegacy:
      'el evaluador anterior devolvía 1, tratando el texto como 0',
  },
  {
    feature: 'texto en una comparación',
    origin: 'mismo caso',
    formula: '=SI(T1="texto", 1, 2)',
    expected: 1,
  },
  {
    feature: 'celda vacía cuenta como cero',
    origin: 'resolveCellValue devuelve 0; el motor también',
    formula: '=Z99+1',
    expected: 1,
  },
  {
    feature: 'función anidada',
    origin: 'Function() evalúa la expresión completa',
    formula: '=RAIZ(POTENCIA(A1,A3))',
    expected: 9,
  },
];

const equivalent = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-12);
  }
  return false;
};

const main = (): void => {
  const failures: Array<Case & { got: unknown }> = [];
  let compatible = 0;
  let intentional = 0;

  console.log('| forma sintáctica | fórmula | motor | estado |');
  console.log('|---|---|---|---|');

  for (const testCase of CASES) {
    const got = evaluateFormula(testCase.formula, CELLS);
    const ok = equivalent(testCase.expected, got);

    let status: string;
    if (!ok) {
      failures.push({ ...testCase, got });
      status = '**HUECO**';
    } else if (testCase.divergesFromLegacy !== undefined) {
      intentional += 1;
      status = `divergencia deliberada — ${testCase.divergesFromLegacy}`;
    } else {
      compatible += 1;
      status = 'igual que antes';
    }

    console.log(
      `| ${testCase.feature} | \`${testCase.formula}\` | ${JSON.stringify(got)} | ${status} |`,
    );
  }

  console.log('');
  console.log(
    `${compatible} formas se comportan igual que antes, ${intentional} divergen a propósito, ${failures.length} son huecos. Total: ${CASES.length}.`,
  );

  if (failures.length > 0) {
    console.log('\nHuecos:');
    for (const failure of failures) {
      console.log(`  - ${failure.feature}`);
      console.log(`      origen: ${failure.origin}`);
      console.log(
        `      \`${failure.formula}\` esperaba ${JSON.stringify(failure.expected)} y dio ${JSON.stringify(failure.got)}`,
      );
    }
  }

  process.exit(failures.length === 0 ? 0 : 1);
};

void FORMULA_ERROR;
main();
