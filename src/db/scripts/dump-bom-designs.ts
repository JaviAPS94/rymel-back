/**
 * Vuelca los sub-diseños que llevan configuración de BOM, tal como están
 * guardados, para que `project-front` compruebe que se siguen abriendo igual
 * después de retirar del diseñador las acciones de configuración.
 *
 * Solo lectura. Escribe `bom-designs.json` en el directorio actual.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/dump-bom-designs.ts [id ...]
 */

import { config as dotenvConfig } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { DataSource } from 'typeorm';

dotenvConfig({ path: '.env' });

/** Los dos diseños con BOM que encontró `audit-authoring-usage.ts`. */
const DEFAULT_IDS = [90, 91];

async function main(): Promise<void> {
  const ids = process.argv.slice(2).map(Number);
  if (!ids.every(Number.isInteger)) throw new Error('Los ids deben ser enteros');
  const wanted = ids.length > 0 ? ids : DEFAULT_IDS;

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

  const rows: { id: number; code: string; data: string }[] =
    await dataSource.query(
      `SELECT id, code, data FROM sub_design
        WHERE deleted_at IS NULL AND id IN (${wanted.join(',')})`,
    );

  const designs = rows
    .sort((a, b) => a.id - b.id)
    .map((row) => ({ id: row.id, code: row.code, sheet: JSON.parse(row.data) }));

  writeFileSync('bom-designs.json', JSON.stringify(designs, null, 1));
  console.log(`bom-designs.json: ${designs.map((d) => d.id).join(', ')}`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
