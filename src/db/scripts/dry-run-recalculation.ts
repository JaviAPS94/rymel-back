/**
 * Simulación del recálculo sobre todos los sub-diseños desactualizados.
 *
 * No escribe nada. Sirve para ver, antes de tocar datos de producción, qué
 * cambiaría y qué no se podría recalcular.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/dry-run-recalculation.ts
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

dotenvConfig({ path: '.env' });

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
  const service = new DesignRecalculationService(
    subDesigns,
    dataSource.getRepository(DesignFunction),
    dataSource.getRepository(DesignFunctionVersion),
    dataSource.getRepository(DesignSubTypeFunction),
    dataSource.getRepository(SubDesignRecalculation),
    new SecureFunctionEngineClient(new HttpService(axios.create())),
    dataSource,
  );

  const stale = await service.listStale();
  console.log(`${stale.length} sub-diseños desactualizados\n`);

  const report = await service.recalculate(
    stale.map((item) => item.id),
    'simulación',
    true,
  );

  const motivos = new Map<string, number[]>();
  for (const outcome of report.outcomes) {
    if (outcome.status === 'recalculado') {
      console.log(
        `  #${outcome.subDesignId}: cambiarían ${outcome.changedCells.length} celda(s)`,
      );
      for (const change of outcome.changedCells.slice(0, 4)) {
        console.log(
          `        ${change.ref} ${change.formula}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`,
        );
      }
    } else if (outcome.status === 'fallido') {
      const key = outcome.reason ?? 'sin motivo';
      motivos.set(key, [...(motivos.get(key) ?? []), outcome.subDesignId]);
    }
  }

  console.log(
    `\nresumen: ${report.recalculated} cambiarían | ${report.unchanged} sin cambios | ` +
      `${report.skipped} sin fórmulas | ${report.failed} no se pueden recalcular`,
  );

  if (motivos.size > 0) {
    console.log('\nmotivos de los que no se pueden recalcular:');
    for (const [motivo, ids] of motivos) {
      console.log(`  ${ids.length} sub-diseño(s) [${ids.join(', ')}]`);
      console.log(`     ${motivo}`);
    }
  }

  const afterStale = await subDesigns.count({ where: { isStale: true } });
  console.log(
    `\n(simulación: siguen desactualizados ${afterStale}, sin cambios en la base)`,
  );
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
