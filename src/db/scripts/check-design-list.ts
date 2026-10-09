/**
 * El listado de diseños con y sin país.
 *
 * Sin país, el admin tiene que ver todos los diseños activos; con país, el
 * diseñador tiene que ver lo mismo que antes. Solo lectura.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-design-list.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { DesignService } from '../../modules/design/services/design.service';

dotenvConfig({ path: '.env' });

let failures = 0;
const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '  ok  ' : ' FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
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
    entities: ['src/**/*.entity.ts'],
  });
  await dataSource.initialize();
  const service = new DesignService(dataSource);

  const [{ total: active }] = await dataSource.query(
    'SELECT COUNT(*) total FROM design WHERE deleted_at IS NULL',
  );
  const all = await service.findAllPaginated({ page: 1, limit: 100 } as never);
  check('sin país devuelve todos los diseños activos', all.total === active, `${all.total} de ${active}`);

  const countries: { id: number; designs: number }[] = await dataSource.query(
    `SELECT c.id, COUNT(DISTINCT d.id) designs
       FROM design d
       JOIN design_element de ON de.design_id = d.id
       JOIN element e ON e.id = de.element_id
       JOIN norm n ON n.id = e.norm_id
       JOIN country c ON c.id = n.country_id
      WHERE d.deleted_at IS NULL
      GROUP BY c.id`,
  );
  for (const country of countries) {
    const page = await service.findAllPaginated({ page: 1, limit: 100, country: country.id } as never);
    check(`con el país ${country.id}, los mismos diseños que el filtro directo`, page.total === country.designs, `${page.total} de ${country.designs}`);
  }

  await dataSource.destroy();
  console.log(failures === 0 ? '\nTodas las comprobaciones pasan.' : `\n${failures} comprobación(es) fallan.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
