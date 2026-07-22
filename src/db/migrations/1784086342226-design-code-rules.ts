import { MigrationInterface, QueryRunner } from 'typeorm';

export class DesignCodeRules1784086342226 implements MigrationInterface {
  name = 'DesignCodeRules1784086342226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "design_code_power_letter" ("id" int NOT NULL IDENTITY(1,1), "phase_type" varchar(20) NOT NULL, "power_kva" decimal(10,2) NOT NULL, "letter" varchar(1) NOT NULL, "created_at" datetime2 NOT NULL CONSTRAINT "DF_dcpl_created_at" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_dcpl_updated_at" DEFAULT getdate(), "deleted_at" datetime, CONSTRAINT "PK_design_code_power_letter" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "design_code_primary_tension_letter" ("id" int NOT NULL IDENTITY(1,1), "tension_value" decimal(10,2) NOT NULL, "letter" varchar(1) NOT NULL, "created_at" datetime2 NOT NULL CONSTRAINT "DF_dcptl_created_at" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_dcptl_updated_at" DEFAULT getdate(), "deleted_at" datetime, CONSTRAINT "PK_design_code_primary_tension_letter" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "design_code_secondary_tension_letter" ("id" int NOT NULL IDENTITY(1,1), "tension_value" decimal(10,2) NOT NULL, "letter" varchar(1) NOT NULL, "created_at" datetime2 NOT NULL CONSTRAINT "DF_dcstl_created_at" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_dcstl_updated_at" DEFAULT getdate(), "deleted_at" datetime, CONSTRAINT "PK_design_code_secondary_tension_letter" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "design_code_sap_segment_mapping" ("id" int NOT NULL IDENTITY(1,1), "segment_name" varchar(30) NOT NULL, "segment_index" int NOT NULL, "created_at" datetime2 NOT NULL CONSTRAINT "DF_dcssm_created_at" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_dcssm_updated_at" DEFAULT getdate(), "deleted_at" datetime, CONSTRAINT "PK_design_code_sap_segment_mapping" PRIMARY KEY ("id"), CONSTRAINT "UQ_design_code_sap_segment_mapping_segment_name" UNIQUE ("segment_name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "design_code_suffix_format" ("id" int NOT NULL IDENTITY(1,1), "pattern" varchar(30) NOT NULL, "label" varchar(100) NOT NULL, "is_default" bit NOT NULL CONSTRAINT "DF_dcsf_is_default" DEFAULT 0, "created_at" datetime2 NOT NULL CONSTRAINT "DF_dcsf_created_at" DEFAULT getdate(), "updated_at" datetime2 NOT NULL CONSTRAINT "DF_dcsf_updated_at" DEFAULT getdate(), "deleted_at" datetime, CONSTRAINT "PK_design_code_suffix_format" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "design_code_suffix_format"`);
    await queryRunner.query(`DROP TABLE "design_code_sap_segment_mapping"`);
    await queryRunner.query(
      `DROP TABLE "design_code_secondary_tension_letter"`,
    );
    await queryRunner.query(
      `DROP TABLE "design_code_primary_tension_letter"`,
    );
    await queryRunner.query(`DROP TABLE "design_code_power_letter"`);
  }
}
