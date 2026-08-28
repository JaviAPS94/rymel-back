/**
 * Corrección puntual: el sub-diseño 74 referencia la etiqueta en vez del valor.
 *
 * Sus cuatro celdas de resultado contienen `=CUBIC(A11, A5)`, y `A5` es la
 * **etiqueta** `"a ="`, no un número. El valor está en `B5`.
 *
 * La hoja parecía funcionar porque el evaluador de project-front convierte el
 * texto en 0 sin avisar: los valores guardados (5, 8, 17, 2) son exactamente
 * los de evaluar con `b = 0`. Es decir, cuatro números que parecen datos y no
 * lo son.
 *
 * El motor compartido no hace esa conversión y da error, que es lo correcto
 * pero deja la hoja rota. Se corrige la referencia a `B5`, que es lo que la
 * fórmula quería decir, y se recalcula.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/fix-sub-design-74-reference.ts [--aplicar]
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { SubDesignRecalculation } from '../../modules/design/entities/sub-design-recalculation.entity';
import { DesignRecalculationService } from '../../modules/design/services/design-recalculation.service';
import { SecureFunctionEngineClient } from '../../modules/design/services/secure-function-engine.client';
import {
  parseSubDesignData,
  serializeSubDesignData,
} from '../../modules/design/services/sub-design-cells';

dotenvConfig({ path: '.env' });

const SUB_DESIGN_ID = 74;
const WRONG_REF = 'A5';
const RIGHT_REF = 'B5';
const APPLY = process.argv.includes('--aplicar');

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

  const subDesigns = dataSource.getRepository(SubDesign);
  const subDesign = await subDesigns.findOne({ where: { id: SUB_DESIGN_ID } });
  if (!subDesign) throw new Error(`No existe el sub-diseño ${SUB_DESIGN_ID}`);

  const parsed = parseSubDesignData(subDesign.data);
  if (!parsed) throw new Error('El sub-diseño no tiene celdas');

  // Comprobación previa: la corrección solo tiene sentido si A5 es texto y B5
  // un número. Si no, algo no es como se creía y no se toca nada.
  const wrongCell = parsed.cells[WRONG_REF];
  const rightCell = parsed.cells[RIGHT_REF];

  console.log(`${WRONG_REF} = ${JSON.stringify(wrongCell?.computed)}`);
  console.log(`${RIGHT_REF} = ${JSON.stringify(rightCell?.computed)}`);

  if (typeof wrongCell?.computed === 'number') {
    throw new Error(`${WRONG_REF} contiene un número; la premisa no se cumple`);
  }
  if (typeof rightCell?.computed !== 'number') {
    throw new Error(
      `${RIGHT_REF} no contiene un número; la premisa no se cumple`,
    );
  }

  const pattern = new RegExp(
    `(?<![A-Za-z0-9_$])${WRONG_REF}(?![A-Za-z0-9_])`,
    'g',
  );
  const changed: string[] = [];

  for (const [ref, cell] of Object.entries(parsed.cells)) {
    const formula = cell?.formula;
    if (typeof formula !== 'string' || !formula.startsWith('=')) continue;
    if (!pattern.test(formula)) continue;

    const corrected = formula.replace(pattern, RIGHT_REF);
    console.log(`  ${ref}: ${formula}  ->  ${corrected}`);
    changed.push(ref);

    if (APPLY) {
      cell.formula = corrected;
      // El diseñador guarda el mismo texto en `value`; se mantiene coherente.
      if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
        cell.value = corrected;
      }
    }
  }

  if (changed.length === 0) {
    console.log('\nNo hay nada que corregir.');
    await dataSource.destroy();
    return;
  }

  if (!APPLY) {
    console.log(
      `\n${changed.length} celda(s) por corregir. Usa --aplicar para escribir.`,
    );
    await dataSource.destroy();
    return;
  }

  await subDesigns.update(
    { id: SUB_DESIGN_ID },
    { data: serializeSubDesignData(parsed), isStale: true },
  );
  console.log(`\n${changed.length} fórmula(s) corregidas.`);

  const recalculation = new DesignRecalculationService(
    subDesigns,
    dataSource.getRepository(DesignFunction),
    dataSource.getRepository(DesignFunctionVersion),
    dataSource.getRepository(DesignSubTypeFunction),
    dataSource.getRepository(SubDesignRecalculation),
    new SecureFunctionEngineClient(new HttpService(axios.create())),
    dataSource,
  );

  const report = await recalculation.recalculate(
    [SUB_DESIGN_ID],
    'corrección de la referencia A5 -> B5',
  );
  const outcome = report.outcomes[0];

  console.log(
    `\nrecálculo: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ''}`,
  );
  for (const change of outcome.changedCells) {
    console.log(
      `  ${change.ref}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`,
    );
  }

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
