/**
 * La bitácora de accesos a las expresiones dice la verdad.
 *
 * El editor afirma «Confidencial · cada consulta queda registrada». Eso es una
 * promesa de auditoría, y una promesa de auditoría que no se cumple es peor
 * que no hacerla: se confía en un rastro que no existe.
 *
 * Se comprueba lo que se puede comprobar sin inventar accesos: que la tabla
 * está, que tiene filas, que esas filas llevan usuario, y que no guardan la
 * expresión.
 *
 * Solo lee.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-access-log.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';

dotenvConfig({ path: '.env' });

const ds = new DataSource({
  type: 'mssql',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  options: { encrypt: false, trustServerCertificate: true },
});

let fallos = 0;

const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(
    `${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`,
  );
  if (!condicion) fallos++;
};

const main = async (): Promise<void> => {
  await ds.initialize();

  const columnas: { columna: string }[] = await ds.query(`
    SELECT COLUMN_NAME AS columna FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'design_function_access_log'
  `);

  check('la tabla existe', columnas.length > 0);
  if (columnas.length === 0) {
    await ds.destroy();
    process.exit(1);
  }

  const nombres = columnas.map((item) => item.columna);

  check(
    'no guarda la expresión, ni cifrada ni en claro',
    !nombres.some((name) => /expression|expresion/i.test(name)),
    nombres.join(', '),
  );

  const [total] = (await ds.query(
    'SELECT COUNT(*) AS total FROM design_function_access_log',
  )) as { total: number }[];

  check('se han registrado accesos', total.total > 0, `${total.total} fila(s)`);

  const [conUsuario] = (await ds.query(`
    SELECT COUNT(*) AS total FROM design_function_access_log
    WHERE user_id IS NOT NULL OR user_email IS NOT NULL
  `)) as { total: number }[];

  check(
    'cada acceso registra quién lo hizo',
    total.total > 0 && conUsuario.total === total.total,
    `${conUsuario.total} de ${total.total} con usuario`,
  );

  console.log('\nÚltimos accesos:');
  const ultimos: unknown[] = await ds.query(`
    SELECT TOP 10 l.id, f.code AS formula, l.user_email AS usuario,
           l.outcome AS resultado, l.created_at AS cuando
    FROM design_function_access_log l
    LEFT JOIN design_function f ON f.id = l.design_function_id
    ORDER BY l.created_at DESC
  `);
  console.table(ultimos);

  console.log(
    fallos === 0
      ? '\nLa bitácora cumple lo que el editor promete.'
      : `\n${fallos} problema(s): el mensaje del editor promete más de lo que hay.`,
  );

  await ds.destroy();
  process.exit(fallos === 0 ? 0 : 1);
};

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
