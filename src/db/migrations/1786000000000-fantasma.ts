import { MigrationInterface, QueryRunner } from 'typeorm';

export class Fantasma1786000000000 implements MigrationInterface {
  name = 'Fantasma1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fantasma" (
        "id" int NOT NULL IDENTITY(1,1),
        "tipo_pt" nvarchar(50) NOT NULL,
        "tipo_pp" nvarchar(50) NOT NULL,
        "raiz_fantasma" nvarchar(100) NOT NULL,
        "r_kva_norma" nvarchar(100),
        "item" nvarchar(50) NOT NULL,
        "referencia" nvarchar(60) NOT NULL,
        "desc_item" nvarchar(60) NOT NULL,
        "desc_corta" nvarchar(40) NOT NULL,
        "um" nvarchar(20),
        "limite_referencia" int NOT NULL CONSTRAINT "DF_fantasma_limite_referencia" DEFAULT 40,
        "formulas" nvarchar(max),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_fantasma_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_fantasma_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_fantasma" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fantasma_component" (
        "id" int NOT NULL IDENTITY(1,1),
        "fantasma_id" int NOT NULL,
        "orden" int NOT NULL CONSTRAINT "DF_fantasma_component_orden" DEFAULT 0,
        "item_componente" nvarchar(50) NOT NULL,
        "descripcion" nvarchar(255),
        "cant_base" decimal(18,6) NOT NULL,
        "cant_requerida" decimal(18,6) NOT NULL,
        "cant_requerida_unitaria" decimal(18,6),
        "um_componente" nvarchar(20),
        "porcentaje_desperdicio" decimal(5,4),
        "bodega_consumo" nvarchar(20),
        "formulas" nvarchar(max),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_fantasma_component_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_fantasma_component_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_fantasma_component" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "fantasma_component"
      ADD CONSTRAINT "FK_fantasma_component_fantasma"
      FOREIGN KEY ("fantasma_id") REFERENCES "fantasma"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // El ítem SAP es único solo entre los fantasmas vivos: un ítem liberado por
    // un borrado lógico puede volver a usarse.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_fantasma_item_activo"
      ON "fantasma" ("item")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_fantasma_component_fantasma_id"
      ON "fantasma_component" ("fantasma_id")
    `);

    // Acompaña los filtros del listado
    await queryRunner.query(`
      CREATE INDEX "IDX_fantasma_raiz_fantasma"
      ON "fantasma" ("raiz_fantasma")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_fantasma_raiz_fantasma" ON "fantasma"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_fantasma_component_fantasma_id" ON "fantasma_component"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_fantasma_item_activo" ON "fantasma"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fantasma_component" DROP CONSTRAINT "FK_fantasma_component_fantasma"`,
    );
    await queryRunner.query(`DROP TABLE "fantasma_component"`);
    await queryRunner.query(`DROP TABLE "fantasma"`);
  }
}
