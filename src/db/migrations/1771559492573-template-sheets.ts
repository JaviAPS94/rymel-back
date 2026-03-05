import { MigrationInterface, QueryRunner } from 'typeorm';

export class TemplateSheets1771559492573 implements MigrationInterface {
  name = 'TemplateSheets1771559492573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sheet" ("id" int NOT NULL IDENTITY(1,1), "name" nvarchar(255) NOT NULL, "cellsStyles" text, "cells" text NOT NULL, "order" int NOT NULL CONSTRAINT "DF_ddafb27ef7ce4c04d88473fbe51" DEFAULT 0, "created_at" datetime2 NOT NULL CONSTRAINT "DF_39b277efb1241ea079760ab2746" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_097a0d2502b67e838bdf9d9ec64" DEFAULT getdate(), "deleted_at" datetime, "template_id" int, CONSTRAINT "PK_dad09477f092119a15d46ee598e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "template" DROP COLUMN "cellsStyles"`);
    await queryRunner.query(`ALTER TABLE "template" DROP COLUMN "cells"`);
    await queryRunner.query(
      `ALTER TABLE "sheet" ADD CONSTRAINT "FK_dc7b476c8044505ed98462a5f2f" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sheet" DROP CONSTRAINT "FK_dc7b476c8044505ed98462a5f2f"`,
    );
    await queryRunner.query(`ALTER TABLE "template" ADD "cells" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "template" ADD "cellsStyles" text`);
    await queryRunner.query(`DROP TABLE "sheet"`);
  }
}
