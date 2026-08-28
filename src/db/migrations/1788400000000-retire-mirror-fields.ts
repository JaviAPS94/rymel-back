import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CONTRACT_VERSION,
  readTemplate,
  writeTemplate,
  type PersistedSheet,
} from '@rymel/design-template';

/**
 * Quita del dato guardado los campos espejo, ya retirados del contrato.
 *
 * Eran cuatro —`templateHiddenRows`, `templateHiddenColumns`, `value` y
 * `catalogSheetId`— y existían para que `project-front` funcionara mientras no
 * consumiera el contrato. Ya lo consume, producción va con esa versión, y se
 * comprobó sirviendo las plantillas sin ellos que nada se rompía.
 *
 * El contrato dejó de escribirlos en v2.0.0, pero eso solo vale para lo que se
 * guarde a partir de ahora. Esto los quita de lo que ya está guardado, que es
 * lo que hace que la retirada sea real y no solo una intención.
 *
 * Mismo patrón que el saneamiento: instantánea del contenido literal antes de
 * tocar nada, y `down()` restaura desde ella.
 *
 * **El contrato los sigue aceptando al leer**, así que una copia de seguridad
 * anterior a esta migración se puede restaurar y se lee igual.
 */
export class RetireMirrorFields1788400000000 implements MigrationInterface {
  name = 'RetireMirrorFields1788400000000';

  private static readonly REASON = 'retirada de los campos espejo';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const templates: {
      id: number;
      name: string;
      code: string;
      description: string | null;
      type: string;
      version: number;
    }[] = await queryRunner.query(
      `SELECT "id", "name", "code", "description", "type", "version" FROM "template" WHERE "deleted_at" IS NULL`,
    );

    for (const template of templates) {
      const rows: {
        id: number;
        name: string;
        order: number;
        cells: string;
        cellsStyles: string | null;
      }[] = await queryRunner.query(
        `SELECT "id", "name", "order", "cells", "cellsStyles" FROM "sheet" WHERE "template_id" = @0 AND "deleted_at" IS NULL ORDER BY "order", "id"`,
        [template.id],
      );

      if (rows.length === 0) continue;

      await queryRunner.query(
        `INSERT INTO "template_revision" ("template_id", "version", "document", "contract_version", "author", "reason")
         VALUES (@0, @1, @2, @3, @4, @5)`,
        [
          template.id,
          template.version,
          JSON.stringify({ literal: true, sheets: rows }),
          null,
          'migración',
          RetireMirrorFields1788400000000.REASON,
        ],
      );

      // Leer y volver a escribir con el contrato basta: lo que ya no se
      // escribe, desaparece. Los canónicos estaban desde el saneamiento.
      const persisted: PersistedSheet[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        order: row.order,
        cells: JSON.parse(row.cells) as PersistedSheet['cells'],
        cellsStyles: row.cellsStyles
          ? (JSON.parse(row.cellsStyles) as PersistedSheet['cellsStyles'])
          : null,
      }));

      const rewritten = writeTemplate(
        readTemplate({
          id: template.id,
          name: template.name,
          code: template.code,
          description: template.description ?? undefined,
          type: template.type,
          sheets: persisted,
        }),
      );

      for (const sheet of rewritten.sheets ?? []) {
        await queryRunner.query(
          `UPDATE "sheet" SET "cells" = @0, "cellsStyles" = @1 WHERE "id" = @2`,
          [
            JSON.stringify(sheet.cells),
            JSON.stringify(sheet.cellsStyles ?? {}),
            sheet.id,
          ],
        );
      }

      await queryRunner.query(
        `UPDATE "template" SET "contract_version" = @0 WHERE "id" = @1`,
        [CONTRACT_VERSION, template.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const snapshots: {
      template_id: number;
      version: number;
      document: string;
    }[] = await queryRunner.query(
      `SELECT "template_id", "version", "document" FROM "template_revision" WHERE "reason" = @0 ORDER BY "id"`,
      [RetireMirrorFields1788400000000.REASON],
    );

    for (const snapshot of snapshots) {
      const document = JSON.parse(snapshot.document) as {
        sheets: { id: number; cells: string; cellsStyles: string | null }[];
      };

      for (const sheet of document.sheets) {
        await queryRunner.query(
          `UPDATE "sheet" SET "cells" = @0, "cellsStyles" = @1 WHERE "id" = @2`,
          [sheet.cells, sheet.cellsStyles, sheet.id],
        );
      }
    }

    await queryRunner.query(
      `DELETE FROM "template_revision" WHERE "reason" = @0`,
      [RetireMirrorFields1788400000000.REASON],
    );
  }
}
