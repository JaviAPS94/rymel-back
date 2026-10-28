/**
 * De dónde sale lo que llega a la lista de materiales, medido en la base.
 *
 * La lista junta dos fuentes: lo que la plantilla del admin vincula (ítems
 * dentro de zonas de semielaborado) y lo que la norma del cliente define en
 * cada elemento (accesorios, con el semielaborado al que van). Un accesorio
 * sin semielaborado no aparece en la lista. Solo lee.
 *
 *   npx ts-node -r tsconfig-paths/register src/db/scripts/audit-bom-sources.ts
 */

import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';

dotenvConfig({ path: '.env' });

const parse = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
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

  const elements: { id: number; values: string; norm_id: number }[] = await dataSource.query(
    'SELECT id, [values], norm_id FROM element WHERE deleted_at IS NULL',
  );
  const usedInDesigns = new Set<number>(
    (
      await dataSource.query(
        `SELECT DISTINCT de.element_id AS id FROM design_element de
         JOIN design d ON d.id = de.design_id WHERE d.deleted_at IS NULL`,
      )
    ).map((r: { id: number }) => r.id),
  );

  let withAccessories = 0;
  let accessories = 0;
  let withSf = 0;
  let withoutSf = 0;
  let elementsWithMissingSf = 0;
  let inDesignsWithout = 0;
  const keysWithSf = new Map<string, number>();
  const norms = new Set<number>();
  const accessoryKeys = new Map<string, number>();
  // Accesorios a los que les falta algo de lo que trae el ERP o la cantidad
  let incomplete = 0;
  let incompleteInDesigns = 0;
  const incompleteNorms = new Set<number>();

  for (const element of elements) {
    const values = parse(element.values);
    if (!Array.isArray(values)) continue;
    for (const field of values as Record<string, unknown>[]) {
      const value = parse(field.value);
      if (field.key !== 'accesories' && JSON.stringify(value ?? '').includes('semiFinished')) {
        keysWithSf.set(String(field.key), (keysWithSf.get(String(field.key)) ?? 0) + 1);
      }
      if (field.key !== 'accesories' || !Array.isArray(value)) continue;
      withAccessories++;
      norms.add(element.norm_id);
      let missing = 0;
      for (const acc of value as Record<string, unknown>[]) {
        accessories++;
        for (const [key, v] of Object.entries(acc)) {
          if (v !== null && v !== undefined && v !== '') {
            accessoryKeys.set(key, (accessoryKeys.get(key) ?? 0) + 1);
          }
        }
        const lacks = ['unitOfMeasurement', 'averageCost', 'lastCost', 'value'].filter(
          (key) => acc[key] === null || acc[key] === undefined || acc[key] === '',
        );
        if (lacks.length > 0) {
          incomplete++;
          incompleteNorms.add(element.norm_id);
          if (usedInDesigns.has(element.id)) incompleteInDesigns++;
        }
        const sf = acc.semiFinished as { id?: number } | undefined;
        if (sf?.id != null) withSf++;
        else {
          withoutSf++;
          missing++;
        }
      }
      if (missing > 0) {
        elementsWithMissingSf++;
        if (usedInDesigns.has(element.id)) inDesignsWithout += missing;
      }
    }
  }

  const designs = await dataSource.query(
    `SELECT COUNT(*) AS n FROM design WHERE deleted_at IS NULL`,
  );

  console.log(`elementos activos: ${elements.length}`);
  console.log(`elementos con accesorios: ${withAccessories} (de ${norms.size} normas)`);
  console.log(`accesorios: ${accessories}; con semielaborado: ${withSf}; sin semielaborado: ${withoutSf}`);
  console.log(`elementos con algún accesorio sin semielaborado: ${elementsWithMissingSf}`);
  console.log(`accesorios sin semielaborado en elementos usados por diseños: ${inDesignsWithout}`);
  console.log(`otros campos de la norma que llevan semielaborado: ${JSON.stringify(Object.fromEntries(keysWithSf))}`);
  console.log(`campos de los accesorios (con valor, de ${accessories}): ${JSON.stringify(Object.fromEntries(accessoryKeys))}`);
  console.log(`accesorios sin unidad, costos o cantidad: ${incomplete} (de ${incompleteNorms.size} normas); en elementos usados por diseños: ${incompleteInDesigns}`);
  console.log(`diseños activos: ${designs[0].n}; elementos usados por diseños: ${usedInDesigns.size}`);

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
