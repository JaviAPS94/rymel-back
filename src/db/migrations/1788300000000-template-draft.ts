import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El borrador de una plantilla, como documento aparte.
 *
 * El requisito es que editar una plantilla publicada no cambie lo que ven los
 * diseñadores hasta que se publique. Con una sola fila por plantilla eso no se
 * sostiene: si el editor escribe sobre `sheet`, la biblioteca sirve el
 * borrador a medio hacer.
 *
 * Se consideraron tres formas de resolverlo:
 *
 * 1. Que la biblioteca sirviera la última instantánea publicada en vez de las
 *    filas. Cambia la ruta de lectura de la que depende project-front hoy,
 *    justo antes de migrarlo. Es el momento más caro para tocarla.
 * 2. Una fila de plantilla duplicada como borrador. Obliga a decidir cuál gana
 *    en cada lectura y a excluirla de la unicidad de código.
 * 3. Ésta: **las filas `template` y `sheet` son siempre lo publicado**, y el
 *    borrador vive como un documento JSON aparte. La lectura de la biblioteca
 *    no se toca en absoluto, no hay filas duplicadas, y publicar es volcar el
 *    borrador sobre las filas.
 *
 * El guardado por hoja se conserva donde importa —en el transporte, que es
 * donde pesan los 236 KB de la hoja más grande—: el editor envía una hoja y el
 * servidor sustituye esa hoja dentro del documento.
 */
export class TemplateDraft1788300000000 implements MigrationInterface {
  name = 'TemplateDraft1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "template_draft" (
        "id" int NOT NULL IDENTITY(1,1),
        "template_id" int NOT NULL,
        "document" nvarchar(max) NOT NULL,
        "contract_version" nvarchar(20),
        "updated_by" nvarchar(255),
        "created_at" datetime2 NOT NULL CONSTRAINT "DF_template_draft_created_at" DEFAULT getdate(),
        "updated_at" datetime2 NOT NULL CONSTRAINT "DF_template_draft_updated_at" DEFAULT getdate(),
        CONSTRAINT "PK_template_draft" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_draft" ADD CONSTRAINT "FK_template_draft_template" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Un borrador por plantilla: dos borradores de la misma plantilla no
    // tendrían forma de reconciliarse.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_template_draft_template" ON "template_draft" ("template_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_template_draft_template" ON "template_draft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_draft" DROP CONSTRAINT "FK_template_draft_template"`,
    );
    await queryRunner.query(`DROP TABLE "template_draft"`);
  }
}
