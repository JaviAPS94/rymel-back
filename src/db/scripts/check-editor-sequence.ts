/**
 * La secuencia que produce la interfaz.
 *
 * Existe porque `check-template-admin.ts` no la ejercitaba: llamaba a
 * `createSheet` del servidor, y **el editor no lo hace**. Añade la hoja a su
 * estado en memoria y espera a que el guardado la lleve. La diferencia entre
 * las dos secuencias dejó pasar dos fallos que sí llegaron al usuario:
 *
 * 1. una plantilla nueva perdía todas sus hojas —el guardado fallaba con «la
 *    plantilla no tiene una hoja X» y publicar respondía «una plantilla sin
 *    hojas no se puede publicar»;
 * 2. publicar con cambios sin guardar respondía «no hay cambios que publicar».
 *
 * La lección está en el nombre: probar el servicio no es probar lo que hace la
 * interfaz.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-editor-sequence.ts
 */

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
import { TemplateType } from '../../common/enums';

dotenvConfig({ path: '.env' });

const CODE = '__EDITOR_SEQUENCE__';
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

  const service = new TemplateAdminService(
    dataSource.getRepository(Template),
    dataSource.getRepository(Sheet),
    dataSource.getRepository(TemplateDraft),
    dataSource.getRepository(TemplateRevision),
    dataSource.getRepository(DesignSubTypeFunction),
    dataSource.getRepository(DesignFunction),
    dataSource.getRepository(DesignFunctionVersion),
    dataSource,
  );

  const previous = await dataSource
    .getRepository(Template)
    .findOne({ where: { code: CODE } });
  if (previous) await purge(dataSource, previous.id);

  console.log('\n=== plantilla nueva, con una hoja añadida en el editor');

  const created = await service.create({
    name: 'Reproducción',
    code: CODE,
    type: TemplateType.DESIGN,
    designSubTypeId: 1,
  });
  check('nace sin hojas', created.document.sheets.length === 0);

  // Lo que hace el editor: `addSheet` es estado local, y la hoja llega con el
  // guardado sin haberse creado antes en el servidor.
  const conHoja = await service.saveSheet(created.id, 'Hoja1', {
    name: 'Hoja1',
    cells: { A1: { formula: 'hola' } },
    styles: { ...emptySheetStyles() },
  });
  check(
    'guardar una hoja que solo existía en el editor la crea',
    conHoja.document.sheets.some((sheet) => sheet.name === 'Hoja1'),
  );

  const publishNew = await service.publish(created.id, { email: 'secuencia' });
  check(
    'la plantilla nueva se publica',
    publishNew.published,
    publishNew.diagnostics.map((d) => d.message).join('; '),
  );

  console.log('\n=== plantilla publicada, se escribe un texto y se publica');

  // El editor guarda antes de publicar: es la corrección del lado del cliente.
  await service.saveSheet(created.id, 'Hoja1', {
    name: 'Hoja1',
    cells: { A1: { formula: 'hola' }, A2: { formula: 'texto simple' } },
    styles: { ...emptySheetStyles() },
  });
  const publishEdited = await service.publish(created.id, {
    email: 'secuencia',
  });
  check('se publica la edición', publishEdited.published);
  check('la versión avanza', publishEdited.version === 2);

  const tras = await service.findOne(created.id);
  check(
    'el texto queda publicado',
    tras.document.sheets[0]?.cells.A2?.content === 'texto simple',
    String(tras.document.sheets[0]?.cells.A2?.content),
  );

  await expectRejection(
    'publicar sin nada pendiente lo dice con claridad',
    () => service.publish(created.id, { email: 'secuencia' }),
    'lo guardado ya es lo que está publicado',
  );

  console.log('\n=== estructura: añadir, eliminar y reordenar desde el editor');

  const conTres = await service.setSheets(created.id, {
    names: ['Hoja1', 'Tablas', 'Notas'],
  });
  check(
    'las hojas que el editor añadió se crean',
    JSON.stringify(conTres.document.sheets.map((s) => s.name)) ===
      '["Hoja1","Tablas","Notas"]',
    conTres.document.sheets.map((s) => s.name).join(', '),
  );

  await service.saveSheet(created.id, 'Tablas', {
    name: 'Tablas',
    cells: { B1: { formula: '42' } },
  });

  // Eliminar y reordenar no ensucia ninguna hoja: sin la llamada de
  // estructura, estos cambios no llegaban nunca al servidor.
  const reordenada = await service.setSheets(created.id, {
    names: ['Tablas', 'Hoja1'],
  });
  check(
    'la hoja eliminada desaparece y el orden es el pedido',
    JSON.stringify(reordenada.document.sheets.map((s) => s.name)) ===
      '["Tablas","Hoja1"]',
    reordenada.document.sheets.map((s) => s.name).join(', '),
  );
  check(
    'el contenido de la hoja que sigue sobrevive',
    reordenada.document.sheets.find((s) => s.name === 'Tablas')?.cells.B1
      ?.content === '42',
  );

  await expectRejection(
    'una lista con nombres repetidos se rechaza',
    () => service.setSheets(created.id, { names: ['Tablas', 'Tablas'] }),
    'más de una hoja llamada',
  );

  console.log('\n=== limpieza');
  await purge(dataSource, created.id);
  const stillThere = await dataSource
    .getRepository(Template)
    .findOne({ where: { code: CODE } });
  check('la plantilla de prueba se borra', stillThere === null);

  console.log(
    failures === 0
      ? '\nLa secuencia del editor funciona de punta a punta.'
      : `\n${failures} comprobación(es) fallan.`,
  );

  await dataSource.destroy();
  process.exit(failures === 0 ? 0 : 1);
}

/** Comprueba que una operación se rechaza, y con qué motivo. */
const expectRejection = async (
  name: string,
  action: () => Promise<unknown>,
  expected: string,
): Promise<void> => {
  try {
    await action();
    check(name, false, 'no lanzó ningún error');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, message.includes(expected), message.slice(0, 80));
  }
};

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
