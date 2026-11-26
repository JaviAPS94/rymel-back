/**
 * Familias de fantasmas en el árbol de una estructura y los Tipos PT que la
 * estructura soporta, contra la base real.
 *
 * Pasa por `BillOfMaterialsService` y `PhantomProcessService`, que es lo que
 * llaman los controladores, sobre una estructura y un proceso de prueba que
 * crea y borra. Lee los fantasmas reales (F. Emblemas, F. Acc Alis) sin
 * tocarlos. Requiere la migración `BomPhantomFamilies1788800000000`.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-bom-phantoms.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { BillOfMaterialsService } from '../../modules/bill-of-materials/bill-of-materials.service';
import { BillOfMaterials } from '../../modules/bill-of-materials/entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from '../../modules/bill-of-materials/entities/bill-of-materials-node.entity';
import { BillOfMaterialsNodePhantomFamily } from '../../modules/bill-of-materials/entities/bill-of-materials-node-phantom-family.entity';
import { BillOfMaterialsProductType } from '../../modules/bill-of-materials/entities/bill-of-materials-product-type.entity';
import { PhantomFamily } from '../../modules/phantom-item/entities/phantom-family.entity';
import { PhantomProcess } from '../../modules/phantom-item/entities/phantom-process.entity';
import { PhantomProcessColumn } from '../../modules/phantom-item/entities/phantom-process-column.entity';
import { PhantomProcessService } from '../../modules/phantom-item/services/phantom-process.service';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_BOM_PHANTOMS__';
let fallos = 0;
const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};
const rejects = async (promise: Promise<unknown>): Promise<{ status?: number; message: string } | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as { status?: number; message: string };
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
  const boms = new BillOfMaterialsService(
    dataSource.getRepository(BillOfMaterials),
    dataSource.getRepository(BillOfMaterialsNode),
    dataSource.getRepository(BillOfMaterialsNodePhantomFamily),
    dataSource.getRepository(BillOfMaterialsProductType),
    dataSource.getRepository(PhantomFamily),
    dataSource,
  );
  const processes = new PhantomProcessService(
    dataSource.getRepository(PhantomProcess),
    dataSource.getRepository(PhantomFamily),
    dataSource.getRepository(PhantomProcessColumn),
    dataSource,
  );

  const familyId = async (name: string, processName: string): Promise<number> => {
    const [row] = await dataSource.query(
      `SELECT f.id FROM phantom_family f JOIN phantom_process p ON p.id = f.process_id
        WHERE f.name = @0 AND p.name = @1 AND f.deleted_at IS NULL`,
      [name, processName],
    );
    return row.id;
  };
  const familyCount = async (id: number, types: string[] | null): Promise<number> => {
    const [row] = await dataSource.query(
      `SELECT COUNT(*) n FROM phantom_item WHERE deleted_at IS NULL AND family_id = @0
        ${types ? `AND finished_product_type IN (${types.map((_, k) => `@${k + 1}`).join(', ')})` : ''}`,
      [id, ...(types ?? [])],
    );
    return Number(row.n);
  };

  let bomId: number | null = null;
  let tempProcessId: number | null = null;
  try {
    console.log('\n--- el contrato del árbol de hoy');
    const [existing] = await dataSource.query(
      `SELECT TOP 1 b.id FROM bill_of_materials b
        WHERE b.deleted_at IS NULL AND EXISTS (SELECT 1 FROM bill_of_materials_node n WHERE n.bill_of_materials_id = b.id AND n.deleted_at IS NULL)`,
    );
    if (existing) {
      const detail = await boms.findOne(existing.id);
      const keys = new Set<string>();
      const walk = (nodes: any[]) => nodes.forEach((n) => { Object.keys(n).forEach((k) => keys.add(k)); walk(n.children); });
      walk(detail.nodes);
      check(
        'cada nodo trae lo de siempre más phantomFamilies',
        [...keys].sort().join() === ['children', 'id', 'parentId', 'phantomFamilies', 'semiFinished', 'type'].join(),
        [...keys].sort().join(),
      );
    }

    console.log('\n--- familias bajo un semielaborado');
    const bom = await boms.create({ code: CODE, name: 'Prueba de fantasmas' });
    bomId = bom.id;
    const root = await boms.addNode(bom.id, { semiFinishedId: 1 });
    const child = await boms.addNode(bom.id, { semiFinishedId: 5, parentId: root.id });
    const emblemas = await familyId('F. Emblemas', 'EMBLEMADO');
    const alis = await familyId('F. Acc Alis', 'ALISTAMIENTO Y ENCUBE');

    await boms.addPhantomFamilies(child.id, [emblemas, alis]);
    let detail = await boms.findOne(bom.id);
    const families = detail.nodes[0].children[0].phantomFamilies;
    check(
      'quedan bajo ENSAMBLEFINAL, en el orden pedido y con su proceso',
      families.map((f: any) => `${f.family.name}·${f.process.name}`).join() ===
        'F. Emblemas·EMBLEMADO,F. Acc Alis·ALISTAMIENTO Y ENCUBE',
    );
    check('el semielaborado raíz no tiene familias', detail.nodes[0].phantomFamilies.length === 0);
    check('sin tipos, la familia ofrece todos sus fantasmas',
      families[0].offered === (await familyCount(emblemas, null)), String(families[0].offered));

    const repeated = await rejects(boms.addPhantomFamilies(child.id, [emblemas]));
    check('repetirla bajo el mismo nodo es un conflicto', repeated?.status === 409, repeated?.message);
    const missing = await rejects(boms.addPhantomFamilies(child.id, [99999999]));
    check('una familia inexistente es un error de validación', missing?.status === 400, missing?.message);
    await boms.addPhantomFamilies(root.id, [emblemas]);
    check('la misma familia puede ir bajo otro semielaborado',
      (await boms.findOne(bom.id)).nodes[0].phantomFamilies.length === 1);

    console.log('\n--- tipos de la estructura');
    const saved = await boms.setProductTypes(bom.id, ['1CA', ' 3catc ', '1ca', '']);
    check('se guardan sin repetidos ni vacíos', saved.join() === '1CA,3catc', saved.join());
    detail = await boms.findOne(bom.id);
    const expected = await familyCount(emblemas, ['1CA', '3CATC']);
    const offered = detail.nodes[0].children[0].phantomFamilies[0].offered;
    check('F. Emblemas ofrece sus 1CA y 3CATC, sin distinguir mayúsculas', offered === expected && expected === 22,
      `${offered} de ${expected}`);
    check('la estructura devuelve sus tipos', (detail as any).productTypes.length === 2);
    const items = await boms.offeredPhantomItems(bom.id, emblemas);
    check('la lista de fantasmas ofrecidos coincide con el contador', items.length === offered);
    check('todos son de los tipos de la estructura y traen sus componentes',
      items.every((i) => ['1CA', '3CATC'].includes(i.finishedProductType) && i.componentsCount > 0));
    check('F. Acc Alis no ofrece ninguno (no tiene 1CA ni 3CATC)',
      detail.nodes[0].children[0].phantomFamilies[1].offered === 0);

    await boms.setProductTypes(bom.id, []);
    check('sin tipos otra vez, ofrece todos',
      (await boms.findOne(bom.id)).nodes[0].children[0].phantomFamilies[0].offered === (await familyCount(emblemas, null)));

    console.log('\n--- quitar y dar de baja');
    const link = (await boms.findOne(bom.id)).nodes[0].children[0].phantomFamilies[1];
    await boms.removePhantomFamily(link.id);
    check('quitar una familia la saca del árbol',
      (await boms.findOne(bom.id)).nodes[0].children[0].phantomFamilies.length === 1);
    const [{ n: alisItems }] = await dataSource.query(
      `SELECT COUNT(*) n FROM phantom_item WHERE family_id = @0 AND deleted_at IS NULL`, [alis]);
    check('y no toca sus fantasmas', Number(alisItems) === (await familyCount(alis, null)) && Number(alisItems) > 0);

    const temp = await processes.create(`${CODE} proceso`);
    tempProcessId = temp.id;
    const tempFamily = await processes.createFamily(temp.id, 'F. Temporal');
    await boms.addPhantomFamilies(child.id, [tempFamily.id]);
    const inUse = await rejects(processes.remove(temp.id));
    check('un proceso vacío con familias en una estructura no se da de baja',
      inUse?.status === 409 && inUse.message.includes(CODE), inUse?.message);

    await boms.removeNode(root.id);
    const [{ n: active }] = await dataSource.query(
      `SELECT COUNT(*) n FROM bill_of_materials_node_phantom_family nf
        JOIN bill_of_materials_node n ON n.id = nf.node_id
       WHERE n.bill_of_materials_id = @0 AND nf.deleted_at IS NULL`, [bom.id]);
    check('eliminar el semielaborado quita las familias de todo su subárbol', Number(active) === 0);
    await processes.remove(temp.id);
    check('ya fuera del árbol, el proceso se da de baja', true);
  } finally {
    if (bomId !== null) {
      await dataSource.query(
        `DELETE nf FROM bill_of_materials_node_phantom_family nf JOIN bill_of_materials_node n ON n.id = nf.node_id
          WHERE n.bill_of_materials_id = @0`, [bomId]);
      await dataSource.query(`DELETE FROM bill_of_materials_product_type WHERE bill_of_materials_id = @0`, [bomId]);
      await dataSource.query(`DELETE FROM bill_of_materials_node WHERE bill_of_materials_id = @0`, [bomId]);
      await dataSource.query(`DELETE FROM bill_of_materials WHERE id = @0`, [bomId]);
    }
    if (tempProcessId !== null) {
      await dataSource.query(`DELETE FROM phantom_family WHERE process_id = @0`, [tempProcessId]);
      await dataSource.query(`DELETE FROM phantom_process_column WHERE process_id = @0`, [tempProcessId]);
      await dataSource.query(`DELETE FROM phantom_process WHERE id = @0`, [tempProcessId]);
    }
    const [{ n: left }] = await dataSource.query(
      `SELECT (SELECT COUNT(*) FROM bill_of_materials WHERE code = @0)
            + (SELECT COUNT(*) FROM phantom_process WHERE name LIKE @1) n`, [CODE, `${CODE}%`]);
    check('la base quedó como estaba', Number(left) === 0);
    await dataSource.destroy();
  }

  console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} comprobación(es) fallan`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
