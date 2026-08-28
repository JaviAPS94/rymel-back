import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de accesos al texto plano de las fórmulas.
 *
 * Aditiva por completo: crea una tabla nueva y no toca ninguna existente.
 */
export class DesignFunctionAccessLog1787100000000
  implements MigrationInterface
{
  name = 'DesignFunctionAccessLog1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "design_function_access_log" (
        "id" int NOT NULL IDENTITY(1,1),
        "design_function_id" int NOT NULL,
        "design_function_version_id" int NULL,
        "user_id" uniqueidentifier NULL,
        "user_email" nvarchar(255) NULL,
        "outcome" nvarchar(30) NOT NULL,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_design_function_access_log_created_at" DEFAULT getdate(),
        CONSTRAINT "PK_design_function_access_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IX_design_function_access_log_function"
      ON "design_function_access_log" ("design_function_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IX_design_function_access_log_user"
      ON "design_function_access_log" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IX_design_function_access_log_user" ON "design_function_access_log"`,
    );
    await queryRunner.query(
      `DROP INDEX "IX_design_function_access_log_function" ON "design_function_access_log"`,
    );
    await queryRunner.query(`DROP TABLE "design_function_access_log"`);
  }
}
