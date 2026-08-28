import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de recálculos por sub-diseño. Aditiva: solo crea una tabla.
 */
export class SubDesignRecalculation1787200000000 implements MigrationInterface {
  name = 'SubDesignRecalculation1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sub_design_recalculation" (
        "id" int NOT NULL IDENTITY(1,1),
        "sub_design_id" int NOT NULL,
        "changed_cells" nvarchar(max) NOT NULL,
        "applied_versions" nvarchar(max) NOT NULL,
        "changed_count" int NOT NULL,
        "triggered_by" nvarchar(255) NULL,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_sub_design_recalculation_created_at" DEFAULT getdate(),
        CONSTRAINT "PK_sub_design_recalculation" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IX_sub_design_recalculation_sub_design"
      ON "sub_design_recalculation" ("sub_design_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IX_sub_design_recalculation_sub_design" ON "sub_design_recalculation"`,
    );
    await queryRunner.query(`DROP TABLE "sub_design_recalculation"`);
  }
}
