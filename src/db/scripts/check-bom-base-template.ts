/**
 * La lista de materiales base de una plantilla sobrevive al borrador, a la
 * publicación y a la biblioteca del diseñador, con su marca.
 *
 * Trabaja sobre una plantilla de prueba que crea y borra; no toca ninguna
 * existente.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-bom-base-template.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource, IsNull } from 'typeorm';
import {
  BOM_BASE_SHEET_NAME,
  buildBomBaseSheet,
  emptySheetStyles,
  readSheet,
  writeSheet,
  type TemplateSheet,
} from '@rymel/design-template';
import { Template } from '../../modules/design/entities/template.entity';
import { Sheet } from '../../modules/design/entities/sheet.entity';
import { TemplateDraft } from '../../modules/design/entities/template-draft.entity';
import { TemplateRevision } from '../../modules/design/entities/template-revision.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { TemplateAdminService } from '../../modules/design/services/template-admin.service';
import { TemplateService } from '../../modules/design/services/template.service';
import { TemplateType } from '../../common/enums';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_BOM_BASE__';
let fallos = 0;
const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};

/** Una hoja con el ítem 240 vinculado en la zona del semielaborado 1. */
const HOJA: TemplateSheet = {
  name: 'Hoja1',
  position: 0,
  cells: {
    B2: { content: 'Item' },
    B3: { content: '240' },
    C3: { content: 'Fibra de 2 mm' },
    D3: { content: 'KLS' },
    L5: { content: '3', itemLink: { catalogSheetName: 'Hoja1', catalogTableId: 'cat', itemId: '240' } },
  },
  styles: {
    ...emptySheetStyles(),
    semiFinishedZones: [
      { id: 'z1', semiFinishedId: 1, semiFinishedCode: 'SF1', semiFinishedName: 'SF 1', startCell: 'L5', endCell: 'L5' },
    ],
    itemCatalogTables: [
      { id: 'cat', name: 'Catálogo', startCell: 'B2', endCell: 'D3', headerRows: 1, idColumnOffset: 0, descriptionColumnOffset: 1, umColumnOffset: 2 },
    ],
  },
};

const ESTRUCTURA = {
  id: 2,
  code: '1-25-220-120',
  name: 'Estructura de prueba',
  nodes: [{ id: 10, semiFinished: { id: 1, name: 'SF 1', code: 'SF1' }, children: [] }],
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
  const admin = new TemplateAdminService(
    dataSource.getRepository(Template),
    dataSource.getRepository(Sheet),
    dataSource.getRepository(TemplateDraft),
    dataSource.getRepository(TemplateRevision),
    dataSource.getRepository(DesignSubTypeFunction),
    dataSource.getRepository(DesignFunction),
    dataSource.getRepository(DesignFunctionVersion),
    dataSource,
  );
  const antes = await dataSource.getRepository(Template).count({ where: { deletedAt: IsNull() } });

  const creada = await admin.create({ name: 'Base de BOM', code: CODE, type: TemplateType.DESIGN, designSubTypeId: 1 });
  try {
    const base = buildBomBaseSheet(ESTRUCTURA, [HOJA]);
    for (const sheet of [HOJA, base]) {
      const persisted = writeSheet(sheet);
      await admin.saveSheet(creada.id, sheet.name, {
        name: sheet.name,
        cells: persisted.cells as Record<string, unknown>,
        styles: persisted.cellsStyles as unknown as Record<string, unknown>,
      });
    }

    console.log('\n--- borrador');
    const borrador = await admin.findOne(creada.id);
    const enBorrador = borrador.document.sheets.find((sheet) => sheet.name === BOM_BASE_SHEET_NAME);
    check('la hoja base está en el borrador con su marca', enBorrador?.styles.billOfMaterials?.structureCode === '1-25-220-120');
    const fila = Object.entries(enBorrador?.cells ?? {}).find(([, cell]) => cell.content === '240')?.[0].slice(1);
    check('con la cantidad como fórmula', enBorrador?.cells[`D${fila}`]?.content === '=Hoja1!L5', enBorrador?.cells[`D${fila}`]?.content);

    console.log('\n--- publicación');
    const publicada = await admin.publish(creada.id, { email: 'check' });
    check('publica', publicada.published === true, JSON.stringify(publicada.diagnostics ?? []).slice(0, 200));

    const filas = await dataSource.getRepository(Sheet).find({ where: { template: { id: creada.id } } as never });
    const fila2 = filas.find((sheet) => sheet.name === BOM_BASE_SHEET_NAME);
    check('la hoja publicada guarda la marca', JSON.parse(fila2?.cellsStyles ?? '{}').billOfMaterials?.structureId === 2);

    console.log('\n--- biblioteca del diseñador');
    const biblioteca = await new TemplateService(dataSource.getRepository(Template)).findBySubTypeId(1);
    const plantilla = biblioteca.find((template) => template.id === creada.id);
    const leida = plantilla?.sheets.find((sheet) => sheet.name === BOM_BASE_SHEET_NAME);
    check('el diseñador recibe la hoja base', !!leida);
    const comoContrato = leida
      ? readSheet({ name: leida.name, cells: JSON.parse(leida.cells), cellsStyles: JSON.parse(leida.cellsStyles ?? '{}') }, 1)
      : undefined;
    check('y la lee como lista de materiales', comoContrato?.styles.billOfMaterials?.structureName === 'Estructura de prueba');
  } finally {
    await dataSource.getRepository(TemplateDraft).delete({ templateId: creada.id });
    await dataSource.getRepository(TemplateRevision).delete({ templateId: creada.id });
    await dataSource.getRepository(Sheet).delete({ template: { id: creada.id } } as never);
    await dataSource.getRepository(Template).delete(creada.id);
    const despues = await dataSource.getRepository(Template).count({ where: { deletedAt: IsNull() } });
    check('la base queda como estaba', antes === despues, `${antes} -> ${despues}`);
    await dataSource.destroy();
  }

  console.log(fallos === 0 ? '\nTodas las comprobaciones pasan.' : `\n${fallos} comprobación(es) fallan.`);
  if (fallos > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
