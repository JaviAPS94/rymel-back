import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthUser1764034622905 implements MigrationInterface {
  name = 'AuthUser1764034622905';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_a3ffb1c0c8416b9fc6f907b7433" DEFAULT NEWSEQUENTIALID(), "email" nvarchar(255) NOT NULL, "password_hash" nvarchar(255) NOT NULL, "roles" ntext NOT NULL, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
