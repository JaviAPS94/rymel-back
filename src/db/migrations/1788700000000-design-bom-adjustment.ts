import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajustes del diseñador a la lista de materiales de un diseño: una fila por
 * diseño como mucho. La tabla nace vacía; ningún dato existente se mueve.
 */
export class DesignBomAdjustment1788700000000 implements MigrationInterface {
  name = 'DesignBomAdjustment1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "design_bom_adjustment" (
        "id" int NOT NULL IDENTITY(1,1),
        "design_id" int NOT NULL,
        "bom_id" int NOT NULL,
        "base_fingerprint" nvarchar(64) NOT NULL,
        "sheet" nvarchar(max) NOT NULL,
        "expanded_nodes" nvarchar(max) NOT NULL,
        "updated_by" nvarchar(255),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_design_bom_adjustment_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_design_bom_adjustment_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_design_bom_adjustment" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_design_bom_adjustment_design" UNIQUE ("design_id"),
        CONSTRAINT "FK_design_bom_adjustment_design" FOREIGN KEY ("design_id") REFERENCES "design"("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "design_bom_adjustment"`);
  }
}
