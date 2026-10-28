/**
 * Los ajustes de la lista de materiales se guardan, se reemplazan, se borran
 * y sobreviven a guardar el diseño.
 *
 * Pasa por `DesignBomAdjustmentService` y `DesignService`, que es lo que
 * llama el controlador, sobre un diseño de prueba que crea y borra. No toca
 * ningún diseño existente, y al terminar comprueba que la base quedó como
 * estaba. Requiere la migración `DesignBomAdjustment1788700000000`.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-bom-adjustment.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { Design } from '../../modules/design/entities/design.entity';
import { DesignSubType } from '../../modules/design/entities/design-subtype.entity';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignBomAdjustment } from '../../modules/design/entities/design-bom-adjustment.entity';
import { DesignService } from '../../modules/design/services/design.service';
import { DesignBomAdjustmentService } from '../../modules/design/services/design-bom-adjustment.service';
import type { CreateDesignDto } from '../../modules/design/dtos/create-desing.dto';
import type { SaveDesignBomAdjustmentDto } from '../../modules/design/dtos/design-bom-adjustment.dto';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_BOM_ADJUSTMENT__';
let fallos = 0;

const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};

const ajuste = (cantidad: string): SaveDesignBomAdjustmentDto => ({
  bomId: 1,
  baseFingerprint: 'a'.repeat(64),
  cells: {
    B3: { value: '240', formula: '240', computed: '240' },
    D3: { value: cantidad, formula: cantidad, computed: cantidad },
  },
  expandedNodes: [7],
});

const estado = async (accion: () => Promise<unknown>): Promise<number | null> => {
  try {
    await accion();
    return null;
  } catch (error) {
    return (error as { getStatus?: () => number }).getStatus?.() ?? 500;
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
  const designs = new DesignService(dataSource);
  const adjustments = new DesignBomAdjustmentService(dataSource);
  const repo = dataSource.getRepository(DesignBomAdjustment);

  const antes = await repo.count();
  const subtype = await dataSource.getRepository(DesignSubType).findOne({ where: {} });
  const dto = {
    name: CODE,
    code: CODE,
    designSubtypeId: subtype!.id,
    elements: [],
    subDesigns: [{ name: 'Resumen', code: 'design-sheet1', data: { cells: {} } }],
  } as unknown as CreateDesignDto;

  const { id } = await designs.createDesign(dto);
  try {
    console.log('\n--- sin ajustes');
    check('leer responde 404', (await estado(() => adjustments.find(id))) === 404);
    check('borrar responde 404', (await estado(() => adjustments.remove(id))) === 404);
    check('guardar en un diseño inexistente responde 404', (await estado(() => adjustments.save(-1, ajuste('3')))) === 404);

    console.log('\n--- guardar y reemplazar');
    await adjustments.save(id, ajuste('3'), 'check@rymel');
    let leido = await adjustments.find(id);
    check('se lee lo guardado', JSON.parse(leido.sheet).D3.value === '3');
    check('con autor y nodos desplegados', leido.updatedBy === 'check@rymel' && leido.expandedNodes === '[7]');

    await adjustments.save(id, ajuste('5'));
    leido = await adjustments.find(id);
    check('guardar otra vez reemplaza', JSON.parse(leido.sheet).D3.value === '5');
    check('una sola fila por diseño', (await repo.count({ where: { designId: id } })) === 1);

    console.log('\n--- guardar el diseño');
    await designs.updateDesign(id, dto);
    check('los ajustes siguen', JSON.parse((await adjustments.find(id)).sheet).D3.value === '5');

    console.log('\n--- descartar');
    await adjustments.remove(id);
    check('tras borrar, leer responde 404', (await estado(() => adjustments.find(id))) === 404);
    await adjustments.save(id, ajuste('8'));
    check('se puede volver a guardar', JSON.parse((await adjustments.find(id)).sheet).D3.value === '8');

    console.log('\n--- borrar el diseño');
    await designs.deleteById(id);
    const fila = await repo.findOne({ where: { designId: id } });
    check('los ajustes quedan borrados con el diseño', fila?.deletedAt != null);
  } finally {
    console.log('\n--- limpieza');
    await repo.delete({ designId: id });
    await dataSource.getRepository(SubDesign).delete({ design: { id } });
    await dataSource.query('DELETE FROM design_element WHERE design_id = @0', [id]);
    await dataSource.getRepository(Design).delete(id);
    const despues = await repo.count();
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
