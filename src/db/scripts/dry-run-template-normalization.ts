/**
 * Simulación de la normalización de plantillas.
 *
 * No escribe nada. Recorre las plantillas guardadas, las pasa por el contrato
 * compartido y dice exactamente qué cambiaría: cuántas celdas se descartarían
 * por hoja, qué posiciones de hoja se reasignarían, qué plantillas pasarían a
 * borrador y si alguna quedaría con diagnósticos de validación.
 *
 * Es la puerta de corte de la migración de datos. El cambio declara una línea
 * base medida —671 celdas sin contenido en `Resumen` y 304 en `Tablas`— y si
 * la simulación no coincide con ella, es que la base ya no es la que se
 * inventarió y la migración no debe correr a ciegas.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/dry-run-template-normalization.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  readTemplate,
  validateTemplate,
  writeTemplate,
  type PersistedSheet,
} from '@rymel/design-template';
import { Template } from '../../modules/design/entities/template.entity';

dotenvConfig({ path: '.env' });

/** Lo que el inventario del change midió, y contra lo que se contrasta. */
const LINEA_BASE: Record<string, Record<string, number>> = {
  TEMPLATE_1F_0001: { Resumen: 671, Tablas: 304 },
};

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
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
    entities: ['src/**/*.entity.ts'],
  });
  await dataSource.initialize();

  const templates = await dataSource.getRepository(Template).find({
    where: { deletedAt: null },
    relations: ['sheets', 'designSubType'],
  });

  let desviaciones = 0;

  for (const template of templates) {
    const sheets = (template.sheets ?? [])
      .filter((sheet) => !sheet.deletedAt)
      .sort((a, b) => a.order - b.order || a.id - b.id);

    const persisted: PersistedSheet[] = sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      order: sheet.order,
      cells: parse(sheet.cells, {}),
      cellsStyles: parse(sheet.cellsStyles, null),
    }));

    const documento = readTemplate({
      id: template.id,
      name: template.name,
      code: template.code,
      description: template.description,
      type: template.type,
      sheets: persisted,
    });

    console.log(
      `\n=== ${template.code} (${template.name}) — ${sheets.length} hoja(s)`,
    );

    if (sheets.length === 0) {
      console.log('  sin hojas -> pasaría a DRAFT y dejaría de ofrecerse');
      continue;
    }

    const ordenes = sheets.map((sheet) => sheet.order);
    if (new Set(ordenes).size !== ordenes.length) {
      console.log(
        `  posiciones ambiguas ${JSON.stringify(ordenes)} -> quedarían ${JSON.stringify(
          documento.sheets.map((sheet) => sheet.position),
        )}`,
      );
    }

    const esperado = LINEA_BASE[template.code];

    for (const [index, sheet] of documento.sheets.entries()) {
      const antes = Object.keys(persisted[index].cells).length;
      const despues = Object.keys(sheet.cells).length;
      const descartadas = antes - despues;

      // Una plantilla ya normalizada no descarta nada, y eso no es una
      // desviación: es la señal de que la migración ya corrió. Sin esta
      // distinción, volver a ejecutar la simulación después de migrar daría
      // una alarma falsa cada vez.
      const yaNormalizada =
        template.contractVersion != null && descartadas === 0;
      const referencia = esperado?.[sheet.name];
      const coincide = referencia === undefined || referencia === descartadas;
      if (!coincide && !yaNormalizada) desviaciones++;

      console.log(
        `  ${sheet.name}: ${antes} celdas -> ${despues} (descarta ${descartadas})` +
          (yaNormalizada
            ? `  [ya normalizada con el contrato ${template.contractVersion}]`
            : referencia === undefined
              ? ''
              : coincide
                ? `  [coincide con la línea base]`
                : `  [DESVIACIÓN: la línea base dice ${referencia}]`),
      );
    }

    // Un dato que conviene ver antes de escribir: cuánto encoge el documento.
    const bytesAntes = sheets.reduce(
      (total, sheet) =>
        total + sheet.cells.length + (sheet.cellsStyles?.length ?? 0),
      0,
    );
    const escrito = writeTemplate(documento);
    const bytesDespues = (escrito.sheets ?? []).reduce(
      (total, sheet) =>
        total +
        JSON.stringify(sheet.cells).length +
        JSON.stringify(sheet.cellsStyles ?? {}).length,
      0,
    );
    console.log(
      `  tamaño: ${(bytesAntes / 1024).toFixed(1)} KB -> ${(bytesDespues / 1024).toFixed(1)} KB`,
    );

    const diagnosticos = validateTemplate(documento);
    if (diagnosticos.length === 0) {
      console.log('  validación: sin diagnósticos');
    } else {
      console.log(`  validación: ${diagnosticos.length} diagnóstico(s)`);
      for (const diagnostico of diagnosticos.slice(0, 10)) {
        console.log(
          `    [${diagnostico.code}] ${diagnostico.sheet ?? ''}${
            diagnostico.cell ? `!${diagnostico.cell}` : ''
          } ${diagnostico.message}`,
        );
      }
    }
  }

  console.log(
    desviaciones === 0
      ? '\nSin desviaciones respecto de la línea base. La migración puede aplicarse.'
      : `\n${desviaciones} desviación(es) respecto de la línea base: NO aplicar la migración sin revisarlo.`,
  );

  await dataSource.destroy();
  process.exit(desviaciones === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
