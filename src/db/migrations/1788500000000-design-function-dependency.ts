import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fórmulas que invocan a otras fórmulas.
 *
 * Hasta ahora una expresión no podía invocar otra fórmula: el motor cifrado
 * la evaluaba sin conocer las demás y respondía «Undefined function». Por eso
 * la tabla nace vacía. Lo comprobó `check-function-composition.ts` antes de
 * crearla, preguntando al motor qué fórmulas invoca cada versión guardada,
 * sin leer ninguna en claro.
 */
export class DesignFunctionDependency1788500000000
  implements MigrationInterface
{
  name = 'DesignFunctionDependency1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "design_function_dependency" (
        "id" int NOT NULL IDENTITY(1,1),
        "version_id" int NOT NULL,
        "depends_on_function_id" int NOT NULL,
        CONSTRAINT "PK_design_function_dependency" PRIMARY KEY ("id")
      )`,
    );
    // Una versión es inmutable, y con ella sus dependencias: si se borrara la
    // versión, sus filas no significarían nada.
    await queryRunner.query(
      `ALTER TABLE "design_function_dependency" ADD CONSTRAINT "FK_design_function_dependency_version" FOREIGN KEY ("version_id") REFERENCES "design_function_version"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function_dependency" ADD CONSTRAINT "FK_design_function_dependency_function" FOREIGN KEY ("depends_on_function_id") REFERENCES "design_function"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_design_function_dependency" ON "design_function_dependency" ("version_id", "depends_on_function_id")`,
    );
    // Para responder rápido «¿quién la invoca?», que es lo que preguntan la
    // baja, el impacto y el marcado de obsolescencia.
    await queryRunner.query(
      `CREATE INDEX "IX_design_function_dependency_depends_on" ON "design_function_dependency" ("depends_on_function_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IX_design_function_dependency_depends_on" ON "design_function_dependency"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_design_function_dependency" ON "design_function_dependency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function_dependency" DROP CONSTRAINT "FK_design_function_dependency_function"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_function_dependency" DROP CONSTRAINT "FK_design_function_dependency_version"`,
    );
    await queryRunner.query(`DROP TABLE "design_function_dependency"`);
  }
}
