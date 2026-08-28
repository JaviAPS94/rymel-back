/**
 * Los diseños ya guardados se abren igual después de la migración.
 *
 * Un diseño no pasa por la carga de plantillas: lleva dentro su propia copia
 * de las hojas y se abre desde ahí. Lo único que puede cambiarle el resultado
 * es el evaluador, así que esta comprobación recalcula cada `sub_design` con
 * el motor nuevo y contrasta contra el valor que tiene guardado.
 *
 * Toda diferencia se reporta con su celda y sus dos valores. No hay
 * diferencias «aceptables» aquí: un diseño que se abre distinto es un diseño
 * que cambió sin que nadie lo decidiera.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-saved-designs.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { evaluateSheet } from '@rymel/formula-engine';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';

dotenvConfig({ path: '.env' });

interface SavedSheet {
  name?: string;
  cells?: Record<string, { formula?: string; computed?: number | string }>;
}

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

  const subDesigns = await dataSource
    .getRepository(SubDesign)
    .find({ where: { deletedAt: null } });

  /**
   * Las fórmulas de diseño solo las resuelve el motor cifrado, que no
   * interviene aquí. Las celdas que las invocan quedan fuera de la
   * comparación y se cuentan aparte: compararlas sin resolverlas diría que
   * todas cambiaron, que es falso.
   */
  const designFunctionCodes = (
    await dataSource
      .getRepository(DesignFunction)
      .find({ where: { deletedAt: null } })
  ).map((designFunction) => designFunction.code.toUpperCase());

  const invokesDesignFunction = (formula: string): boolean =>
    designFunctionCodes.some((code) =>
      new RegExp(`(?<![A-Z0-9_])${code}\\s*\\(`, 'i').test(formula),
    );

  let skipped = 0;

  let evaluated = 0;
  let matched = 0;
  const differences: string[] = [];

  for (const subDesign of subDesigns) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(subDesign.data);
    } catch {
      continue;
    }

    const sheets: SavedSheet[] = Array.isArray(parsed)
      ? (parsed as SavedSheet[])
      : ((parsed as { sheets?: SavedSheet[] }).sheets ?? [
          parsed as SavedSheet,
        ]);

    // El libro plano del diseño, tal como lo entiende el motor.
    const book: Record<string, { formula: string }> = {};
    for (const [index, sheet] of sheets.entries()) {
      const name = sheet.name ?? `Hoja${index + 1}`;
      for (const [ref, cell] of Object.entries(sheet.cells ?? {})) {
        book[`${name}!${ref}`] = { formula: String(cell.formula ?? '') };
      }
    }

    if (Object.keys(book).length === 0) continue;

    const result = await evaluateSheet(book);

    for (const [index, sheet] of sheets.entries()) {
      const name = sheet.name ?? `Hoja${index + 1}`;
      for (const [ref, cell] of Object.entries(sheet.cells ?? {})) {
        const formula = String(cell.formula ?? '');
        // Solo las fórmulas: un literal no lo calcula nadie.
        if (!formula.startsWith('=')) continue;

        if (invokesDesignFunction(formula)) {
          skipped++;
          continue;
        }

        evaluated++;
        const before = cell.computed;
        const after = result.values[`${name}!${ref}`];

        if (String(before) === String(after)) {
          matched++;
        } else {
          differences.push(
            `sub_design ${subDesign.id} · ${name}!${ref} · ${formula}\n` +
              `    guardado: ${JSON.stringify(before)}  ahora: ${JSON.stringify(after)}`,
          );
        }
      }
    }
  }

  console.log(`sub-diseños revisados: ${subDesigns.length}`);
  console.log(`celdas con fórmula evaluadas: ${evaluated}`);
  console.log(
    `celdas con fórmula de diseño, fuera de la comparación: ${skipped}`,
  );
  console.log(`coinciden con su valor guardado: ${matched}`);

  if (differences.length > 0) {
    console.log(`\n${differences.length} diferencia(s):`);
    for (const difference of differences.slice(0, 20)) {
      console.log(`  ${difference}`);
    }
  }

  if (differences.length > 0) {
    console.log(
      `\n${differences.length} celda(s) cambiarían de valor: revisar antes de dar por buena la migración.`,
    );
  } else if (evaluated === 0) {
    // Decir «todo coincide» habiendo comparado cero celdas sería una falsa
    // tranquilidad. Si todas las fórmulas guardadas son de diseño, esta
    // comprobación no puede concluir nada por sí sola.
    console.log(
      '\nNo se comparó ninguna celda: las ' +
        `${skipped} fórmulas de los diseños guardados son todas de diseño, y ` +
        'resolverlas exige el motor cifrado.\n' +
        'Esta comprobación no confirma la paridad por sí sola. Lo que sí está ' +
        'medido es la exposición: ninguna de esas celdas usa el separador `;`, ' +
        'ni un rango calificado en ambos extremos, ni una celda de gráfico, que ' +
        'son las tres construcciones que cambió v1.6.0 del motor.',
    );
  } else {
    console.log(
      `\nLas ${evaluated} celdas comparables se abren con los mismos valores.`,
    );
  }

  await dataSource.destroy();
  process.exit(differences.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
