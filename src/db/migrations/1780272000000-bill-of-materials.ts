import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillOfMaterials1780272000000 implements MigrationInterface {
  name = 'BillOfMaterials1780272000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bill_of_materials" (
        "id" int NOT NULL IDENTITY(1,1),
        "code" nvarchar(255) NOT NULL,
        "name" nvarchar(255) NOT NULL,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_bom_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_bom_updated_at" DEFAULT getdate(),
        "deleted_at" datetime2,
        CONSTRAINT "PK_bill_of_materials" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "bill_of_materials_node" (
        "id" int NOT NULL IDENTITY(1,1),
        "bill_of_materials_id" int NOT NULL,
        "parent_id" int,
        "semi_finished_id" int NOT NULL,
        "type" nvarchar(50),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_bom_node_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_bom_node_updated_at" DEFAULT getdate(),
        "deleted_at" datetime2,
        CONSTRAINT "PK_bill_of_materials_node" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bom_node_bom" FOREIGN KEY ("bill_of_materials_id")
          REFERENCES "bill_of_materials" ("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_bom_node_parent" FOREIGN KEY ("parent_id")
          REFERENCES "bill_of_materials_node" ("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_bom_node_semi_finished" FOREIGN KEY ("semi_finished_id")
          REFERENCES "semi_finished" ("id") ON DELETE NO ACTION
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bill_of_materials_node"`);
    await queryRunner.query(`DROP TABLE "bill_of_materials"`);
  }
}
