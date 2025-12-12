import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAuditFields1764901127685 implements MigrationInterface {
  name = 'UserAuditFields1764901127685';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "created_at" datetime2 NOT NULL CONSTRAINT "DF_c9b5b525a96ddc2c5647d7f7fa5" DEFAULT getdate()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "updated_at" datetime2 NOT NULL CONSTRAINT "DF_6d596d799f9cb9dac6f7bf7c23c" DEFAULT getdate()`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_6d596d799f9cb9dac6f7bf7c23c"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_at"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_c9b5b525a96ddc2c5647d7f7fa5"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_at"`);
  }
}
