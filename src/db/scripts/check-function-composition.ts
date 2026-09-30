/**
 * Fórmulas que invocan a otras fórmulas, contra la base real y el motor
 * cifrado corriendo.
 *
 * Dos partes:
 *
 * 1. **Comprobación previa, solo lectura.** Pregunta al motor qué fórmulas
 *    invoca cada versión guardada, sin pedir su texto. Hasta este cambio
 *    ninguna podía invocar a otra sin fallar, así que la respuesta esperada
 *    es «ninguna»; si alguna lo hiciera, empezaría a resolverse contra otra
 *    fórmula y cambiaría de resultado.
 *
 * 2. **Con `--compose`**, de extremo a extremo sobre fórmulas de prueba que
 *    crea y borra: calcular una composición, rechazar un ciclo y una aridad
 *    equivocada, bloquear la baja de una fórmula invocada, contar a quien la
 *    invoca en el impacto, marcar como desactualizado un diseño que la usa a
 *    través de otra, y probarla en el probador. Necesita la migración
 *    `1788500000000` aplicada.
 *
 * Usa el contexto de la aplicación, no servicios construidos a mano: así lo
 * que se prueba es también cómo se inyectan.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/check-function-composition.ts [--compose]
 */

import { NestFactory } from '@nestjs/core';
import { DataSource, IsNull } from 'typeorm';
import * as dotenv from 'dotenv';
import { AppModule } from '../../app.module';
import { DesignFunction } from '../../modules/design/entities/design-function.entity';
import { DesignFunctionVersion } from '../../modules/design/entities/design-function-version.entity';
import { DesignFunctionDependency } from '../../modules/design/entities/design-function-dependency.entity';
import { SubDesign } from '../../modules/design/entities/sub-design.entity';
import { SecureFunctionEngineClient } from '../../modules/design/services/secure-function-engine.client';
import { DesignFunctionAdminService } from '../../modules/design/services/design-function-admin.service';
import { DesignFunctionVersionService } from '../../modules/design/services/design-function-version.service';
import { DesignFunctionService } from '../../modules/design/services/design-function.service';
import { DesignRecalculationService } from '../../modules/design/services/design-recalculation.service';
import { DesignService } from '../../modules/design/services/design.service';
import { TemplateType } from '../../common/enums';
import type { CreateDesignDto } from '../../modules/design/dtos/create-desing.dto';

dotenv.config();

let failures = 0;
const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '  ok  ' : ' FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
};

const failsWith = async (
  name: string,
  action: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> => {
  try {
    await action();
    check(name, false, 'no lanzó ningún error');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, expected.test(message), message.slice(0, 120));
  }
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const dataSource = app.get(DataSource);
  const engine = app.get(SecureFunctionEngineClient);

  console.log('\n--- comprobación previa: qué invocan las versiones guardadas');
  const versions = await dataSource.getRepository(DesignFunctionVersion).find({
    relations: ['designFunction'],
  });
  const withCalls: string[] = [];
  for (const version of versions) {
    const calls = await engine.invokedFormulas(version.expression);
    if (calls.length > 0) {
      withCalls.push(
        `${version.designFunction.code} v${version.version} → ${calls.map((call) => call.name).join(', ')}`,
      );
    }
  }
  const active = versions.filter(
    (version) => version.isCurrent && version.designFunction.deletedAt === null,
  );
  check(
    `ninguna de las ${versions.length} versiones guardadas (${active.length} vigentes y activas) invoca otra fórmula`,
    withCalls.length === 0,
    withCalls.join('; '),
  );

  if (!process.argv.includes('--compose')) {
    await app.close();
    console.log(failures === 0 ? '\nNada que migrar: la tabla nace vacía.' : `\n${failures} comprobación(es) fallan.`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const admin = app.get(DesignFunctionAdminService);
  const versionService = app.get(DesignFunctionVersionService);
  const calculator = app.get(DesignFunctionService);
  const recalculation = app.get(DesignRecalculationService);
  const designs = app.get(DesignService);

  // Códigos que no son sufijo de ninguno existente ni al revés.
  const BASE = 'ZZCOMPOSBASE';
  const DOBLE = 'ZZCOMPOSDOBLE';
  const created: number[] = [];
  let designId: number | undefined;

  try {
    console.log('\n--- composición');
    const base = await admin.create({
      name: '__prueba composición base',
      code: BASE,
      expression: 'y = x^2 + 2*x + 1',
      variables: 'x',
      type: TemplateType.DESIGN,
    } as never);
    created.push(base.id);

    const doble = await admin.create({
      name: '__prueba composición doble',
      code: DOBLE,
      expression: `y = ${BASE}(x) * 2`,
      variables: 'x',
      type: TemplateType.DESIGN,
    } as never);
    created.push(doble.id);

    const rows = await dataSource.getRepository(DesignFunctionDependency).find({
      relations: ['version'],
    });
    check(
      'la versión de la que invoca queda registrada con su dependencia',
      rows.some(
        (row) => row.version.designFunctionId === doble.id && row.dependsOnFunctionId === base.id,
      ),
    );

    const [calculated] = await calculator.calculateFunctions([
      { designFunctionId: doble.id, parameters: { x: 3 } } as never,
    ]);
    check(
      'se calcula de extremo a extremo: 2 × (3² + 2·3 + 1) = 32',
      (calculated as unknown as { result: number }).result === 32,
      JSON.stringify(calculated),
    );

    const tested = await admin.testExpression({
      expression: `y = ${DOBLE}(x) + 1`,
      parameters: { x: 3 },
      type: TemplateType.DESIGN,
    } as never);
    check('el probador resuelve las anidadas: 33', tested.result === 33, JSON.stringify(tested));

    console.log('\n--- lo que se rechaza');
    await failsWith(
      'un ciclo indirecto, mostrando la cadena',
      () =>
        versionService.publish({
          designFunctionId: base.id,
          expression: `y = ${DOBLE}(x) + 1`,
          variables: 'x',
          constants: {},
        }),
      new RegExp(`${BASE} → ${DOBLE} → ${BASE}`),
    );
    await failsWith(
      'una aridad equivocada',
      () =>
        versionService.publish({
          designFunctionId: doble.id,
          expression: `y = ${BASE}(x, 2)`,
          variables: 'x',
          constants: {},
        }),
      /espera 1 argumento/,
    );
    await failsWith(
      'una fórmula inexistente',
      () =>
        versionService.publish({
          designFunctionId: doble.id,
          expression: 'y = ZZNOEXISTE(x)',
          variables: 'x',
          constants: {},
        }),
      /ZZNOEXISTE.*no es una fórmula activa/,
    );
    await failsWith(
      'la baja de una fórmula que otra invoca',
      () => admin.softDelete(base.id),
      new RegExp(`la invoca ${DOBLE}`),
    );

    console.log('\n--- impacto y obsolescencia');
    const impact = await admin.impact(base.id);
    check(
      'el impacto nombra a quien la invoca',
      impact.invokedBy.some((item) => item.code === DOBLE),
    );

    const detail = await admin.detail(doble.id, { email: 'check' });
    check(
      'el detalle dice qué invoca y quién la invoca',
      detail.invokes.some((item) => item.code === BASE) &&
        (await admin.detail(base.id, { email: 'check' })).invokedBy.some(
          (item) => item.code === DOBLE,
        ),
    );

    // Un diseño que usa DOBLE, estampado como si se hubiera calculado ahora.
    const { id } = await designs.createDesign({
      name: '__prueba composición',
      code: '__PRUEBA_COMPOSICION__',
      designSubtypeId: 1,
      elements: [],
      subDesigns: [
        {
          name: 'Hoja',
          code: 'hoja',
          data: {
            id: 'hoja',
            name: 'Hoja',
            cells: { A1: { value: `=${DOBLE}(3)`, formula: `=${DOBLE}(3)`, computed: 32 } },
          },
        },
      ],
    } as unknown as CreateDesignDto);
    designId = id;
    const subDesign = await dataSource.getRepository(SubDesign).findOneOrFail({
      where: { design: { id } },
    });
    const current = (functionId: number) =>
      dataSource
        .getRepository(DesignFunctionVersion)
        .findOneOrFail({ where: { designFunctionId: functionId, isCurrent: true } });
    await recalculation.stamp(subDesign.id, {
      [String(doble.id)]: (await current(doble.id)).id,
      [String(base.id)]: (await current(base.id)).id,
    });

    const republished = await versionService.publish({
      designFunctionId: base.id,
      expression: 'y = x^2',
      variables: 'x',
      constants: {},
    });
    const after = await dataSource.getRepository(SubDesign).findOneOrFail({
      where: { id: subDesign.id },
    });
    check(
      'publicar la invocada marca el diseño que la usa solo a través de otra',
      after.isStale === true && republished.staleSubDesigns >= 1,
      `isStale=${after.isStale}, marcados=${republished.staleSubDesigns}`,
    );
    const [recalculated] = await calculator.calculateFunctions([
      { designFunctionId: doble.id, parameters: { x: 3 } } as never,
    ]);
    check(
      'y el cálculo usa ya la versión vigente de la invocada: 2 × 3² = 18',
      (recalculated as unknown as { result: number }).result === 18,
    );
  } finally {
    console.log('\n--- limpieza');
    if (designId !== undefined) {
      await dataSource.getRepository(SubDesign).delete({ design: { id: designId } });
      await dataSource.query('DELETE FROM design_element WHERE design_id = @0', [designId]);
      await dataSource.query('DELETE FROM design WHERE id = @0', [designId]);
    }
    for (const id of created.reverse()) {
      await dataSource.query(
        `DELETE d FROM design_function_dependency d
           JOIN design_function_version v ON v.id = d.version_id
          WHERE v.design_function_id = @0`,
        [id],
      );
      await dataSource.getRepository(DesignFunctionVersion).delete({ designFunctionId: id });
      await dataSource.getRepository(DesignFunction).delete({ id });
    }
    const leftovers = await dataSource.getRepository(DesignFunction).count({
      where: [{ code: BASE }, { code: DOBLE }],
    });
    const deps = await dataSource.getRepository(DesignFunctionDependency).count();
    check('no quedan fórmulas de prueba ni dependencias', leftovers === 0 && deps === 0);
    const activeAfter = await dataSource
      .getRepository(DesignFunction)
      .count({ where: { deletedAt: IsNull() } });
    console.log(`  fórmulas activas: ${activeAfter}`);
    await app.close();
  }

  console.log(failures === 0 ? '\nTodas las comprobaciones pasan.' : `\n${failures} comprobación(es) fallan.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
