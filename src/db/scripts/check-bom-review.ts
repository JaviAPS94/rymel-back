/**
 * El listado de revisión del admin da a cada diseño el estado de lista que
 * le daría la búsqueda de estructuras, y muestra los ajustes del cliente.
 *
 * Compara, diseño por diseño, el estado de `DesignBomReviewService` con lo
 * que responde `BillOfMaterialsService.findByCode` para cada referencia de sus
 * elementos. Guarda un ajuste de prueba sobre un diseño de prueba que crea y
 * borra; no toca ningún diseño existente.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-bom-review.ts
 */

import 'reflect-metadata';
import { config as dotenvConfig } from 'dotenv';
import { DataSource, IsNull } from 'typeorm';
import { Design } from '../../modules/design/entities/design.entity';
import { DesignSubType } from '../../modules/design/entities/design-subtype.entity';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignBomAdjustment } from '../../modules/design/entities/design-bom-adjustment.entity';
import { BillOfMaterials } from '../../modules/bill-of-materials/entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from '../../modules/bill-of-materials/entities/bill-of-materials-node.entity';
import { BillOfMaterialsService } from '../../modules/bill-of-materials/bill-of-materials.service';
import { DesignService } from '../../modules/design/services/design.service';
import { DesignBomAdjustmentService } from '../../modules/design/services/design-bom-adjustment.service';
import { DesignBomReviewService } from '../../modules/design/services/design-bom-review.service';
import { DesignController } from '../../modules/design/design.controller';
import { ROLES_KEY } from '../../modules/auth/decorators/roles.decorator';
import { Role } from '../../modules/auth/enums/role.enum';
import type { CreateDesignDto } from '../../modules/design/dtos/create-desing.dto';
import type { DesignBomReviewRowDto } from '../../modules/design/dtos/design-bom-review.dto';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_BOM_REVIEW__';
let fallos = 0;
const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
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
  const review = new DesignBomReviewService(dataSource);
  const boms = new BillOfMaterialsService(
    dataSource.getRepository(BillOfMaterials),
    dataSource.getRepository(BillOfMaterialsNode),
  );

  const all = async (filters = {}): Promise<{ rows: DesignBomReviewRowDto[]; total: number }> => {
    const first = await review.list({ page: 1, limit: 100, ...filters });
    return { rows: first.data, total: first.total };
  };

  console.log('\n--- estado frente a la búsqueda de estructuras');
  const { rows, total } = await all();
  const activos = await dataSource.getRepository(Design).count({ where: { deletedAt: IsNull() } });
  check('lista todos los diseños activos', total === activos && rows.length === activos, `${total} de ${activos}`);

  let iguales = 0;
  for (const row of rows) {
    if (row.status === 'adjusted') continue;
    const referencias = row.elements.map((e) => e.sapReference).filter(Boolean) as string[];
    let generable = false;
    for (const referencia of referencias) {
      try {
        await boms.findByCode(referencia);
        generable = true;
      } catch {
        // sin estructura para esta referencia
      }
    }
    const esperado = generable ? 'generable' : referencias.length > 0 ? 'no-structure' : 'no-reference';
    if (esperado === row.status) iguales++;
    else check(`diseño ${row.id} (${row.code})`, false, `${row.status}, la búsqueda dice ${esperado}`);
  }
  check('cada estado coincide con la búsqueda', iguales === rows.filter((r) => r.status !== 'adjusted').length, `${iguales}`);

  const porEstado = (estado: string) => rows.filter((r) => r.status === estado);
  console.log(`  generables: ${porEstado('generable').map((r) => r.id).join(', ')}; sin estructura: ${porEstado('no-structure').length}; sin referencia: ${porEstado('no-reference').length}`);
  const generables = await all({ status: 'generable' });
  check('el filtro por estado devuelve los mismos', generables.total === porEstado('generable').length);
  const conReferencia = await all({ sapReference: '1-25-220-120' });
  check('el filtro por referencia encuentra los del prefijo', conReferencia.rows.every((r) => r.elements.some((e) => e.sapReference?.includes('1-25-220-120'))) && conReferencia.total > 0, `${conReferencia.total}`);
  const pagina = await review.list({ page: 1, limit: 5 });
  check('trae normas para el filtro', pagina.norms.length > 0, `${pagina.norms.length}`);
  check('pagina', pagina.data.length === Math.min(5, activos) && pagina.totalPages === Math.ceil(activos / 5));
  check('no trae el contenido de las hojas', !JSON.stringify(pagina.data).includes('"cells"'));

  console.log('\n--- un ajuste del cliente');
  const subtype = await dataSource.getRepository(DesignSubType).findOne({ where: {} });
  const { id } = await new DesignService(dataSource).createDesign({
    name: CODE,
    code: CODE,
    designSubtypeId: subtype!.id,
    elements: [],
    subDesigns: [{ name: 'Resumen', code: 'design-sheet1', data: { cells: {} } }],
  } as unknown as CreateDesignDto);
  try {
    let fila = (await all()).rows.find((r) => r.id === id);
    check('sin elementos, sin referencia', fila?.status === 'no-reference');
    await new DesignBomAdjustmentService(dataSource).save(
      id,
      { bomId: 1, baseFingerprint: 'a'.repeat(64), cells: { B3: { value: '5' } }, expandedNodes: [] },
      'check@rymel',
    );
    fila = (await all({ status: 'adjusted' })).rows.find((r) => r.id === id);
    check('ajustado aparece como ajustado, con autor y fecha', fila?.adjustment?.updatedBy === 'check@rymel' && !!fila.adjustment.updatedAt);
    const hoy = new Date().toISOString().slice(0, 10);
    check('filtra por fecha de ajuste', (await all({ dateField: 'adjusted', from: hoy, to: hoy })).rows.some((r) => r.id === id));
    check('fuera del rango no aparece', !(await all({ dateField: 'adjusted', to: '2000-01-01' })).rows.some((r) => r.id === id));
  } finally {
    await dataSource.getRepository(DesignBomAdjustment).delete({ designId: id });
    await dataSource.getRepository(SubDesign).delete({ design: { id } });
    await dataSource.getRepository(Design).delete(id);
  }

  console.log('\n--- acceso');
  const roles = Reflect.getMetadata(ROLES_KEY, DesignController.prototype.getBomReview) as Role[];
  check('solo ADMIN (DESIGN recibe 403 del guardián de roles)', roles.length === 1 && roles[0] === Role.ADMIN, JSON.stringify(roles));

  await dataSource.destroy();
  console.log(fallos === 0 ? '\nTodas las comprobaciones pasan.' : `\n${fallos} comprobación(es) fallan.`);
  if (fallos > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
