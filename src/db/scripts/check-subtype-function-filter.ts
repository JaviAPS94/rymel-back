/**
 * El filtro por subtipo del listado de fórmulas devuelve lo que está asignado.
 *
 * Es la consulta de la que cuelga el catálogo del editor de plantillas: si
 * devuelve vacío, quien escribe una plantilla no tiene ninguna fórmula que
 * insertar aunque el subtipo tenga cinco asignadas.
 *
 * Se comprueba contra la base real porque el fallo que motivó esta
 * comprobación era una relación mal declarada —`DesignFunction` apuntaba a la
 * inversa equivocada—, y eso no se ve leyendo el servicio: se ve en el SQL que
 * TypeORM acaba generando.
 *
 * Solo lee.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-subtype-function-filter.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource, IsNull } from 'typeorm';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { DesignSubType } from '../../modules/design/entities/design-subtype.entity';

dotenvConfig({ path: '.env' });

const ds = new DataSource({
  type: 'mssql',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: ['src/**/*.entity.ts'],
  options: { encrypt: false, trustServerCertificate: true },
});

let fallos = 0;

const check = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(
    `${condicion ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`,
  );
  if (!condicion) fallos++;
};

/** La consulta del listado de administración, con el filtro por subtipo. */
const listar = (subTypeId: number): Promise<DesignFunction[]> =>
  ds
    .getRepository(DesignFunction)
    .createQueryBuilder('f')
    .leftJoinAndSelect('f.versions', 'v')
    .leftJoin('f.designSubTypeFunctions', 'stf')
    .orderBy('f.name', 'ASC')
    .andWhere('f.deletedAt IS NULL')
    .andWhere('stf.design_subtype_id = :subTypeId', { subTypeId })
    .getMany();

const main = async (): Promise<void> => {
  await ds.initialize();

  const sql = ds
    .getRepository(DesignFunction)
    .createQueryBuilder('f')
    .leftJoin('f.designSubTypeFunctions', 'stf')
    .getSql();

  check(
    'la relación une por design_function_id, no por design_subtype_id',
    sql.includes('"stf"."design_function_id"="f"."id"'),
    sql.slice(sql.indexOf('LEFT JOIN "design_subtype_function"')),
  );

  const subTypes = await ds.getRepository(DesignSubType).find();

  for (const subType of subTypes) {
    const asignadas = await ds.getRepository(DesignSubTypeFunction).find({
      where: { designSubType: { id: subType.id }, deletedAt: IsNull() },
      relations: ['designFunction'],
    });

    const esperadas = asignadas
      .filter((relation) => relation.designFunction?.deletedAt == null)
      .map((relation) => relation.designFunction.code)
      .sort();

    const obtenidas = (await listar(subType.id)).map((f) => f.code).sort();

    check(
      `subtipo ${subType.id} (${subType.name}): ${esperadas.length} fórmula(s)`,
      JSON.stringify(esperadas) === JSON.stringify(obtenidas),
      obtenidas.join(', ') || 'no devolvió ninguna',
    );
  }

  const conAsignaciones = subTypes.length;
  console.log(
    `\n${conAsignaciones + 1 - fallos}/${conAsignaciones + 1} comprobaciones correctas`,
  );

  await ds.destroy();
  process.exit(fallos === 0 ? 0 : 1);
};

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
