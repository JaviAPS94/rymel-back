/**
 * Corrección puntual: multiplicación implícita que dependía del defecto de
 * sustitución de constantes.
 *
 * El motor cifrado sustituía las constantes con un `replace` de subcadenas
 * sobre el texto de la expresión. Dos fórmulas en producción se escribieron
 * contando con eso: `CONST_1x` no era un símbolo llamado "CONST_1x", sino
 * `CONST_1` pegado a `x`, que tras el reemplazo quedaba como `4x` y mathjs
 * leía como `4*x`.
 *
 * Al sustituir las constantes por símbolo —lo correcto, y lo que evita que
 * `CONST_1` corrompa a `CONST_10`— esas dos fórmulas dejan de evaluar:
 * `CONST_1x` pasa a ser un símbolo sin declarar. Este script las corrige
 * haciendo explícita la multiplicación.
 *
 * No confía en que la corrección sea equivalente: la comprueba. Para cada
 * fórmula compara, sobre varios juegos de valores, el resultado del
 * algoritmo anterior contra el de la expresión corregida, y solo escribe si
 * coinciden todos. Si alguno difiere, no toca nada.
 *
 * La corrección se publica como una versión nueva. La versión 1 se conserva
 * intacta: es el registro de lo que de verdad estuvo almacenado.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/fix-implicit-multiplication.ts [--aplicar]
 *
 * Sin `--aplicar` solo informa.
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';

dotenvConfig({ path: '.env' });

const SFE_URL =
  process.env.SECURE_FUNCTION_ENGINE_URL ?? 'http://localhost:5000';
const APPLY = process.argv.includes('--aplicar');

interface CurrentVersion {
  functionId: number;
  versionId: number;
  version: number;
  name: string;
  code: string;
  expression: string;
  variables: string;
  constants: string | null;
}

/** Pone un `*` entre una constante y el identificador que la sigue pegado. */
const makeMultiplicationExplicit = (
  expression: string,
  constantNames: string[],
): string => {
  let corrected = expression;
  // De más largo a más corto: si existieran `CONST_1` y `CONST_10`, corregir
  // primero el corto rompería el largo.
  for (const name of [...constantNames].sort((a, b) => b.length - a.length)) {
    corrected = corrected.replace(
      new RegExp(`${name}(?=[A-Za-z_])`, 'g'),
      `${name}*`,
    );
  }
  return corrected;
};

/**
 * Evalúa una ecuación contra el motor cifrado real.
 *
 * La comparación se hace con el mismo motor que atiende a producción y no
 * con una reimplementación local: una reimplementación podría coincidir
 * consigo misma y no con lo que de verdad ocurre.
 */
const evaluateThroughEngine = async (
  equation: string,
  variables: Record<string, number>,
  constants: Record<string, number>,
): Promise<number> => {
  const { encrypted } = await callSfe<{ encrypted: string }>('encrypt', {
    plainTextFunction: equation,
  });
  const { result } = await callSfe<{ result: number }>('evaluate-function', {
    encryptedFunction: encrypted,
    parameters: variables,
    constants,
  });
  return result;
};

/**
 * Reproduce el algoritmo anterior: sustituye las constantes como subcadenas
 * y evalúa el texto resultante sin constantes, que es exactamente lo que
 * llegaba a mathjs antes del cambio.
 */
const legacyResult = (
  equation: string,
  constants: Record<string, number>,
  variables: Record<string, number>,
): Promise<number> => {
  let text = equation;
  for (const [name, value] of Object.entries(constants)) {
    text = text.replace(new RegExp(name, 'g'), String(value));
  }
  return evaluateThroughEngine(text, variables, {});
};

const correctedResult = (
  equation: string,
  constants: Record<string, number>,
  variables: Record<string, number>,
): Promise<number> => evaluateThroughEngine(equation, variables, constants);

/** Juegos de valores de prueba para comparar ambos algoritmos. */
const sampleInputs = (variableNames: string[]): Record<string, number>[] =>
  [2, 3, 5, 7, 11].map((seed) =>
    Object.fromEntries(variableNames.map((v, i) => [v, seed + i])),
  );

const callSfe = async <T>(route: string, body: unknown): Promise<T> => {
  const response = await fetch(`${SFE_URL}/function-engine/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.SFE_SERVICE_SECRET
        ? { 'x-service-secret': process.env.SFE_SERVICE_SECRET }
        : {}),
      'x-correlation-id': 'script:fix-implicit-multiplication',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${route} respondió ${response.status}`);
  }
  return (await response.json()) as T;
};

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: { encrypt: false, trustServerCertificate: true },
  });
  await dataSource.initialize();

  const rows: CurrentVersion[] = await dataSource.query(`
    SELECT f.id AS functionId, v.id AS versionId, v.version, f.name, f.code,
           v.expression, v.variables, v.constants
    FROM design_function f
    JOIN design_function_version v
      ON v.design_function_id = f.id AND v.is_current = 1
    ORDER BY f.id
  `);

  let corrected = 0;

  for (const row of rows) {
    const constants: Record<string, number> = row.constants
      ? (JSON.parse(row.constants) as Record<string, number>)
      : {};
    const constantNames = Object.keys(constants);
    if (constantNames.length === 0) continue;

    const { plainTextFunction } = await callSfe<{ plainTextFunction: string }>(
      'decrypt',
      { encryptedFunction: row.expression },
    );

    const fixed = makeMultiplicationExplicit(plainTextFunction, constantNames);
    if (fixed === plainTextFunction) continue;

    console.log(`\n#${row.functionId} ${row.code} — "${row.name}"`);
    console.log(`   antes : ${plainTextFunction}`);
    console.log(`   ahora : ${fixed}`);

    // Comprobación de equivalencia antes de escribir nada.
    const variableNames = row.variables
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    let equivalent = true;
    for (const variables of sampleInputs(variableNames)) {
      const before = await legacyResult(
        plainTextFunction,
        constants,
        variables,
      );
      const after = await correctedResult(fixed, constants, variables);
      const same = Object.is(before, after);
      console.log(
        `   ${same ? 'ok  ' : 'DIF '} ${JSON.stringify(variables)} -> ${before} / ${after}`,
      );
      if (!same) equivalent = false;
    }

    if (!equivalent) {
      console.log('   NO se aplica: la corrección cambiaría resultados.');
      continue;
    }

    const validation = await callSfe<{ valid: boolean; error?: string }>(
      'validate',
      { plainTextFunction: fixed },
    );
    if (!validation.valid) {
      console.log(`   NO se aplica: el motor la rechaza (${validation.error})`);
      continue;
    }

    corrected += 1;
    if (!APPLY) {
      console.log('   (simulación; usa --aplicar para escribir)');
      continue;
    }

    const { encrypted } = await callSfe<{ encrypted: string }>('encrypt', {
      plainTextFunction: fixed,
    });

    await dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE design_function_version SET is_current = 0 WHERE design_function_id = @0`,
        [row.functionId],
      );
      await manager.query(
        `INSERT INTO design_function_version
           (design_function_id, version, expression, variables, constants, is_current, created_by)
         VALUES (@0, @1, @2, @3, @4, 1, @5)`,
        [
          row.functionId,
          row.version + 1,
          encrypted,
          row.variables,
          row.constants,
          'migración: multiplicación implícita explícita',
        ],
      );
    });

    console.log(`   aplicado como versión ${row.version + 1}`);
  }

  console.log(
    `\n${corrected} fórmula(s) ${APPLY ? 'corregidas' : 'por corregir'} de ${rows.length}.`,
  );
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
