/**
 * Recálculo supervisado de los sub-diseños desactualizados.
 *
 * Escribe. Ejecuta antes `dry-run-recalculation.ts` y haz copia de seguridad:
 * esto reescribe números que alguien ya vio.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/apply-recalculation.ts --aplicar
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
  if (!process.argv.includes('--aplicar')) {
    console.log('Falta --aplicar. Usa dry-run-recalculation.ts para simular.');
    return;
  }

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
  console.log(`recalculando ${stale.length} sub-diseños desactualizados\n`);

  const report = await service.recalculate(
    stale.map((item) => item.id),
    'recálculo supervisado del cierre',
  );

  for (const outcome of report.outcomes) {
    if (outcome.status === 'recalculado') {
      console.log(
        `  #${outcome.subDesignId}: ${outcome.changedCells.length} celda(s)`,
      );
      for (const change of outcome.changedCells) {
        console.log(
          `      ${change.ref}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`,
        );
      }
    } else if (outcome.status === 'fallido') {
      console.log(`  #${outcome.subDesignId}: no se pudo — ${outcome.reason}`);
    }
  }

  console.log(
    `\n${report.recalculated} recalculados | ${report.unchanged} sin cambios | ` +
      `${report.skipped} sin fórmulas | ${report.failed} no se pudieron`,
  );

  const restantes = await subDesigns.count({ where: { isStale: true } });
  console.log(`quedan desactualizados: ${restantes}`);

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
