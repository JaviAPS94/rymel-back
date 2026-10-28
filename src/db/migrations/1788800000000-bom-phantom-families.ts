import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Familias de fantasmas colgadas de los semielaborados del árbol de una
 * estructura, y los Tipos PT que soporta la estructura. Las dos tablas nacen
 * vacías y no tocan el árbol de semielaborados.
 */
export class BomPhantomFamilies1788800000000 implements MigrationInterface {
  name = 'BomPhantomFamilies1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bill_of_materials_node_phantom_family" (
        "id" int NOT NULL IDENTITY(1,1),
        "node_id" int NOT NULL,
        "phantom_family_id" int NOT NULL,
        "position" int NOT NULL CONSTRAINT "DF_bom_node_phantom_family_position" DEFAULT 0,
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_bom_node_phantom_family_created_at" DEFAULT getdate(),
        "deleted_at" datetime,
        CONSTRAINT "PK_bom_node_phantom_family" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bom_node_phantom_family_node" FOREIGN KEY ("node_id") REFERENCES "bill_of_materials_node"("id"),
        CONSTRAINT "FK_bom_node_phantom_family_family" FOREIGN KEY ("phantom_family_id") REFERENCES "phantom_family"("id")
      )`,
    );
    // Una familia una sola vez por semielaborado, entre las activas
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_bom_node_phantom_family_active"
        ON "bill_of_materials_node_phantom_family" ("node_id", "phantom_family_id")
        WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "bill_of_materials_product_type" (
        "id" int NOT NULL IDENTITY(1,1),
        "bill_of_materials_id" int NOT NULL,
        "code" nvarchar(50) NOT NULL,
        CONSTRAINT "PK_bill_of_materials_product_type" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bill_of_materials_product_type" UNIQUE ("bill_of_materials_id", "code"),
        CONSTRAINT "FK_bill_of_materials_product_type_bom" FOREIGN KEY ("bill_of_materials_id") REFERENCES "bill_of_materials"("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bill_of_materials_product_type"`);
    await queryRunner.query(
      `DROP TABLE "bill_of_materials_node_phantom_family"`,
    );
  }
}
