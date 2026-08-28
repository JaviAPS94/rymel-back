import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Publicación de plantillas.
 *
 * Hoy una plantilla existe o no existe, y nada distingue una terminada de una
 * a medio escribir. Se nota en los datos: de las cuatro plantillas de la base,
 * tres no tienen una sola hoja y aun así se ofrecen en la biblioteca del
 * diseñador, que las carga en blanco.
 *
 * Con `status`, la biblioteca pasa a devolver solo lo publicado. `version`
 * cuenta las publicaciones, y `template_revision` guarda una instantánea de lo
 * que estaba publicado antes de cada una: es lo único que de verdad se
 * necesita de un historial —poder volver atrás— sin montar el linaje completo
 * que sí hizo falta para las fórmulas. Un diseño guardado copia las hojas
 * dentro de sí, así que editar una plantilla no desactualiza nada.
 *
 * El índice único de `(template_id, order)` **no** se crea aquí: las dos hojas
 * de la plantilla real valen ambas 0 y la creación fallaría. Lo crea la
 * migración de normalización, después de arreglar los datos.
 */
export class TemplatePublication1788000000000 implements MigrationInterface {
  name = 'TemplatePublication1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "template" ADD "status" nvarchar(20) NOT NULL CONSTRAINT "DF_template_status" DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "template" ADD "version" int NOT NULL CONSTRAINT "DF_template_version" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "template" ADD "contract_version" nvarchar(20)`,
    );

    // Las plantillas que hoy están en uso siguen estándolo: la migración de
    // normalización es la que degrada a borrador las que no tienen hojas.
    await queryRunner.query(
      `UPDATE "template" SET "status" = 'PUBLISHED', "version" = 1 WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "template_revision" (
        "id" int NOT NULL IDENTITY(1,1),
        "template_id" int NOT NULL,
        "version" int NOT NULL,
        "document" nvarchar(max) NOT NULL,
        "contract_version" nvarchar(20),
        "author" nvarchar(255),
        "reason" nvarchar(255),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_template_revision_created_at" DEFAULT getdate(),
        CONSTRAINT "PK_template_revision" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_revision" ADD CONSTRAINT "FK_template_revision_template" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_template_revision_template_version" ON "template_revision" ("template_id", "version")`,
    );

    // `code` estaba declarado `nvarchar(max)`, que SQL Server no admite como
    // columna de un índice. Es un tipo desproporcionado para un identificador
    // corto —el más largo que hay guardado son 21 caracteres— y era lo único
    // que impedía imponer su unicidad.
    await queryRunner.query(
      `ALTER TABLE "template" ALTER COLUMN "code" nvarchar(100) NOT NULL`,
    );

    // El índice va filtrado por `deleted_at` para que dar de baja una
    // plantilla libere su código, que es lo que se espera de una baja lógica.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_template_code_active" ON "template" ("code") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_template_code_active" ON "template"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template" ALTER COLUMN "code" nvarchar(max) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_revision" DROP CONSTRAINT "FK_template_revision_template"`,
    );
    await queryRunner.query(`DROP TABLE "template_revision"`);
    await queryRunner.query(
      `ALTER TABLE "template" DROP CONSTRAINT "DF_template_version"`,
    );
    await queryRunner.query(`ALTER TABLE "template" DROP COLUMN "version"`);
    await queryRunner.query(
      `ALTER TABLE "template" DROP CONSTRAINT "DF_template_status"`,
    );
    await queryRunner.query(`ALTER TABLE "template" DROP COLUMN "status"`);
    await queryRunner.query(
      `ALTER TABLE "template" DROP COLUMN "contract_version"`,
    );
  }
}
