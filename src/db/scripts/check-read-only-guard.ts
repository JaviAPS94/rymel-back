/**
 * Las celdas protegidas de un diseño no cambian al actualizarlo, ni aunque la
 * petición se salte la interfaz del diseñador.
 *
 * Pasa por `DesignService.updateDesign`, que es lo que llama el controlador,
 * sobre un diseño de prueba que crea y borra. No toca ningún diseño
 * existente, y al terminar comprueba que la base quedó como estaba.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-read-only-guard.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { Design } from '../../modules/design/entities/design.entity';
import { DesignSubType } from '../../modules/design/entities/design-subtype.entity';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignService } from '../../modules/design/services/design.service';
import type { CreateDesignDto } from '../../modules/design/dtos/create-desing.dto';

dotenvConfig({ path: '.env' });

const CODE = '__CHECK_READ_ONLY__';
let fallos = 0;

const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};

const hoja = (cells: Record<string, unknown>, readOnlyZones = [
  { id: 'ro-1', startCell: 'B2', endCell: 'B5' },
]) => ({
  id: 'design-sheet1',
  name: 'Resumen',
  cells,
  readOnlyZones,
  mergedCells: [],
});

const celdasBase = {
  B2: { value: 'Espesor', formula: 'Espesor', computed: 'Espesor' },
  B3: { value: '=C3*2', formula: '=C3*2', computed: 6 },
  C3: { value: '3', formula: '3', computed: 3 },
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
  const service = new DesignService(dataSource);

  const antes = await dataSource.getRepository(SubDesign).count();
  const subtype = await dataSource.getRepository(DesignSubType).findOne({ where: {} });

  const dto = (sheet: unknown): CreateDesignDto =>
    ({
      name: CODE,
      code: CODE,
      designSubtypeId: subtype!.id,
      elements: [],
      subDesigns: [{ name: 'Resumen', code: 'design-sheet1', data: sheet }],
    }) as unknown as CreateDesignDto;

  const intenta = async (accion: () => Promise<unknown>): Promise<string | null> => {
    try {
      await accion();
      return null;
    } catch (error) {
      const response = (error as { response?: { message?: unknown } }).response;
      return JSON.stringify(response?.message ?? (error as Error).message);
    }
  };

  const { id } = await service.createDesign(dto(hoja(celdasBase)));
  try {
    console.log('\n--- actualizaciones legítimas');
    check(
      'guarda un cambio fuera de la zona, que recalcula una celda protegida',
      (await intenta(() =>
        service.updateDesign(
          id,
          dto(
            hoja({
              ...celdasBase,
              C3: { value: '4', formula: '4', computed: 4 },
              B3: { value: '=C3*2', formula: '=C3*2', computed: 8 },
            }),
          ),
        ),
      )) === null,
    );

    console.log('\n--- actualizaciones rechazadas');
    const tocada = await intenta(() =>
      service.updateDesign(
        id,
        dto(hoja({ ...celdasBase, B3: { value: '99', formula: '99', computed: 99 } })),
      ),
    );
    check('rechaza cambiar una celda protegida', tocada !== null);
    check('nombra la hoja y la celda', tocada?.includes('Resumen!B3') ?? false, tocada ?? '');

    const sinZona = await intenta(() => service.updateDesign(id, dto(hoja(celdasBase, []))));
    check('rechaza quitar la zona', sinZona?.includes('B2:B5') ?? false, sinZona ?? '');

    const guardada = await dataSource.getRepository(SubDesign).findOne({
      where: { design: { id } },
    });
    check(
      'un rechazo no deja cambios a medias',
      JSON.parse(guardada!.data!).cells.B3.formula === '=C3*2',
    );
  } finally {
    console.log('\n--- limpieza');
    await dataSource.getRepository(SubDesign).delete({ design: { id } });
    await dataSource.query('DELETE FROM design_element WHERE design_id = @0', [id]);
    await dataSource.getRepository(Design).delete(id);
    const despues = await dataSource.getRepository(SubDesign).count();
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
