import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versionado de las fórmulas de diseño y estampado de los sub-diseños.
 *
 * Estrictamente aditiva salvo por dos puntos, ambos reversibles: las columnas
 * `expression`, `variables` y `constants` se trasladan de `design_function` a
 * `design_function_version`, y se retira `sub_design_function`, que está vacía
 * y no la consume nadie.
 *
 * Lo que **no** hace: imponer la unicidad de `code` en la base. Los datos
 * actuales tienen `CUBIC` en las filas 6 y 16 y `QUADRATIC` en la 8 y la 10,
 * así que un índice único no llegaría a crearse. Podría resolverlo
 * automáticamente —renombrar, fusionar, borrar— y sería la peor decisión
 * posible: cuál de los dos `CUBIC` sobrevive es una decisión de negocio, y
 * hay diseños calculados con cada uno. La unicidad se aplica en el servicio
 * para lo nuevo, y el índice único se añadirá en otra migración cuando el
 * propietario del producto resuelva los cuatro conflictos heredados.
 */
export class DesignFunctionVersions1787000000000 implements MigrationInterface {
  name = 'DesignFunctionVersions1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "design_function_version" (
        "id" int NOT NULL IDENTITY(1,1),
        "design_function_id" int NOT NULL,
        "version" int NOT NULL,
        "expression" nvarchar(max) NOT NULL,
        "variables" nvarchar(max) NOT NULL,
        "constants" nvarchar(max) NULL,
        "is_current" bit NOT NULL CONSTRAINT "DF_design_function_version_is_current" DEFAULT 0,
        "created_by" nvarchar(255) NULL,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_design_function_version_created_at" DEFAULT getdate(),
        CONSTRAINT "PK_design_function_version" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "design_function_version"
      ADD CONSTRAINT "FK_design_function_version_function"
      FOREIGN KEY ("design_function_id") REFERENCES "design_function"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_design_function_version_number"
      ON "design_function_version" ("design_function_id", "version")
    `);

    // Índice único filtrado: una sola versión vigente por fórmula. Es la
    // clase de invariante que conviene que garantice la base, porque un
    // segundo registro vigente haría que el resultado dependiera del orden
    // de lectura.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_design_function_version_current"
      ON "design_function_version" ("design_function_id")
      WHERE "is_current" = 1
    `);

    // Traslado de las fórmulas existentes a su versión 1, ya vigente. Se
    // conserva `created_at` de la fórmula: la versión 1 nació con ella.
    await queryRunner.query(`
      INSERT INTO "design_function_version"
        ("design_function_id", "version", "expression", "variables", "constants", "is_current", "created_at")
      SELECT
        "id", 1,
        CAST("expression" AS nvarchar(max)),
        CAST("variables" AS nvarchar(max)),
        CAST("constants" AS nvarchar(max)),
        1,
        "created_at"
      FROM "design_function"
    `);

    await queryRunner.query(
      `ALTER TABLE "design_function" DROP COLUMN "expression"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" DROP COLUMN "variables"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" DROP COLUMN "constants"`,
    );

    // Estampado de versiones en los sub-diseños. Va en columnas propias y no
    // dentro de `sub_design.data`: ese JSON lo intercambian tres consumidores
    // y meterle metadatos obligaría a que los tres los entiendan.
    await queryRunner.query(
      `ALTER TABLE "sub_design" ADD "function_versions" nvarchar(max) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_design" ADD "is_stale" bit NOT NULL CONSTRAINT "DF_sub_design_is_stale" DEFAULT 0`,
    );

    // Los sub-diseños existentes no tienen estampado: se calcularon con una
    // versión desconocida, así que arrancan como desactualizados.
    await queryRunner.query(
      `UPDATE "sub_design" SET "is_stale" = 1 WHERE "data" IS NOT NULL`,
    );

    // Índice de apoyo para la búsqueda por código. No es único, a propósito.
    await queryRunner.query(`
      CREATE INDEX "IX_design_function_code_type"
      ON "design_function" ("code", "type")
    `);

    // `sub_design_function` está vacía y no la consume ningún código fuera de
    // las migraciones que la crearon.
    await queryRunner.query(`DROP TABLE "sub_design_function"`);
  }

  /**
   * Reversión probada: devuelve el esquema exactamente a su estado anterior
   * y repuebla `design_function` desde la versión vigente de cada fórmula.
   *
   * **Pierde el historial.** `design_function` solo tiene sitio para una
   * expresión, así que al revertir sobrevive la vigente y las versiones
   * anteriores desaparecen. Un ciclo revertir/reaplicar deja cada fórmula con
   * una única versión 1 cuyo contenido es el de la que era vigente.
   *
   * No es un defecto que se pueda arreglar aquí —es lo que significa volver a
   * un modelo sin versiones— pero sí obliga a hacer copia de seguridad antes
   * de revertir si el historial importa.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sub_design_function" (
        "id" int NOT NULL IDENTITY(1,1),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_sub_design_function_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_sub_design_function_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        "design_function_id" int,
        "sub_design_id" int,
        CONSTRAINT "PK_sub_design_function" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "sub_design_function"
      ADD CONSTRAINT "FK_sub_design_function_design_function"
      FOREIGN KEY ("design_function_id") REFERENCES "design_function"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "sub_design_function"
      ADD CONSTRAINT "FK_sub_design_function_sub_design"
      FOREIGN KEY ("sub_design_id") REFERENCES "sub_design"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `DROP INDEX "IX_design_function_code_type" ON "design_function"`,
    );

    await queryRunner.query(
      `ALTER TABLE "sub_design" DROP CONSTRAINT "DF_sub_design_is_stale"`,
    );
    await queryRunner.query(`ALTER TABLE "sub_design" DROP COLUMN "is_stale"`);
    await queryRunner.query(
      `ALTER TABLE "sub_design" DROP COLUMN "function_versions"`,
    );

    // Se devuelven las columnas a `design_function` y se rellenan desde la
    // versión vigente. `expression` y `variables` vuelven a ser NOT NULL, así
    // que se crean permisivas, se rellenan y se endurecen después.
    await queryRunner.query(
      `ALTER TABLE "design_function" ADD "expression" text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" ADD "variables" text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" ADD "constants" text NULL`,
    );

    await queryRunner.query(`
      UPDATE f
      SET f."expression" = v."expression",
          f."variables"  = v."variables",
          f."constants"  = v."constants"
      FROM "design_function" f
      INNER JOIN "design_function_version" v
        ON v."design_function_id" = f."id" AND v."is_current" = 1
    `);

    // Una fórmula sin versión vigente no debería existir, pero si la hubiera,
    // dejarla con expresión nula impediría restaurar la restricción. Se le
    // pone una expresión vacía y se deja constancia por el valor.
    await queryRunner.query(
      `UPDATE "design_function" SET "expression" = '' WHERE "expression" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "design_function" SET "variables" = '' WHERE "variables" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "design_function" ALTER COLUMN "expression" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" ALTER COLUMN "variables" text NOT NULL`,
    );

    await queryRunner.query(
      `DROP INDEX "UQ_design_function_version_current" ON "design_function_version"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_design_function_version_number" ON "design_function_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function_version" DROP CONSTRAINT "FK_design_function_version_function"`,
    );
    await queryRunner.query(`DROP TABLE "design_function_version"`);
  }
}
