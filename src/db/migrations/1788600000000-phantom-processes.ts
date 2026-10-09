import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phantom items organized by plant process, as in the business's workbook:
 * one sheet per process, families inside each process, and columns that
 * change from one process to another.
 *
 * Existing phantom items (one, with nine lines, when this was written) go to
 * a «General» process whose columns are the catalog as it was, so nothing
 * changes for them.
 *
 * Each process keeps what goes between the phantom root and the kVA in the
 * reference: in EMBLEMADO the kVA brings its own separator, in the other
 * sheets the formula adds a space. «General» keeps the rule as it was.
 *
 * The column list is written out instead of imported from the catalog: a
 * migration must keep meaning the same thing if the catalog changes later.
 */
const GENERAL_COLUMNS: [string, string][] = [
  ['finishedProductType', 'Tipo PT'],
  ['workInProcessType', 'Tipo PP'],
  ['phantomRootCode', 'Raiz Fantasma'],
  ['kvaRatingStandard', 'R kVA + Norma / Otros'],
  ['itemCode', 'Item'],
  ['reference', 'Referencia'],
  ['referenceLength', 'Largo 40/50'],
  ['itemDescription', 'Desc. item'],
  ['itemDescriptionLength', 'Largo 40'],
  ['shortDescription', 'Desc. corta'],
  ['shortDescriptionLength', 'Largo 20'],
  ['unitOfMeasure', 'UM'],
  ['componentItemCode', 'ÍTEM - COMPONENTE'],
  ['description', 'DESCRIPCIÓN'],
  ['baseQuantity', 'CANT. BASE'],
  ['requiredQuantity', 'CANT. REQUERIDA'],
  ['requiredQuantityPerUnit', 'CANT. REQUERIDA UNITARIA'],
  ['componentUnitOfMeasure', 'U.M'],
  ['wastePercentage', '% DESP.'],
  ['consumptionWarehouse', 'BODEGA CONSUMO'],
];

export class PhantomProcesses1788600000000 implements MigrationInterface {
  name = 'PhantomProcesses1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "phantom_process" (
        "id" int NOT NULL IDENTITY(1,1),
        "name" nvarchar(100) NOT NULL,
        "position" int NOT NULL CONSTRAINT "DF_phantom_process_position" DEFAULT 0,
        "reference_separator" nvarchar(5) NOT NULL CONSTRAINT "DF_phantom_process_reference_separator" DEFAULT '',
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_phantom_process_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_phantom_process_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_phantom_process" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_phantom_process_name" ON "phantom_process" ("name") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "phantom_family" (
        "id" int NOT NULL IDENTITY(1,1),
        "process_id" int NOT NULL,
        "name" nvarchar(100) NOT NULL,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_phantom_family_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_phantom_family_updated_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_phantom_family" PRIMARY KEY ("id"),
        CONSTRAINT "FK_phantom_family_process" FOREIGN KEY ("process_id") REFERENCES "phantom_process"("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_phantom_family_name" ON "phantom_family" ("process_id", "name") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "phantom_process_column" (
        "id" int NOT NULL IDENTITY(1,1),
        "process_id" int NOT NULL,
        "position" int NOT NULL,
        "key" nvarchar(100) NOT NULL,
        "header" nvarchar(100) NOT NULL,
        "scope" nvarchar(20) NOT NULL CONSTRAINT "DF_phantom_process_column_scope" DEFAULT 'COMPONENT',
        CONSTRAINT "PK_phantom_process_column" PRIMARY KEY ("id"),
        CONSTRAINT "FK_phantom_process_column_process" FOREIGN KEY ("process_id") REFERENCES "phantom_process"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_phantom_process_column_key" ON "phantom_process_column" ("process_id", "key")`,
    );

    // The «General» process, with the catalog as its columns
    await queryRunner.query(
      `INSERT INTO "phantom_process" ("name", "position") VALUES (N'General', 0)`,
    );
    const [{ id }] = await queryRunner.query(
      `SELECT "id" FROM "phantom_process" WHERE "name" = N'General'`,
    );
    for (const [position, [key, header]] of GENERAL_COLUMNS.entries()) {
      await queryRunner.query(
        `INSERT INTO "phantom_process_column" ("process_id", "position", "key", "header", "scope") VALUES (@0, @1, @2, @3, 'COMPONENT')`,
        [id, position, key, header],
      );
    }

    await queryRunner.query(`ALTER TABLE "phantom_item" ADD "process_id" int`);
    await queryRunner.query(`ALTER TABLE "phantom_item" ADD "family_id" int`);
    await queryRunner.query(
      `ALTER TABLE "phantom_item" ADD "extra_values" nvarchar(max)`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item_component" ADD "extra_values" nvarchar(max)`,
    );
    await queryRunner.query(`UPDATE "phantom_item" SET "process_id" = @0`, [
      id,
    ]);
    await queryRunner.query(
      `ALTER TABLE "phantom_item" ALTER COLUMN "process_id" int NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" ADD CONSTRAINT "FK_phantom_item_process" FOREIGN KEY ("process_id") REFERENCES "phantom_process"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" ADD CONSTRAINT "FK_phantom_item_family" FOREIGN KEY ("family_id") REFERENCES "phantom_family"("id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_phantom_item_process_family" ON "phantom_item" ("process_id", "family_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IX_phantom_item_process_family" ON "phantom_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" DROP CONSTRAINT "FK_phantom_item_family"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" DROP CONSTRAINT "FK_phantom_item_process"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item_component" DROP COLUMN "extra_values"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" DROP COLUMN "extra_values"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" DROP COLUMN "family_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phantom_item" DROP COLUMN "process_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_phantom_process_column_key" ON "phantom_process_column"`,
    );
    await queryRunner.query(`DROP TABLE "phantom_process_column"`);
    await queryRunner.query(
      `DROP INDEX "UQ_phantom_family_name" ON "phantom_family"`,
    );
    await queryRunner.query(`DROP TABLE "phantom_family"`);
    await queryRunner.query(
      `DROP INDEX "UQ_phantom_process_name" ON "phantom_process"`,
    );
    await queryRunner.query(`DROP TABLE "phantom_process"`);
  }
}
