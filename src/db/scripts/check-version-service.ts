/**
 * Verificación de integración del servicio de versiones.
 *
 * Corre contra la base real y el motor cifrado real, sobre una fórmula de
 * prueba que crea y borra. Comprueba lo que las pruebas unitarias no pueden:
 * que el índice único filtrado y la transacción de cambio de vigencia se
 * comporten como se espera cuando hay una base de datos de verdad debajo.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-version-service.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { DesignFunctionAccessLog } from '../../modules/design/entities/design-function-access-log.entity';
import { DesignFunctionVersionService } from '../../modules/design/services/design-function-version.service';
import { DesignRecalculationService } from '../../modules/design/services/design-recalculation.service';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { DesignSubTypeFunction } from '../../modules/design/entities/design-subtype-function.entity';
import { SubDesignRecalculation } from '../../modules/design/entities/sub-design-recalculation.entity';
import { SecureFunctionEngineClient } from '../../modules/design/services/secure-function-engine.client';
import { ValidationError } from '../../modules/design/validation/design-function-rules';
import { TemplateType } from '../../common/enums';
import { DesignFunctionDependencyService } from '../../modules/design/services/design-function-dependency.service';
import { DesignFunctionDependency } from '../../modules/design/entities/design-function-dependency.entity';

dotenvConfig({ path: '.env' });

let passed = 0;
let failed = 0;

const check = (description: string, condition: boolean, detail = ''): void => {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${description}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${description} ${detail}`);
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
    // Todas las entidades: DesignFunction se relaciona con los subtipos y
    // TypeORM necesita el grafo completo para construir sus metadatos.
    entities: ['src/**/*.entity.ts'],
  });
  await dataSource.initialize();

  const functions = dataSource.getRepository(DesignFunction);
  const versions = dataSource.getRepository(DesignFunctionVersion);
  const logs = dataSource.getRepository(DesignFunctionAccessLog);

  const engine = new SecureFunctionEngineClient(
    new HttpService(axios.create()),
  );
  const recalculation = new DesignRecalculationService(
    dataSource.getRepository(SubDesign),
    functions,
    versions,
    dataSource.getRepository(DesignSubTypeFunction),
    dataSource.getRepository(SubDesignRecalculation),
    engine,
    dataSource,
    new DesignFunctionDependencyService(
      dataSource.getRepository(DesignFunction),
      dataSource.getRepository(DesignFunctionVersion),
      dataSource.getRepository(DesignFunctionDependency),
    ),
  );
  const service = new DesignFunctionVersionService(
    functions,
    versions,
    logs,
    engine,
    dataSource,
    recalculation,
    new DesignFunctionDependencyService(
      dataSource.getRepository(DesignFunction),
      dataSource.getRepository(DesignFunctionVersion),
      dataSource.getRepository(DesignFunctionDependency),
    ),
  );

  const probe = await functions.save(
    functions.create({
      name: `__prueba_versionado_${Date.now()}`,
      code: 'PRUEBAVERSION',
      description: 'fórmula temporal de verificación',
      type: TemplateType.DESIGN,
    }),
  );

  try {
    console.log('\npublicación de la primera versión');
    const first = await service.publish({
      designFunctionId: probe.id,
      expression: 'y = x^2 + CONST_1',
      variables: 'x',
      constants: { CONST_1: 7 },
    });
    check(
      'la versión 1 nace vigente',
      first.version.version === 1 && first.version.isCurrent,
    );
    check(
      'la expresión se guarda cifrada',
      first.version.expression.includes(':') &&
        !first.version.expression.includes('x^2'),
      first.version.expression.slice(0, 20),
    );

    console.log('\nsegunda versión');
    const second = await service.publish({
      designFunctionId: probe.id,
      expression: 'y = x^2 + CONST_1 + 1',
      variables: 'x',
      constants: { CONST_1: 7 },
    });
    check(
      'la versión 2 queda vigente',
      second.version.version === 2 && second.version.isCurrent,
    );

    const all = await service.history(probe.id);
    check('el historial conserva las dos', all.length === 2);
    check('solo hay una vigente', all.filter((v) => v.isCurrent).length === 1);
    check(
      'la versión 1 se conserva intacta',
      all.find((v) => v.version === 1)!.expression === first.version.expression,
    );

    console.log('\nvalidaciones que deben rechazar');
    await expectRejection(
      'símbolo sin declarar',
      service.publish({
        designFunctionId: probe.id,
        expression: 'y = x^2 + K',
        variables: 'x',
        constants: {},
      }),
      /no están declarados/,
    );
    await expectRejection(
      'sintaxis inválida',
      service.publish({
        designFunctionId: probe.id,
        expression: 'y = x^^2',
        variables: 'x',
        constants: {},
      }),
      /Sintaxis|inválida/i,
    );
    await expectRejection(
      'constante no finita',
      service.publish({
        designFunctionId: probe.id,
        expression: 'y = x + K',
        variables: 'x',
        constants: { K: Number.POSITIVE_INFINITY },
      }),
      /finito/,
    );

    console.log('\ncambio incompatible de variables');
    await expectRejection(
      'reordenar variables sin confirmar',
      service.publish({
        designFunctionId: probe.id,
        expression: 'y = x + b',
        variables: 'b,x',
        constants: {},
      }),
      /requiere confirmación/,
    );

    const confirmed = await service.publish({
      designFunctionId: probe.id,
      expression: 'y = x + b',
      variables: 'x,b',
      constants: {},
      acceptWarnings: true,
    });
    check('con confirmación sí publica', confirmed.version.version === 3);
    check(
      'y devuelve el aviso del cambio',
      confirmed.warnings.some((w) => w.kind === 'variables-agregadas'),
      JSON.stringify(confirmed.warnings),
    );

    console.log('\nrestauración');
    const restored = await service.restore(probe.id, 1);
    check('restaurar publica una versión nueva', restored.version === 4);
    check(
      'con el contenido de la versión restaurada',
      restored.expression === first.version.expression,
    );
    const afterRestore = await service.history(probe.id);
    check('sin reescribir el historial', afterRestore.length === 4);

    console.log('\nlectura del texto plano y auditoría');
    const plain = await service.revealExpression(probe.id, {
      id: 'BB36433E-F36B-1410-8A03-0091B30B2C3A',
      email: 'alex@ejemplo.com',
    });
    check(
      'devuelve la expresión original',
      plain === 'y = x^2 + CONST_1',
      plain,
    );

    const audit = await service.accessLog(probe.id);
    check('el acceso queda registrado', audit.length === 1);
    check(
      'con el usuario',
      audit[0]?.userId?.toUpperCase() ===
        'BB36433E-F36B-1410-8A03-0091B30B2C3A' &&
        audit[0]?.userEmail === 'alex@ejemplo.com',
      String(audit[0]?.userId),
    );
    check(
      'y con la versión leída',
      audit[0]?.designFunctionVersionId === restored.id,
    );

    console.log('\ninvariante de la base');
    let rejected = false;
    try {
      await dataSource.query(
        `UPDATE design_function_version SET is_current = 1 WHERE design_function_id = @0 AND version = 1`,
        [probe.id],
      );
    } catch {
      rejected = true;
    }
    check('la base impide dos versiones vigentes', rejected);
  } finally {
    await logs.delete({ designFunctionId: probe.id });
    await versions.delete({ designFunctionId: probe.id });
    await functions.delete({ id: probe.id });
    console.log('\n(fórmula de prueba eliminada)');
    await dataSource.destroy();
  }

  console.log(`\n${passed} comprobaciones correctas, ${failed} fallidas`);
  process.exit(failed === 0 ? 0 : 1);
}

async function expectRejection(
  description: string,
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await promise;
    check(description, false, '(no rechazó)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(
      description,
      pattern.test(message) ||
        (error instanceof ValidationError && pattern.test(message)),
      `mensaje: ${message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
