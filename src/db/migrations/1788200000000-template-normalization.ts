import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CONTRACT_VERSION,
  readTemplate,
  writeTemplate,
  type PersistedSheet,
} from '@rymel/design-template';
import { TemplateStatus } from '../../common/enums';

/**
 * Saneamiento de las plantillas guardadas.
 *
 * Lo que hay en la base no cumple el contrato que este cambio establece, y no
 * por descuido: nunca hubo un contrato que cumplir. Simulado antes de
 * escribir (`dry-run-template-normalization.ts`), esto es lo que corrige:
 *
 * - Las dos hojas de `TEMPLATE_1F_0001` valen ambas `order = 0`, de modo que
 *   su orden efectivo lo decidía el motor de base de datos. Pasan a 0 y 1.
 * - De sus 3013 celdas, **975 no tienen nada dentro** y se descartan. Las 224
 *   que solo llevan formato se conservan: los bordes de una tabla vacía son
 *   el dibujo de la tabla. El documento baja de 364 KB a 141 KB.
 * - Los valores calculados dejan de persistirse: congelaban dentro de la
 *   plantilla números que sus fórmulas ya no producen.
 * - Los estilos se normalizan, escribiendo las filas ocultas en los dos
 *   nombres —el canónico y el que project-front todavía lee— y descartando el
 *   estado de sesión del diseñador, que nunca fue de la plantilla.
 * - Las tres plantillas sin hojas pasan a borrador. Hoy se ofrecen en la
 *   biblioteca y cargan en blanco.
 *
 * **Antes de tocar nada** guarda en `template_revision` el contenido literal
 * de cada plantilla afectada. `down()` restaura desde ahí, byte a byte.
 */
export class TemplateNormalization1788200000000 implements MigrationInterface {
  name = 'TemplateNormalization1788200000000';

  private static readonly REASON = 'saneamiento inicial del contrato';

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

      // La instantánea guarda las cadenas tal cual están, sin interpretarlas:
      // es lo que permite que la reversión devuelva exactamente lo que había,
      // y no una reserialización parecida.
      await queryRunner.query(
        `INSERT INTO "template_revision" ("template_id", "version", "document", "contract_version", "author", "reason")
         VALUES (@0, @1, @2, @3, @4, @5)`,
        [
          template.id,
          template.version,
          JSON.stringify({ literal: true, sheets: rows }),
          null,
          'migración',
          TemplateNormalization1788200000000.REASON,
        ],
      );

      if (rows.length === 0) {
        await queryRunner.query(
          `UPDATE "template" SET "status" = @0, "version" = 0 WHERE "id" = @1`,
          [TemplateStatus.DRAFT, template.id],
        );
        continue;
      }

      const persisted: PersistedSheet[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        order: row.order,
        cells: JSON.parse(row.cells) as PersistedSheet['cells'],
        cellsStyles: row.cellsStyles
          ? (JSON.parse(row.cellsStyles) as PersistedSheet['cellsStyles'])
          : null,
      }));

      const normalized = writeTemplate(
        readTemplate({
          id: template.id,
          name: template.name,
          code: template.code,
          description: template.description ?? undefined,
          type: template.type,
          sheets: persisted,
        }),
      );

      for (const sheet of normalized.sheets ?? []) {
        await queryRunner.query(
          `UPDATE "sheet" SET "cells" = @0, "cellsStyles" = @1, "order" = @2 WHERE "id" = @3`,
          [
            JSON.stringify(sheet.cells),
            JSON.stringify(sheet.cellsStyles ?? {}),
            sheet.order ?? 0,
            sheet.id,
          ],
        );
      }

      await queryRunner.query(
        `UPDATE "template" SET "contract_version" = @0 WHERE "id" = @1`,
        [CONTRACT_VERSION, template.id],
      );
    }

    // Ahora que las posiciones son distintas, la unicidad se puede imponer.
    // Es el orden inverso al natural —primero el dato, después la
    // restricción— porque crear el índice antes habría fallado.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sheet_template_order" ON "sheet" ("template_id", "order") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_sheet_template_order" ON "sheet"`);

    const snapshots: {
      id: number;
      template_id: number;
      version: number;
      document: string;
    }[] = await queryRunner.query(
      `SELECT "id", "template_id", "version", "document" FROM "template_revision" WHERE "reason" = @0 ORDER BY "id"`,
      [TemplateNormalization1788200000000.REASON],
    );

    for (const snapshot of snapshots) {
      const document = JSON.parse(snapshot.document) as {
        sheets: {
          id: number;
          name: string;
          order: number;
          cells: string;
          cellsStyles: string | null;
        }[];
      };

      for (const sheet of document.sheets) {
        await queryRunner.query(
          `UPDATE "sheet" SET "cells" = @0, "cellsStyles" = @1, "order" = @2 WHERE "id" = @3`,
          [sheet.cells, sheet.cellsStyles, sheet.order, sheet.id],
        );
      }

      await queryRunner.query(
        `UPDATE "template" SET "status" = @0, "version" = @1, "contract_version" = NULL WHERE "id" = @2`,
        [TemplateStatus.PUBLISHED, snapshot.version, snapshot.template_id],
      );
    }

    await queryRunner.query(
      `DELETE FROM "template_revision" WHERE "reason" = @0`,
      [TemplateNormalization1788200000000.REASON],
    );
  }
}
