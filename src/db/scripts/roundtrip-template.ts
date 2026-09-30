/**
 * Ida y vuelta de una plantilla: se escribe como en el editor y se lee como
 * la lee el diseñador.
 *
 * Crea una plantilla con todo lo que una plantilla puede declarar —fórmulas
 * entre hojas, formato, celdas combinadas, filas ocultas, las tres clases de
 * región, enlaces de celda y una directiva de gráfico—, la publica, y la
 * vuelve a leer **por la misma ruta que usa la biblioteca del diseñador**:
 * `TemplateService.findBySubTypeId` y `TemplateResponseDto`.
 *
 * Deja el resultado en `roundtrip-template.json` para que el guion gemelo de
 * project-front lo cargue con el contrato y compruebe que llega íntegro.
 *
 * La plantilla de prueba se borra al terminar.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/roundtrip-template.ts
 */

import { writeFileSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { emptySheetStyles } from '@rymel/design-template';
import { Template } from '../../modules/design/entities/template.entity';
import { Sheet } from '../../modules/design/entities/sheet.entity';
import { TemplateDraft } from '../../modules/design/entities/template-draft.entity';
import { TemplateRevision } from '../../modules/design/entities/template-revision.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { TemplateAdminService } from '../../modules/design/services/template-admin.service';
import { TemplateService } from '../../modules/design/services/template.service';
import { TemplateResponseDto } from '../../modules/design/dtos/template-response.dto';
import { TemplateStatus, TemplateType } from '../../common/enums';

dotenvConfig({ path: '.env' });

const CODE = '__ROUNDTRIP__';
let failures = 0;

const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(
    `${condition ? '  ok  ' : ' FALLA'} ${name}${detail ? ` — ${detail}` : ''}`,
  );
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
  const library = new TemplateService(dataSource.getRepository(Template));

  // Limpieza por si quedó de una ejecución anterior.
  const previous = await dataSource
    .getRepository(Template)
    .findOne({ where: { code: CODE } });
  if (previous) await purge(dataSource, previous.id);

  console.log('\n--- se escribe como en el editor');

  const created = await admin.create({
    name: 'Plantilla de ida y vuelta',
    code: CODE,
    description: 'Creada por roundtrip-template.ts',
    type: TemplateType.DESIGN,
    designSubTypeId: 1,
  });

  await admin.createSheet(created.id, { name: 'Tablas' });
  await admin.createSheet(created.id, { name: 'Resumen' });

  await admin.saveSheet(created.id, 'Tablas', {
    name: 'Tablas',
    cells: {
      A1: { formula: 'Potencia', bold: true },
      B1: { formula: 'Factor', bold: true },
      A2: { formula: '1000' },
      B2: { formula: '5' },
      A3: { formula: '3000' },
      B3: { formula: '9' },
      C5: { formula: 'AC-1' },
      D5: { formula: 'Acero al silicio' },
      E5: { formula: 'kg' },
    },
    styles: {
      ...emptySheetStyles(),
      // Una fila oculta de la plantilla: es lo que antes no llegaba.
      hiddenRows: [7],
      columnWidths: { 0: 140 },
      itemCatalogTables: [
        {
          id: 'ct-1',
          name: 'Aceros',
          // El selector del admin enruta por estas etiquetas.
          tags: ['acero'],
          startCell: 'C4',
          endCell: 'E9',
          headerRows: 1,
          idColumnOffset: 0,
          descriptionColumnOffset: 1,
          umColumnOffset: 2,
        },
      ],
      namedRanges: [
        {
          id: 'nr-1',
          name: 'Tabla de factores',
          tags: ['aluminio'],
          startCell: 'A1',
          endCell: 'B3',
        },
      ],
    },
  });

  await admin.saveSheet(created.id, 'Resumen', {
    name: 'Resumen',
    cells: {
      A1: { formula: 'Resumen', bold: true, textColor: '#2d6ef0' },
      // Los dos segmentos del código de diseño salen de aquí.
      B2: { formula: '3000', materialTag: 'MO' },
      // Fórmula entre hojas, con `;` y rango calificado en los dos extremos:
      // exactamente la forma que tienen las plantillas reales.
      B3: { formula: '=BUSCARV(B2;Tablas!A2:Tablas!B3;2;FALSE)' },
      B4: { formula: '=B3*2', materialTag: 'MD' },
      // La cantidad del ítem vinculado, enrutado al catálogo por B6. Toda la
      // configuración del BOM es de la plantilla: el diseñador no la cambia.
      B5: {
        formula: '=B4',
        border: '1px solid #000',
        itemLink: {
          catalogSheetName: 'Tablas',
          catalogTableId: 'ct-1',
          itemId: 'AC-1',
        },
        catalogConditionCells: ['B6'],
      },
      B6: { formula: 'acero' },
      C1: { formula: '', elementKey: 'power' },
      D1: { formula: '', options: ['Aluminio', 'Cobre'] },
      D2: { formula: '', goTo: { conditionCells: ['D1'] } },
      K7: { formula: 'DRAW:FRONTAL:NUCLEO:B2,B3' },
    },
    styles: {
      ...emptySheetStyles(),
      freezeRow: 1,
      mergedCells: [{ startCell: 'A1', endCell: 'C1', rowSpan: 1, colSpan: 3 }],
      // El cálculo de B3:B4 no lo toca el diseñador.
      readOnlyZones: [{ id: 'ro-1', startCell: 'B3', endCell: 'B4' }],
      semiFinishedZones: [
        {
          id: 'sf-1',
          semiFinishedId: 1,
          semiFinishedCode: 'BOBINA',
          semiFinishedName: 'BOBINA',
          // Contiene la celda vinculada, que es lo que el BOM atribuye al semielaborado.
          startCell: 'A5',
          endCell: 'C14',
        },
      ],
    },
  });

  const beforePublish = await admin.findOne(created.id);
  check(
    'el editor no encuentra problemas',
    beforePublish.diagnostics.length === 0,
    beforePublish.diagnostics.map((d) => d.message).join('; '),
  );

  const published = await admin.publish(created.id, { email: 'roundtrip' });
  check('se publica', published.published === true);

  console.log('\n--- se lee como la lee el diseñador');

  const fromLibrary = await library.findBySubTypeId(1, TemplateType.DESIGN);
  const mine = fromLibrary.find((template) => template.code === CODE);

  check('la biblioteca la devuelve', mine !== undefined);
  if (!mine) {
    await purge(dataSource, created.id);
    await dataSource.destroy();
    process.exit(1);
  }

  const dto = new TemplateResponseDto(mine);

  check('llega con sus dos hojas', dto.sheets.length === 2);
  check(
    'en el orden en que se guardaron',
    JSON.stringify(dto.sheets.map((sheet) => sheet.name)) ===
      '["Tablas","Resumen"]',
    dto.sheets.map((sheet) => sheet.name).join(', '),
  );

  // Lo que el diseñador recibe, tal cual, para que el guion gemelo lo cargue.
  writeFileSync(
    'roundtrip-template.json',
    JSON.stringify(
      {
        id: dto.id,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        // El DTO ya entrega los JSON interpretados: es lo que recibe
        // project-front por la API.
        sheets: dto.sheets.map((sheet) => ({
          name: sheet.name,
          cells: sheet.cells,
          cellsStyles: sheet.cellsStyles ?? {},
        })),
      },
      null,
      1,
    ),
  );
  console.log('  escrito roundtrip-template.json');

  const resumen = dto.sheets.find((sheet) => sheet.name === 'Resumen')!
    .cells as unknown as Record<string, Record<string, unknown>>;
  const tablasStyles = dto.sheets.find((sheet) => sheet.name === 'Tablas')!
    .cellsStyles as unknown as Record<string, unknown>;

  check(
    'la fila oculta de la plantilla llega',
    JSON.stringify(tablasStyles.hiddenRows) === '[7]',
    JSON.stringify(tablasStyles.hiddenRows),
  );
  check(
    'y ya no se escribe el campo espejo, retirado en el contrato v2.0.0',
    tablasStyles.templateHiddenRows === undefined &&
      tablasStyles.templateHiddenColumns === undefined,
  );
  check(
    'el contenido de la celda viaja en un solo campo',
    Object.values(resumen).every((cell) => cell.value === undefined),
  );
  check(
    'el estado de sesión del diseñador no viaja en la plantilla',
    tablasStyles.userHiddenRows === undefined &&
      tablasStyles.hiddenCells === undefined,
  );

  check(
    'la directiva de gráfico llega sin el `=`',
    String(resumen.K7?.formula).startsWith('DRAW:FRONTAL:'),
    String(resumen.K7?.formula),
  );
  check(
    'ninguna celda trae valor calculado',
    Object.values(resumen).every((cell) => cell.computed === undefined),
  );
  check(
    'el enlace a ítem llega con su hoja y su tabla',
    (resumen.B5?.itemLink as { catalogTableId?: string })?.catalogTableId ===
      'ct-1',
  );
  check(
    'la clave del elemento llega',
    resumen.C1?.elementKey === 'power',
    String(resumen.C1?.elementKey),
  );
  check('las opciones llegan', Array.isArray(resumen.D1?.options));
  check('la navegación llega', resumen.D2?.goTo !== undefined);
  check('el formato llega', resumen.A1?.bold === true);

  console.log('\n--- limpieza');
  await purge(dataSource, created.id);
  const stillThere = await dataSource
    .getRepository(Template)
    .findOne({ where: { code: CODE } });
  check('la plantilla de prueba se borra', stillThere === null);

  console.log(
    failures === 0
      ? '\nLa plantilla viaja íntegra del editor al diseñador.'
      : `\n${failures} comprobación(es) fallan.`,
  );

  await dataSource.destroy();
  process.exit(failures === 0 ? 0 : 1);
}

/** Borra la plantilla de prueba y todo lo que cuelga de ella. */
const purge = async (dataSource: DataSource, id: number): Promise<void> => {
  await dataSource.getRepository(TemplateDraft).delete({ templateId: id });
  await dataSource.getRepository(TemplateRevision).delete({ templateId: id });
  await dataSource
    .createQueryBuilder()
    .delete()
    .from(Sheet)
    .where('template_id = :id', { id })
    .execute();
  await dataSource.getRepository(Template).delete(id);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

void TemplateStatus;
