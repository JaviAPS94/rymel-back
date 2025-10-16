import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubtypeDesignTypeRelations1759807970227
  implements MigrationInterface
{
  name = 'SubtypeDesignTypeRelations1759807970227';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "design_subtype" ADD "code" nvarchar(255)`,
    );
    await queryRunner.query(`ALTER TABLE "sub_type" ADD "design_type_id" int`);
    await queryRunner.query(
      `ALTER TABLE "sub_type" ADD CONSTRAINT "FK_afda2ddb8760e2818ebaa350608" FOREIGN KEY ("design_type_id") REFERENCES "design_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sub_type" DROP CONSTRAINT "FK_afda2ddb8760e2818ebaa350608"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_type" DROP COLUMN "design_type_id"`,
    );
    await queryRunner.query(`ALTER TABLE "design_subtype" DROP COLUMN "code"`);
  }
}
