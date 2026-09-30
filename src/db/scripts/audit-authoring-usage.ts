/**
 * Dónde se configura hoy lo que el menú contextual del diseñador permite
 * declarar: en la plantilla o en cada diseño.
 *
 * Solo lectura. Cuenta, por origen —hoja publicada, borrador, diseño
 * guardado—, cuántas celdas y regiones llevan cada configuración. Es la
 * evidencia para decidir si retirar esas acciones del diseñador deja algo
 * huérfano.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/audit-authoring-usage.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';

dotenvConfig({ path: '.env' });

type Counts = Record<string, number>;

const CELL_KEYS = [
  'note',
  'goTo',
  'itemLink',
  'catalogConditionCells',
  'materialTag',
  'bomToggleNodeId',
  'options',
  'elementKey',
];
const REGION_KEYS = [
  'namedRanges',
  'semiFinishedZones',
  'itemCatalogTables',
  'mergedCells',
];

const bump = (counts: Counts, key: string, by = 1): void => {
  counts[key] = (counts[key] ?? 0) + by;
};

const countCells = (cells: unknown, counts: Counts): void => {
  if (!cells || typeof cells !== 'object') return;
  for (const cell of Object.values(cells as Record<string, any>)) {
    if (!cell || typeof cell !== 'object') continue;
    for (const key of CELL_KEYS) {
      const value = cell[key];
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      bump(counts, `cell.${key}`);
      if (key === 'itemLink' && value.itemId) bump(counts, 'cell.itemLink.withItem');
    }
  }
};

const countRegions = (styles: any, counts: Counts): void => {
  if (!styles || typeof styles !== 'object') return;
  for (const key of REGION_KEYS) {
    if (Array.isArray(styles[key])) bump(counts, `region.${key}`, styles[key].length);
  }
  if (styles.freezeRow > 0 || styles.freezeColumn > 0) bump(counts, 'sheet.frozen');
};

const parse = (text: string | null | undefined): any => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: { encrypt: false, trustServerCertificate: true },
  });
  await dataSource.initialize();

  const report: Record<string, Counts> = {};

  // Plantillas publicadas: una fila de `sheet` por hoja.
  const sheets: { templateId: number; name: string; cells: string; cellsStyles: string }[] =
    await dataSource.query(
      `SELECT s.template_id AS templateId, s.name, s.cells, s.cellsStyles
         FROM sheet s JOIN template t ON t.id = s.template_id
        WHERE t.deleted_at IS NULL`,
    );
  for (const sheet of sheets) {
    const counts = (report[`publicada:${sheet.templateId}`] ??= {});
    bump(counts, 'sheets');
    countCells(parse(sheet.cells), counts);
    countRegions(parse(sheet.cellsStyles), counts);
  }

  // Borradores: el documento completo.
  const drafts: { templateId: number; document: string }[] = await dataSource.query(
    `SELECT template_id AS templateId, document FROM template_draft`,
  );
  for (const draft of drafts) {
    const counts = (report[`borrador:${draft.templateId}`] ??= {});
    for (const sheet of parse(draft.document)?.sheets ?? []) {
      bump(counts, 'sheets');
      countCells(sheet.cells, counts);
      countRegions(sheet.styles, counts);
    }
  }

  // Diseños guardados: cada `sub_design.data` lleva su copia de las hojas.
  const subDesigns: { id: number; data: string }[] = await dataSource.query(
    `SELECT id, data FROM sub_design WHERE deleted_at IS NULL`,
  );
  const designs: Counts = (report['diseños'] = {});
  const designsUsing: Counts = (report['diseños que lo usan'] = {});
  for (const subDesign of subDesigns) {
    const data = parse(subDesign.data);
    // Un `sub_design` guarda una sola hoja, no una lista.
    const list = Array.isArray(data) ? data : data?.cells ? [data] : data?.sheets ?? [];
    bump(designs, 'subDesigns');
    const own: Counts = {};
    for (const sheet of list) {
      countCells(sheet.cells, own);
      countRegions(sheet.cellsStyles ?? sheet, own);
    }
    if (Object.entries(own).some(([key, value]) => value > 0 && !key.startsWith("region.merged")))
      console.error(`sub_design ${subDesign.id}:`, JSON.stringify(own));
    for (const [key, value] of Object.entries(own)) {
      bump(designs, key, value);
      if (value > 0) bump(designsUsing, key);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
