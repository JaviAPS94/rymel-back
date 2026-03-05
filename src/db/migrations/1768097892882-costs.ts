import { MigrationInterface, QueryRunner } from 'typeorm';

export class Costs1768097892882 implements MigrationInterface {
  name = 'Costs1768097892882';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sub_cost" ("id" int NOT NULL IDENTITY(1,1), "name" nvarchar(max) NOT NULL, "code" nvarchar(max) NOT NULL, "data" text, "created_at" datetime2 NOT NULL CONSTRAINT "DF_d2eec23a6394e1b275945ae1fde" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_9f22d39335d229df9890441ec9a" DEFAULT getdate(), "deleted_at" datetime, "cost_id" int, CONSTRAINT "PK_30a413862b5923bf4c985f42afb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cost" ("id" int NOT NULL IDENTITY(1,1), "name" nvarchar(max) NOT NULL, "code" nvarchar(max) NOT NULL, "created_at" datetime2 NOT NULL CONSTRAINT "DF_00a5b480f675c9688d682d00686" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_6bf89294a6bd752a39f67d8ca1e" DEFAULT getdate(), "deleted_at" datetime, "design_id" int, CONSTRAINT "PK_9457483cde444b1dd32aacb24bb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "REL_b85a1e79c493c10e971e61f463" ON "cost" ("design_id") WHERE "design_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function" ADD "type" nvarchar(50) NOT NULL CONSTRAINT "DF_d78271c91725b6c426157171e72" DEFAULT 'DESIGN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "template" ADD "type" nvarchar(50) NOT NULL CONSTRAINT "DF_96f38b63fca0acb1b3fc5220c5e" DEFAULT 'DESIGN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_cost" ADD CONSTRAINT "FK_7764c5f1f45d4770c1cfafc95bd" FOREIGN KEY ("cost_id") REFERENCES "cost"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cost" ADD CONSTRAINT "FK_b85a1e79c493c10e971e61f463c" FOREIGN KEY ("design_id") REFERENCES "design"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cost" DROP CONSTRAINT "FK_b85a1e79c493c10e971e61f463c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_cost" DROP CONSTRAINT "FK_7764c5f1f45d4770c1cfafc95bd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template" DROP CONSTRAINT "DF_96f38b63fca0acb1b3fc5220c5e"`,
    );
    await queryRunner.query(`ALTER TABLE "template" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "design_function" DROP CONSTRAINT "DF_d78271c91725b6c426157171e72"`,
    );
    await queryRunner.query(`ALTER TABLE "design_function" DROP COLUMN "type"`);
    await queryRunner.query(
      `DROP INDEX "REL_b85a1e79c493c10e971e61f463" ON "cost"`,
    );
    await queryRunner.query(`DROP TABLE "cost"`);
    await queryRunner.query(`DROP TABLE "sub_cost"`);
  }
}
