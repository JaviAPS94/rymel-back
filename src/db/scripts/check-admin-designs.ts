/**
 * El listado de diseños del admin devuelve lo que dice la base, filtro por
 * filtro, y simular un recálculo no escribe.
 *
 * Cada filtro se contrasta con una consulta SQL directa, escrita aparte, para
 * que un error en el servicio no se confirme a sí mismo. Solo lee, salvo un
 * diseño de prueba con un ajuste, que crea y borra.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-admin-designs.ts
 */

import 'reflect-metadata';
import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { Design } from '../../modules/design/entities/design.entity';
import { DesignSubType } from '../../modules/design/entities/design-subtype.entity';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignBomAdjustment } from '../../modules/design/entities/design-bom-adjustment.entity';
import { DesignService } from '../../modules/design/services/design.service';
import { AdminDesignsService } from '../../modules/design/services/admin-designs.service';
import { AdminDesignsController } from '../../modules/design/admin-designs.controller';
import { ROLES_KEY } from '../../modules/auth/decorators/roles.decorator';
import type { AdminDesignFiltersDto } from '../../modules/design/dtos/admin-designs.dto';
import type { CreateDesignDto } from '../../modules/design/dtos/create-desing.dto';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_ADMIN_DESIGNS__';
let fallos = 0;
const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};
const sameIds = (a: number[], b: number[]) =>
  JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

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
  // El recálculo solo se usa en simulación, y con la lista de hojas vacía
  // no llega a evaluar nada; con hojas, la simulación tampoco escribe
  const recalculated: { ids: readonly number[]; dryRun: boolean }[] = [];
  const service = new AdminDesignsService(dataSource, {
    recalculate: async (ids: readonly number[], _by?: string, dryRun = false) => {
      recalculated.push({ ids, dryRun });
      return { recalculated: 0, unchanged: 0, skipped: 0, failed: 0, outcomes: [] };
    },
  } as never);

  const ids = async (filters: Partial<AdminDesignFiltersDto> = {}) =>
    (await service.list({ page: 1, limit: 500, ...filters })).data.map((row) => row.id);
  const sql = async (query: string, params: unknown[] = []) =>
    ((await dataSource.query(query, params)) as { id: number }[]).map((row) => row.id);
  const active = 'SELECT d.id FROM design d WHERE d.deleted_at IS NULL';
  const elementWhere = (condition: string) =>
    `${active} AND d.id IN (SELECT de.design_id FROM design_element de JOIN element e ON e.id = de.element_id
     LEFT JOIN norm n ON n.id = e.norm_id WHERE de.deleted_at IS NULL AND ${condition})`;

  console.log('\n--- listado');
  const todos = await ids();
  const activos = await sql(active);
  check('todos los activos', sameIds(todos, activos), `${todos.length} de ${activos.length}`);
  const pagina = await service.list({ page: 1, limit: 5 });
  check('pagina y ordena del más reciente al más antiguo', pagina.data.length === Math.min(5, activos.length) &&
    pagina.data.every((row, i, rows) => i === 0 || rows[i - 1]!.createdAt >= row.createdAt));
  check('no trae el contenido de las hojas', !JSON.stringify(pagina).includes('"cells"'));
  const { options } = pagina;
  check('opciones de filtros', options.norms.length > 0 && options.countries.length > 0 && options.designSubTypes.length > 0,
    `${options.norms.length} normas, ${options.countries.length} países, ${options.designTypes.length} tipos, ${options.designSubTypes.length} subtipos`);

  console.log('\n--- cada filtro frente a la base');
  const norma = options.norms[0]!;
  check(`norma ${norma.name}`, sameIds(await ids({ normId: norma.id }), await sql(elementWhere('e.norm_id = @0'), [norma.id])));
  const pais = options.countries[0]!;
  check(`país ${pais.name}`, sameIds(await ids({ countryId: pais.id }), await sql(elementWhere('n.country_id = @0'), [pais.id])));
  check('referencia 1-25-220-120', sameIds(await ids({ sapReference: '1-25-220-120' }),
    await sql(elementWhere("e.sap_refence LIKE '%1-25-220-120%'"))));
  const subtipo = options.designSubTypes[0]!;
  check(`subtipo ${subtipo.name}`, sameIds(await ids({ designSubtypeId: subtipo.id }),
    await sql(`${active} AND d.design_subtype_id = @0`, [subtipo.id])));
  const tipo = options.designTypes[0]!;
  check(`tipo ${tipo.name}`, sameIds(await ids({ designTypeId: tipo.id }),
    await sql(`${active} AND d.design_subtype_id IN (SELECT id FROM design_subtype WHERE design_type_id = @0)`, [tipo.id])));
  const [primero] = await dataSource.query(`SELECT TOP 1 code FROM design WHERE deleted_at IS NULL ORDER BY id`);
  check(`código ${primero.code}`, (await ids({ search: primero.code })).length >= 1);
  const staleSql = `${active} AND d.id IN (SELECT design_id FROM sub_design WHERE deleted_at IS NULL AND is_stale = 1)`;
  const desactualizados = await sql(staleSql);
  check('desactualizados', sameIds(await ids({ stale: true }), desactualizados), `${desactualizados.length}`);
  check('no desactualizados', sameIds(await ids({ stale: false }), activos.filter((id) => !desactualizados.includes(id))));
  check('fecha de creación', sameIds(await ids({ from: '2000-01-01', to: '2999-12-31' }), activos) &&
    (await ids({ to: '2000-01-01' })).length === 0);

  console.log('\n--- un diseño de prueba con lista ajustada');
  const subtype = await dataSource.getRepository(DesignSubType).findOne({ where: {} });
  const { id } = await new DesignService(dataSource).createDesign({
    name: CODE,
    code: CODE,
    designSubtypeId: subtype!.id,
    elements: [],
    subDesigns: [{ name: 'Resumen', code: 'design-sheet1', data: { cells: {} } }],
  } as unknown as CreateDesignDto);
  try {
    await dataSource.getRepository(DesignBomAdjustment).save({
      designId: id, bomId: 1, baseFingerprint: 'a'.repeat(64), sheet: '{}', expandedNodes: '[]', updatedBy: 'check@rymel',
    });
    const fila = (await service.list({ page: 1, limit: 500, adjusted: true })).data.find((row) => row.id === id);
    check('con lista ajustada, con autor', fila?.bomAdjustment?.updatedBy === 'check@rymel');
    const ajustadosSql = await sql(`${active} AND d.id IN (SELECT design_id FROM design_bom_adjustment WHERE deleted_at IS NULL)`);
    check('ajustados, igual que la base', sameIds(await ids({ adjusted: true }), ajustadosSql), `${ajustadosSql.length}`);
    check('no ajustados, el resto', !(await ids({ adjusted: false })).includes(id));
    check('la búsqueda por código lo encuentra', (await ids({ search: CODE })).join() === String(id));

    console.log('\n--- recálculo');
    await service.recalculate(id, true, 'check@rymel');
    check('sin hojas desactualizadas, no recalcula nada', recalculated.at(-1)?.ids.length === 0 && recalculated.at(-1)?.dryRun === true);
    await dataSource.getRepository(SubDesign).update({ design: { id } }, { isStale: true });
    await service.recalculate(id, true, 'check@rymel');
    check('pasa solo las hojas desactualizadas, en simulación', recalculated.at(-1)?.ids.length === 1 && recalculated.at(-1)?.dryRun === true);
    let noEncontrado = false;
    try {
      await service.recalculate(-1, true);
    } catch {
      noEncontrado = true;
    }
    check('un diseño inexistente da error', noEncontrado);
  } finally {
    await dataSource.getRepository(DesignBomAdjustment).delete({ designId: id });
    await dataSource.getRepository(SubDesign).delete({ design: { id } });
    await dataSource.getRepository(Design).delete(id);
    check('la base queda como estaba', sameIds(await sql(active), activos));
  }

  console.log('\n--- versiones');
  const [conSello] = await dataSource.query(
    `SELECT TOP 1 sd.design_id AS id, sd.function_versions AS fv FROM sub_design sd JOIN design d ON d.id = sd.design_id
     WHERE d.deleted_at IS NULL AND sd.deleted_at IS NULL AND sd.function_versions IS NOT NULL AND sd.function_versions <> '{}'`,
  );
  if (conSello) {
    const hojas = await service.versions(conSello.id);
    const sello = JSON.parse(conSello.fv) as Record<string, number>;
    const [functionId, versionId] = Object.entries(sello)[0]!;
    const [esperada] = await dataSource.query(`SELECT version FROM design_function_version WHERE id = @0`, [versionId]);
    const fn = hojas.flatMap((hoja) => hoja.functions).find((f) => f.functionId === Number(functionId));
    check(`diseño ${conSello.id}: versión usada traducida a número`, fn?.usedVersion === esperada?.version && !!fn?.code,
      `${fn?.code} v${fn?.usedVersion}, vigente v${fn?.currentVersion}`);
  } else {
    check('hay algún diseño con versiones estampadas', false);
  }

  console.log('\n--- acceso');
  check('solo ADMIN', JSON.stringify(Reflect.getMetadata(ROLES_KEY, AdminDesignsController)) === '["ADMIN"]');

  await dataSource.destroy();
  console.log(fallos === 0 ? '\nTodas las comprobaciones pasan.' : `\n${fallos} comprobación(es) fallan.`);
  if (fallos > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
