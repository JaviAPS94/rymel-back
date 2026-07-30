import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reemplaza el valor único de comparación de las reglas de potencia/tensión
 * por un rango [min, max] inclusivo. Backfill: min = max = valor histórico
 * (comportamiento de generación de código sin cambios el día del deploy);
 * los rangos reales de negocio se ajustan luego desde project-admin.
 */
export class DesignCodeRulesRange1785300000000 implements MigrationInterface {
  name = 'DesignCodeRulesRange1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // design_code_power_letter: power_kva -> power_kva_min / power_kva_max
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" ADD "power_kva_min" decimal(10,2), "power_kva_max" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_power_letter" SET "power_kva_min" = "power_kva", "power_kva_max" = "power_kva"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" ALTER COLUMN "power_kva_min" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" ALTER COLUMN "power_kva_max" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" DROP COLUMN "power_kva"`,
    );

    // design_code_primary_tension_letter: tension_value -> tension_value_min / tension_value_max
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" ADD "tension_value_min" decimal(10,2), "tension_value_max" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_primary_tension_letter" SET "tension_value_min" = "tension_value", "tension_value_max" = "tension_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" ALTER COLUMN "tension_value_min" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" ALTER COLUMN "tension_value_max" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" DROP COLUMN "tension_value"`,
    );

    // design_code_secondary_tension_letter: tension_value -> tension_value_min / tension_value_max
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" ADD "tension_value_min" decimal(10,2), "tension_value_max" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_secondary_tension_letter" SET "tension_value_min" = "tension_value", "tension_value_max" = "tension_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" ALTER COLUMN "tension_value_min" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" ALTER COLUMN "tension_value_max" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" DROP COLUMN "tension_value"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // design_code_secondary_tension_letter
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" ADD "tension_value" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_secondary_tension_letter" SET "tension_value" = "tension_value_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" ALTER COLUMN "tension_value" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" DROP COLUMN "tension_value_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_secondary_tension_letter" DROP COLUMN "tension_value_max"`,
    );

    // design_code_primary_tension_letter
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" ADD "tension_value" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_primary_tension_letter" SET "tension_value" = "tension_value_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" ALTER COLUMN "tension_value" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" DROP COLUMN "tension_value_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_primary_tension_letter" DROP COLUMN "tension_value_max"`,
    );

    // design_code_power_letter
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" ADD "power_kva" decimal(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "design_code_power_letter" SET "power_kva" = "power_kva_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" ALTER COLUMN "power_kva" decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" DROP COLUMN "power_kva_min"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_code_power_letter" DROP COLUMN "power_kva_max"`,
    );
  }
}
