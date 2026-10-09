/**
 * El libro de fantasmas del negocio contra la base local
 * (organize-phantoms-by-process, grupo 6).
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-phantom-workbook.ts <paso> [libro.xlsx]
 *
 * Pasos:
 *   preview    previsualiza el libro completo sin escribir (6.1)
 *   import     lo importa en modo crear (6.1)
 *   upsert     lo vuelve a importar en modo actualizar
 *   list       el listado paginado del admin, con sus filtros, contra la base
 *   delete     borrado masivo: todo o nada, con dos fantasmas de prueba que
 *              quedan de baja al terminar
 *   single     importa un libro con un solo fantasma nuevo y comprueba que el
 *              resto no cambia (6.2); al terminar lo da de baja
 *   roundtrip  exporta todo, lo reimporta en modo actualizar y comprueba que
 *              nada cambia (6.3)
 *
 * Cada paso mide su duración (6.4).
 */

import { config as dotenvConfig } from 'dotenv';
import { createHash } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { PhantomItem } from '../../modules/phantom-item/entities/phantom-item.entity';
import { PhantomItemComponent } from '../../modules/phantom-item/entities/phantom-item-component.entity';
import { PhantomProcess } from '../../modules/phantom-item/entities/phantom-process.entity';
import { PhantomFamily } from '../../modules/phantom-item/entities/phantom-family.entity';
import { PhantomProcessColumn } from '../../modules/phantom-item/entities/phantom-process-column.entity';
import { PhantomProcessService } from '../../modules/phantom-item/services/phantom-process.service';
import { PhantomItemService } from '../../modules/phantom-item/services/phantom-item.service';
import { PhantomItemImportService } from '../../modules/phantom-item/services/phantom-item-import.service';
import { PhantomItemExportService } from '../../modules/phantom-item/services/phantom-item-export.service';
import {
  ImportResultDto,
  PhantomItemImportMode,
} from '../../modules/phantom-item/dtos/import-phantom-items.dto';

dotenvConfig({ path: '.env' });

const DEFAULT_WORKBOOK =
  '/Users/alex.pinaida/Downloads/ITEMS FANTASMA ALEX.xlsx';

let failures = 0;
const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(
    `${condition ? '  ok  ' : ' FALLA'} ${name}${detail ? ` — ${detail}` : ''}`,
  );
  if (!condition) failures++;
};

/**
 * Umbral de una importación completa del libro. Medido contra la base local:
 * 13 s creando los 533 fantasmas, 10 s actualizándolos. Cuatro veces eso deja
 * margen para un servidor más lento sin dejar pasar una regresión de orden.
 */
const MAX_IMPORT_SECONDS = 60;
let lastSeconds = 0;

const timed = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  const result = await run();
  lastSeconds = (Date.now() - start) / 1000;
  console.log(`  ⏱  ${label}: ${lastSeconds.toFixed(1)} s`);
  return result;
};

const checkDuration = (): void =>
  check(
    `dura menos de ${MAX_IMPORT_SECONDS} s`,
    lastSeconds < MAX_IMPORT_SECONDS,
    `${lastSeconds.toFixed(1)} s`,
  );

/** Lo que el libro dice, por hoja, y los avisos agrupados por su forma */
const report = (result: ImportResultDto): void => {
  console.log(
    `\n  creados ${result.created}, actualizados ${result.updated}, omitidos ${result.skipped}, ` +
      `filas ${result.rowsRead}, fantasmas ${result.phantomItemsDetected}, errores ${result.errors.length}, avisos ${result.warnings.length}`,
  );
  for (const sheet of result.sheets) {
    console.log(
      `   · ${sheet.sheet}${sheet.hidden ? ' (oculta)' : ''}${sheet.newProcess ? ' [nuevo]' : ''}: ` +
        `${sheet.phantomItemsDetected} fantasmas, ${sheet.created} nuevos, ${sheet.updated} actualizados, ` +
        `${sheet.skipped} omitidos, ${sheet.moved} movidos; ignoradas: ${sheet.ignoredColumns.join(', ') || '—'}`,
    );
  }
  const kinds = new Map<string, number>();
  for (const issue of [...result.errors, ...result.warnings]) {
    const kind = `${issue.sheet ?? ''} · ${issue.column ?? ''} · ${issue.message.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N')}`;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(count).padStart(4)} × ${kind}`);
  }
  // Los errores que no son de longitud, uno por uno: son datos que corregir
  for (const issue of result.errors.filter(
    (item) => !/exceeds the limit/.test(item.message),
  )) {
    console.log(
      `     ✗ ${issue.sheet} fila ${issue.row} · ${issue.column ?? ''} · ${issue.message}`,
    );
  }
};

/** Huella de todo el catálogo: cabeceras, familias, valores propios y líneas */
const fingerprint = async (
  dataSource: DataSource,
  exceptItemCode?: string,
  { withOwnFormulas = true } = {},
): Promise<string> => {
  const raw: Record<string, unknown>[] = await dataSource.query(
    `SELECT i.item_code, i.process_id, f.name family, i.finished_product_type, i.work_in_process_type,
            i.phantom_root_code, i.kva_rating_standard, i.reference, i.item_description,
            i.short_description, i.unit_of_measure, i.reference_length_limit, i.formula_overrides,
            i.extra_values,
            c.sort_order, c.component_item_code, c.description, c.base_quantity, c.required_quantity,
            c.required_quantity_per_unit, c.component_unit_of_measure, c.waste_percentage,
            c.consumption_warehouse, c.formula_overrides c_overrides, c.extra_values c_extra
       FROM phantom_item i
       LEFT JOIN phantom_family f ON f.id = i.family_id
       LEFT JOIN phantom_item_component c ON c.phantom_item_id = i.id AND c.deleted_at IS NULL
      WHERE i.deleted_at IS NULL AND (@0 IS NULL OR i.item_code <> @0)
      ORDER BY i.item_code, c.sort_order`,
    [exceptItemCode ?? null],
  );
  const rows = withOwnFormulas
    ? raw
    : raw.map((row) => {
        const rest = { ...row };
        delete rest.formula_overrides;
        delete rest.c_overrides;
        return rest;
      });
  // PHANTOM_DUMP=/ruta/prefijo guarda cada huella para comparar qué cambió
  if (process.env.PHANTOM_DUMP) {
    await writeFile(
      `${process.env.PHANTOM_DUMP}-${Date.now()}.json`,
      JSON.stringify(rows, null, 1),
    );
  }
  return createHash('sha256')
    .update(JSON.stringify(rows))
    .digest('hex')
    .slice(0, 16);
};

const counts = async (dataSource: DataSource) => {
  const [row] = await dataSource.query(
    `SELECT (SELECT COUNT(*) FROM phantom_item WHERE deleted_at IS NULL) items,
            (SELECT COUNT(*) FROM phantom_item_component c JOIN phantom_item i ON i.id = c.phantom_item_id
              WHERE c.deleted_at IS NULL AND i.deleted_at IS NULL) lines,
            (SELECT COUNT(*) FROM phantom_process WHERE deleted_at IS NULL) processes,
            (SELECT COUNT(*) FROM phantom_family WHERE deleted_at IS NULL) families`,
  );
  return row as {
    items: number;
    lines: number;
    processes: number;
    families: number;
  };
};

async function main(): Promise<void> {
  const [step = 'preview', workbook = DEFAULT_WORKBOOK] = process.argv.slice(2);

  const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: { encrypt: false, trustServerCertificate: true },
    entities: ['src/**/*.entity.ts'],
  });
  await dataSource.initialize();

  const items = dataSource.getRepository(PhantomItem);
  const components = dataSource.getRepository(PhantomItemComponent);
  const processes = new PhantomProcessService(
    dataSource.getRepository(PhantomProcess),
    dataSource.getRepository(PhantomFamily),
    dataSource.getRepository(PhantomProcessColumn),
    dataSource,
  );
  const phantomItems = new PhantomItemService(
    items,
    components,
    dataSource,
    processes,
  );
  const importer = new PhantomItemImportService(
    items,
    phantomItems,
    dataSource,
    processes,
  );
  const exporter = new PhantomItemExportService(items, components, processes);

  console.log(
    `Paso «${step}» · antes: ${JSON.stringify(await counts(dataSource))}`,
  );

  if (step === 'preview' || step === 'import') {
    const dryRun = step === 'preview';
    const result = await timed(
      dryRun ? 'previsualización' : 'importación',
      () => importer.import(workbook, PhantomItemImportMode.CREATE, dryRun),
    );
    report(result);
    checkDuration();
    check(
      '533 fantasmas detectados',
      result.phantomItemsDetected === 533,
      String(result.phantomItemsDetected),
    );
    // 5.120 líneas con Item o componente en las hojas visibles, más una fila de
    // ARMADO Y CONEXIÓN con datos y sin ninguno de los dos. Las 115 de SEF-SEH,
    // oculta, no cuentan.
    check(
      '5.121 filas leídas',
      result.rowsRead === 5121,
      String(result.rowsRead),
    );
    check(
      '5 hojas visibles con su proceso y la oculta omitida',
      result.sheets.filter((sheet) => !sheet.hidden).length === 5 &&
        result.sheets.some(
          (sheet) => sheet.sheet === 'SEF-SEH' && sheet.hidden,
        ),
    );
    // Solo los dos errores de datos del libro: CANT. BASE vacía en
    // ALISTAMIENTO fila 714 y una fila sin componente en ARMADO fila 81
    check(
      'solo los 2 errores de datos conocidos',
      result.errors.length === 2 &&
        result.errors.some(
          (e) => e.sheet === 'ALISTAMIENTO Y ENCUBE' && e.row === 714,
        ) &&
        result.errors.some(
          (e) => e.sheet === 'ARMADO Y CONEXIÓN' && e.row === 81,
        ),
      String(result.errors.length),
    );
    check(
      'ningún fantasma omitido',
      result.skipped === 0,
      String(result.skipped),
    );
    if (!dryRun) {
      const after = await counts(dataSource);
      console.log(`  después: ${JSON.stringify(after)}`);
      const metal = (await processes.findByName('metalmecanica'))!;
      check(
        'METALMECANICA con 208 fantasmas',
        metal?.phantomItemsCount === 208,
        String(metal?.phantomItemsCount),
      );
    }
  }

  if (step === 'list') {
    const metal = (await processes.findByName('metalmecanica'))!;
    const family = metal.families[0];
    const page = (filters: Record<string, unknown>) =>
      phantomItems.findAllPaginated({
        page: 1,
        limit: 10,
        ...filters,
      } as never);

    const first = await page({ processId: metal.id });
    const second = await page({ processId: metal.id, page: 2 });
    check(
      'METALMECANICA: 208 en total, 10 por página',
      first.total === 208 && first.data.length === 10,
    );
    check(
      'la página 2 sigue a la 1, por Item',
      second.data[0].itemCode > first.data[9].itemCode,
      `${first.data[9].itemCode} → ${second.data[0].itemCode}`,
    );
    check(
      'trae la familia y el número de componentes',
      first.data.every((item) => item.familyName && item.componentsCount > 0),
    );
    const byFamily = await page({ processId: metal.id, familyId: family.id });
    check(
      `filtra por familia «${family.name}»`,
      byFamily.total === family.phantomItemsCount &&
        byFamily.data.every((item) => item.familyId === family.id),
      `${byFamily.total} de ${family.phantomItemsCount}`,
    );
    const search = await page({ search: '500558' });
    check(
      'busca por Item',
      search.total === 1 && search.data[0].itemCode === '500558',
    );

    // El detalle que abre el editor, con su familia y sus valores propios
    const detail = await phantomItems.findOne(search.data[0].id);
    check(
      'el detalle trae proceso, familia y líneas',
      detail.processId === metal.id &&
        detail.familyName !== null &&
        detail.components.length > 0,
      `${detail.familyName}, ${detail.components.length} líneas`,
    );
  }

  if (step === 'delete') {
    const before = await fingerprint(dataSource);
    const beforeCounts = await counts(dataSource);
    const make = (itemCode: string) =>
      phantomItems.create({
        finishedProductType: '1CV',
        workInProcessType: 'TSO',
        phantomRootCode: 'KIT BORRAR',
        itemCode,
        components: [
          { componentItemCode: '4789', baseQuantity: 1, requiredQuantity: 1 },
        ],
      } as never);
    const [a, b] = [await make('599991'), await make('599992')];

    let refused = false;
    try {
      await phantomItems.removeMany([a.id, b.id, 999999]);
    } catch {
      refused = true;
    }
    check(
      'con un id inexistente no borra ninguno',
      refused && (await counts(dataSource)).items === beforeCounts.items + 2,
    );

    const result = await phantomItems.removeMany([a.id, b.id]);
    const [{ lines }] = await dataSource.query(
      `SELECT COUNT(*) lines FROM phantom_item_component
        WHERE phantom_item_id IN (@0, @1) AND deleted_at IS NULL`,
      [a.id, b.id],
    );
    check('borra los dos', result.deleted === 2);
    check('y sus líneas', lines === 0, String(lines));
    check(
      'el catálogo vuelve a ser el de antes',
      (await fingerprint(dataSource)) === before,
    );
  }

  if (step === 'upsert') {
    const result = await timed('importación en modo actualizar', () =>
      importer.import(workbook, PhantomItemImportMode.UPSERT, false),
    );
    report(result);
    checkDuration();
    check(
      'nada se crea ni se omite',
      result.created === 0 && result.skipped === 0,
    );
  }

  if (step === 'single') {
    const before = await fingerprint(dataSource);
    const beforeCounts = await counts(dataSource);
    const metal = (await processes.findByName('metalmecanica'))!;
    const dir = await mkdtemp(join(tmpdir(), 'phantom-single-'));
    const path = join(dir, 'uno.xlsx');
    // La hoja tal como la exporta el sistema, con un fantasma que no existe
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('METALMECANICA');
    sheet.addRow([]);
    sheet.addRow(['Fantasma', ...metal.columns.map((column) => column.header)]);
    const values: Record<string, unknown> = {
      finishedProductType: '1CV',
      workInProcessType: 'TSO',
      phantomRootCode: 'KIT PRUEBA',
      kvaRatingStandard: ' 999 MM',
      itemCode: '599999',
      unitOfMeasure: 'UND',
      componentItemCode: '4789',
      baseQuantity: 1,
      requiredQuantity: 2,
    };
    sheet.addRow([
      'F. Prueba',
      ...metal.columns.map((column) => values[column.key] ?? null),
    ]);
    await book.xlsx.writeFile(path);

    const result = await timed('libro de un fantasma', () =>
      importer.import(path, PhantomItemImportMode.UPSERT, false),
    );
    await rm(dir, { recursive: true, force: true });
    report(result);
    check(
      'crea uno y no toca más',
      result.created === 1 && result.updated === 0,
      `${result.created}/${result.updated}`,
    );
    const after = await counts(dataSource);
    check(
      'un fantasma y una línea más',
      after.items === beforeCounts.items + 1 &&
        after.lines === beforeCounts.lines + 1,
    );
    check(
      'el resto del catálogo no cambia',
      (await fingerprint(dataSource, '599999')) === before,
    );
    const created = await items.findOne({
      where: { itemCode: '599999' },
      relations: { family: true },
    });
    check(
      'queda en METALMECANICA, familia «F. Prueba»',
      created?.processId === metal.id && created?.family?.name === 'F. Prueba',
    );

    // Sin rastro de la prueba: el fantasma y su familia, de baja
    if (created) {
      await phantomItems.remove(created.id);
      await dataSource
        .getRepository(PhantomFamily)
        .update(created.familyId!, { deletedAt: new Date() });
    }
    check(
      'tras darlo de baja, el catálogo vuelve a ser el de antes',
      (await fingerprint(dataSource)) === before,
    );
  }

  if (step === 'roundtrip') {
    const before = await fingerprint(dataSource, undefined, {
      withOwnFormulas: false,
    });
    const ownFormulasBefore: { item_code: string; line: string | null }[] =
      await dataSource.query(
        `SELECT i.item_code, c.component_item_code line
           FROM phantom_item i
           LEFT JOIN phantom_item_component c ON c.phantom_item_id = i.id AND c.deleted_at IS NULL
          WHERE i.deleted_at IS NULL
            AND (i.formula_overrides IS NOT NULL OR c.formula_overrides IS NOT NULL)`,
      );
    const buffer = await timed('exportación', () => exporter.export({}));
    const dir = await mkdtemp(join(tmpdir(), 'phantom-roundtrip-'));
    const path = join(dir, 'export.xlsx');
    await writeFile(path, Buffer.from(buffer as ArrayBuffer));
    const result = await timed('reimportación', () =>
      importer.import(path, PhantomItemImportMode.UPSERT, false),
    );
    await rm(dir, { recursive: true, force: true });
    report(result);
    checkDuration();
    const all = (await counts(dataSource)).items;
    check(
      'todo se reconoce y se actualiza',
      result.updated === all && result.created === 0,
      `${result.updated} de ${all}`,
    );
    check(
      'ningún fantasma cambia de proceso',
      result.sheets.every((sheet) => sheet.moved === 0),
    );
    check(
      'el catálogo queda idéntico, salvo las fórmulas propias',
      (await fingerprint(dataSource, undefined, { withOwnFormulas: false })) ===
        before,
    );
    // El libro lleva valores: una fórmula propia cuyo valor coincide con la
    // regla vuelve a la regla al reimportar (design.md, decisión 5)
    console.log(
      `  ℹ  fantasmas/líneas con fórmula propia antes: ${ownFormulasBefore.length} — ` +
        ownFormulasBefore
          .slice(0, 10)
          .map((row) => `${row.item_code}${row.line ? `/${row.line}` : ''}`)
          .join(', '),
    );
  }

  await dataSource.destroy();
  console.log(
    failures === 0
      ? '\nTodo bien.'
      : `\n${failures} comprobación(es) fallida(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
