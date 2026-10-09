/**
 * Comprobación de la administración de plantillas contra la base real.
 *
 * Ejercita los casos que el change declara como requisitos y que no se pueden
 * verificar mirando el código: que un código duplicado se rechace, que editar
 * una plantilla publicada no cambie lo que ven los diseñadores, que dos
 * sesiones no se pisen, y que una plantilla inválida no llegue a publicarse.
 *
 * Trabaja sobre una plantilla de prueba que crea y borra, y **no toca ninguna
 * plantilla existente**. Al terminar comprueba que la base quedó como estaba.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-template-admin.ts
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
import { TemplateStatus, TemplateType } from '../../common/enums';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_TEMPLATE__';
let fallos = 0;

const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(
    `${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`,
  );
  if (!condicion) fallos++;
};

const falla = async (
  nombre: string,
  accion: () => Promise<unknown>,
  esperado: string,
) => {
  try {
    await accion();
    check(nombre, false, 'no lanzó ningún error');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(nombre, message.includes(esperado), message.slice(0, 90));
  }
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

  const plantillasAntes = await dataSource
    .getRepository(Template)
    .count({ where: { deletedAt: null } });

  console.log('\n--- alta y borrador');
  const creada = await service.create({
    name: 'Plantilla de comprobación',
    code: CODE,
    type: TemplateType.DESIGN,
    designSubTypeId: 1,
  });
  check('nace en borrador', creada.status === TemplateStatus.DRAFT);
  check('nace en versión 0', creada.version === 0);
  check('nace sin hojas', creada.document.sheets.length === 0);

  await falla(
    'rechaza un código duplicado',
    () =>
      service.create({
        name: 'Otra',
        code: CODE,
        type: TemplateType.DESIGN,
        designSubTypeId: 1,
      }),
    'ya lo usa',
  );

  console.log('\n--- hojas');
  await service.createSheet(creada.id, { name: 'Resumen' });
  const conDosHojas = await service.createSheet(creada.id, { name: 'Tablas' });
  check(
    'las hojas se numeran sin huecos',
    JSON.stringify(conDosHojas.document.sheets.map((s) => s.position)) ===
      '[0,1]',
  );

  await falla(
    'rechaza dos hojas con el mismo nombre',
    () => service.createSheet(creada.id, { name: 'Resumen' }),
    'Ya hay una hoja',
  );

  const guardada = await service.saveSheet(creada.id, 'Tablas', {
    name: 'Tablas',
    cells: {
      B2: { formula: '10' },
      B3: { formula: '20' },
      B4: { formula: '=SUMA(B2:B3)' },
    },
    styles: { ...emptySheetStyles(), hiddenRows: [5] },
  });
  const tablas = guardada.document.sheets.find((s) => s.name === 'Tablas')!;
  check('guarda las celdas de la hoja', Object.keys(tablas.cells).length === 3);
  check(
    'conserva las filas ocultas',
    JSON.stringify(tablas.styles.hiddenRows) === '[5]',
  );

  const reordenada = await service.setSheets(creada.id, {
    names: ['Tablas', 'Resumen'],
  });
  check(
    'reordena las hojas',
    JSON.stringify(reordenada.document.sheets.map((s) => s.name)) ===
      '["Tablas","Resumen"]',
  );

  // La secuencia que produce la interfaz —hoja añadida en memoria y traída al
  // guardar— vive en `check-editor-sequence.ts`. Aquí solo se comprueba que
  // el guardado la crea, que es lo que fallaba.
  const conHojaNueva = await service.saveSheet(creada.id, 'Notas', {
    name: 'Notas',
    cells: { A1: { formula: 'apunte' } },
  });
  check(
    'guardar una hoja que solo existía en el editor la crea',
    conHojaNueva.document.sheets.some((s) => s.name === 'Notas'),
  );

  // Se retira para que las comprobaciones siguientes cuenten las dos hojas
  // con las que se montó la plantilla.
  await service.setSheets(creada.id, { names: ['Tablas', 'Resumen'] });

  console.log('\n--- validación y publicación');
  await service.saveSheet(creada.id, 'Resumen', {
    name: 'Resumen',
    cells: { A1: { formula: '=NoExiste!A1' } },
  });
  const conError = await service.findOne(creada.id);
  check(
    'detecta la referencia a una hoja inexistente',
    conError.diagnostics.some((d) => d.code === 'unknown-sheet'),
  );

  const rechazada = await service.publish(creada.id, { email: 'check' });
  check('no publica con diagnósticos', rechazada.published === false);
  check('la versión no avanza al rechazar', rechazada.version === 0);

  await service.saveSheet(creada.id, 'Resumen', {
    name: 'Resumen',
    cells: { A1: { formula: '=Tablas!B4*2' } },
  });
  const publicada = await service.publish(creada.id, { email: 'check' });
  check('publica cuando el documento es válido', publicada.published === true);
  check('la versión avanza a 1', publicada.version === 1);

  const trasPublicar = await service.findOne(creada.id);
  check('el borrador desaparece al publicar', trasPublicar.hasDraft === false);
  check('queda publicada', trasPublicar.status === TemplateStatus.PUBLISHED);
  check(
    'las hojas quedan en filas',
    (await dataSource.getRepository(Sheet).count({
      where: { template: { id: creada.id }, deletedAt: null },
    })) === 2,
  );

  console.log('\n--- reglas del contrato v2.1.0');
  await service.saveSheet(creada.id, 'Resumen', {
    name: 'Resumen',
    cells: {
      A1: { formula: '=Tablas!B4*2' },
      A2: { formula: '5', materialTag: 'MO' },
      A3: { formula: '7', materialTag: 'MO' },
    },
  });
  const dosMo = await service.publish(creada.id, { email: 'check' });
  check('no publica con dos celdas MO', dosMo.published === false);
  check(
    'lo explica con duplicate-material-tag',
    (await service.findOne(creada.id)).diagnostics.some(
      (d) => d.code === 'duplicate-material-tag',
    ),
  );

  const zonas = [{ id: 'ro-1', startCell: 'A1', endCell: 'A3' }];
  await service.saveSheet(creada.id, 'Resumen', {
    name: 'Resumen',
    cells: { A1: { formula: '=Tablas!B4*2' } },
    styles: { readOnlyZones: zonas },
  });
  const conZonas = await service.findOne(creada.id);
  check(
    'conserva las zonas de solo lectura del borrador',
    JSON.stringify(
      conZonas.document.sheets.find((sheet) => sheet.name === 'Resumen')?.styles
        .readOnlyZones,
    ) === JSON.stringify(zonas),
  );

  console.log('\n--- el borrador no altera lo publicado');
  await service.saveSheet(creada.id, 'Resumen', {
    name: 'Resumen',
    cells: { A1: { formula: '=Tablas!B4*99' } },
  });
  const filasPublicadas = await dataSource.getRepository(Sheet).findOne({
    where: { template: { id: creada.id }, name: 'Resumen', deletedAt: null },
  });
  check(
    'lo publicado sigue intacto mientras se edita',
    filasPublicadas!.cells.includes('*2') &&
      !filasPublicadas!.cells.includes('*99'),
  );

  console.log('\n--- concurrencia');
  const conBorrador = await service.findOne(creada.id);
  await falla(
    'rechaza una escritura basada en un borrador viejo',
    () =>
      service.saveSheet(creada.id, 'Resumen', {
        name: 'Resumen',
        cells: { A1: { formula: '=1' } },
        expectedUpdatedAt: new Date(
          new Date(conBorrador.draftUpdatedAt!).getTime() - 60000,
        ).toISOString(),
      }),
    'cambió desde que la cargaste',
  );

  console.log('\n--- historial y duplicación');
  await service.publish(creada.id, { email: 'check' });
  const revisiones = await service.listRevisions(creada.id);
  check(
    'guarda una instantánea al publicar sobre lo publicado',
    revisiones.length >= 1,
  );

  const restaurada = await service.restoreRevision(creada.id, revisiones[0].id);
  check('restaurar deja un borrador', restaurada.hasDraft === true);
  check('restaurar no cambia la versión publicada', restaurada.version === 2);

  const copia = await service.duplicate(creada.id, { code: `${CODE}_COPIA` });
  check('la copia nace en borrador', copia.status === TemplateStatus.DRAFT);
  check(
    'la copia no hereda el historial',
    (await service.listRevisions(copia.id)).length === 0,
  );
  check('la copia lleva las hojas', copia.document.sheets.length === 2);

  console.log('\n--- limpieza');
  const repo = dataSource.getRepository(Template);
  for (const id of [creada.id, copia.id]) {
    await dataSource.getRepository(TemplateDraft).delete({ templateId: id });
    await dataSource.getRepository(TemplateRevision).delete({ templateId: id });
    await dataSource.getRepository(Sheet).delete({ template: { id } as never });
    await repo.delete(id);
  }

  const plantillasDespues = await repo.count({ where: { deletedAt: null } });
  check(
    'la base queda como estaba',
    plantillasAntes === plantillasDespues,
    `${plantillasAntes} -> ${plantillasDespues}`,
  );

  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasan.'
      : `\n${fallos} comprobación(es) fallan.`,
  );

  await dataSource.destroy();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
