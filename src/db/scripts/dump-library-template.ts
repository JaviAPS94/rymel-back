/**
 * Vuelca una plantilla tal como la sirve la biblioteca del diseñador.
 *
 * Misma ruta que usa `project-front`: `TemplateService.findBySubTypeId` y
 * `TemplateResponseDto`. Sirve para comprobar, desde el otro repositorio, qué
 * recibe exactamente el diseñador.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/dump-library-template.ts TEMPLATE_1F_0001
 */

import { writeFileSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { Template } from '../../modules/design/entities/template.entity';
import { TemplateService } from '../../modules/design/services/template.service';
import { TemplateResponseDto } from '../../modules/design/dtos/template-response.dto';
import { TemplateType } from '../../common/enums';

dotenvConfig({ path: '.env' });

async function main(): Promise<void> {
  const code = process.argv[2] ?? 'TEMPLATE_1F_0001';

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

  const repository = dataSource.getRepository(Template);
  const target = await repository.findOne({
    where: { code },
    relations: ['designSubType'],
  });

  if (!target) {
    console.error(`No existe la plantilla ${code}`);
    process.exit(1);
  }

  const library = new TemplateService(repository);
  const templates = await library.findBySubTypeId(
    target.designSubType.id,
    target.type as TemplateType,
  );
  const found = templates.find((template) => template.code === code);

  if (!found) {
    console.error(
      `La biblioteca no devuelve ${code} — ¿está publicada? estado: ${target.status}`,
    );
    process.exit(1);
  }

  const dto = new TemplateResponseDto(found);
  const file = `library-${code}.json`;
  writeFileSync(file, JSON.stringify(dto, null, 1));

  console.log(
    `${file}: ${dto.sheets.length} hoja(s), ${dto.sheets
      .map((sheet) => `${sheet.name}=${Object.keys(sheet.cells).length}`)
      .join(', ')} celdas`,
  );

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
