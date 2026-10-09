/**
 * Lo que el admin recibe para armar la lista de materiales de un diseño:
 * la respuesta de `GET /design/by-id/:id` y la de
 * `GET /bill-of-materials/search` con la referencia de su primer elemento.
 *
 * Solo lectura. Escribe `design-bom-input.json` para que
 * `project-admin/scripts/check-design-bom.ts` arme la lista con datos reales.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/dump-design-bom-input.ts [designId]
 */

import { config as dotenvConfig } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { DesignService } from '../../modules/design/services/design.service';
import { DesignResponseDto } from '../../modules/design/dtos/design-response.dto';
import { BillOfMaterialsService } from '../../modules/bill-of-materials/bill-of-materials.service';
import { BillOfMaterials } from '../../modules/bill-of-materials/entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from '../../modules/bill-of-materials/entities/bill-of-materials-node.entity';

dotenvConfig({ path: '.env' });

async function main(): Promise<void> {
  const designId = Number(process.argv[2] ?? 28);
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

  // Lo mismo que serializa el controlador: la respuesta pasa por JSON.
  const design = JSON.parse(
    JSON.stringify(new DesignResponseDto(await new DesignService(dataSource).findById(designId))),
  );
  const reference = design.designElements[0]?.element?.sapReference;
  const bom = JSON.parse(
    JSON.stringify(
      await new BillOfMaterialsService(
        dataSource.getRepository(BillOfMaterials),
        dataSource.getRepository(BillOfMaterialsNode),
      ).findByCode(reference),
    ),
  );

  writeFileSync('design-bom-input.json', JSON.stringify({ design, bom }, null, 1));
  console.log(`design-bom-input.json: diseño ${design.code}, referencia ${reference}, estructura ${bom.code}`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
