import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sheet.cells` y `sheet.cellsStyles` pasan de `text` a `nvarchar(max)`.
 *
 * `text` está obsoleto en SQL Server desde hace versiones y no admite las
 * funciones de cadena: cualquier consulta con `LEN()` sobre estas columnas
 * falla con «Argument data type text is invalid», lo que se descubrió
 * intentando medir cuánto ocupaban. `nvarchar(max)` es lo que ya usan las
 * demás columnas largas de este esquema, incluida `template.name`.
 *
 * Es una conversión que ensancha el tipo: no hay pérdida. La hoja más grande
 * que hay guardada son 236 KB, muy por debajo del límite de 2 GB.
 */
export class SheetNvarchar1788100000000 implements MigrationInterface {
  name = 'SheetNvarchar1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sheet" ALTER COLUMN "cells" nvarchar(max) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sheet" ALTER COLUMN "cellsStyles" nvarchar(max)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sheet" ALTER COLUMN "cells" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sheet" ALTER COLUMN "cellsStyles" text`,
    );
  }
}
