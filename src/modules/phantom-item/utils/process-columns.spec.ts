import { PhantomColumnScope } from '../entities/phantom-process-column.entity';
import {
  customKeyFor,
  defaultProcessColumns,
  headerMatcher,
  inferProcessColumns,
  matchHeader,
  sameName,
  validateProcessColumns,
} from './process-columns';

/** Header rows exactly as they are in the business's workbook */
const EMBLEMADO = [
  'Fantasma',
  'Estructura LM',
  'Plantillas Diseño',
  'Tipo PT',
  'Tipo PP',
  'Raiz Fantasma',
  'R kVA + Norma / Otros',
  'Item',
  'Referencia',
  'Largo 40/50',
  'Desc. item',
  'Largo 40',
  'Desc. corta',
  'Largo 20',
  'UM',
  'ÍTEM - COMPONENTE',
  'DESCRIPCIÓN',
  'CANT. BASE',
  'CANT. REQUERIDA LMS',
  'CANT. REQUERIDA UNITARIA',
  'U.M',
  '% DESP.',
  'BODEGA CONSUMO',
];
const ALISTAMIENTO = [
  'Fantasma',
  'Estructura LM',
  'Tipo PT',
  'Tipo PP',
  'Raiz Fantasma',
  'R kVA + Norma / Otros',
  'Item',
  'Referencia',
  'Largo 40/50',
  'Desc. item',
  'Largo 40',
  'Desc. corta',
  'Largo 20',
  'UM',
  'PLAN1',
  'MAYOR1',
  'PLAN2',
  'MAYOR2',
  'ÍTEM - COMPONENTE',
  'DESCRIPCIÓN',
  'CANT. BASE',
  'CANT. REQUERIDA',
  'U.M',
  '% DESP.',
  'BODEGA CONSUMO',
];
const METALMECANICA = [
  'Fantasma',
  'Estructura LM',
  'Tipo PT',
  'Tipo PP',
  'Raiz Fantasma',
  'R kVA + Norma / Otros',
  'Item',
  'Item',
  'Referencia',
  'Largo 40/50',
  'Desc. item',
  'Largo 40',
  'Desc. corta',
  'Largo 20',
  'UM',
  'ÍTEM - COMPONENTE',
  'DESCRIPCIÓN',
  'CANT. BASE',
  'CANT. REQUERIDA',
  'U.M',
  '% DESP. LAMINA',
  'BODEGA CONSUMO',
];

describe('inferProcessColumns', () => {
  it('ALISTAMIENTO: PLAN/MAYOR become own header columns, out-of-scope columns are ignored', () => {
    const { columns, ignored } = inferProcessColumns(ALISTAMIENTO);
    const own = columns.filter((column) => column.key.startsWith('custom:'));

    expect(
      own.map((column) => [column.key, column.header, column.scope]),
    ).toEqual([
      ['custom:plan1', 'PLAN1', PhantomColumnScope.HEADER],
      ['custom:mayor1', 'MAYOR1', PhantomColumnScope.HEADER],
      ['custom:plan2', 'PLAN2', PhantomColumnScope.HEADER],
      ['custom:mayor2', 'MAYOR2', PhantomColumnScope.HEADER],
    ]);
    expect(ignored).toEqual(['Estructura LM']);
    expect(columns.some((column) => column.header === 'Fantasma')).toBe(false);
    expect(validateProcessColumns(columns)).toEqual([]);
  });

  it("EMBLEMADO: the same typed field keeps the sheet's own header", () => {
    const { columns, ignored } = inferProcessColumns(EMBLEMADO);
    expect(
      columns.find((column) => column.key === 'requiredQuantity')?.header,
    ).toBe('CANT. REQUERIDA LMS');
    expect(
      columns.find((column) => column.key === 'requiredQuantityPerUnit')
        ?.header,
    ).toBe('CANT. REQUERIDA UNITARIA');
    expect(ignored).toEqual(['Estructura LM', 'Plantillas Diseño']);
    expect(
      columns.filter((column) => column.key.startsWith('custom:')),
    ).toEqual([]);
  });

  it('METALMECANICA: «% DESP. LAMINA» is the typed waste percentage and the repeated «Item» appears once', () => {
    const { columns } = inferProcessColumns(METALMECANICA);
    expect(columns.filter((column) => column.key === 'itemCode')).toHaveLength(
      1,
    );
    expect(
      columns.find((column) => column.key === 'wastePercentage')?.header,
    ).toBe('% DESP. LAMINA');
    expect(
      columns.filter((column) => column.key.startsWith('custom:')),
    ).toEqual([]);
  });

  it('an unknown header right of the components is an own line column', () => {
    const { columns } = inferProcessColumns([...ALISTAMIENTO, 'LOTE']);
    expect(columns.find((column) => column.header === 'LOTE')).toEqual({
      key: 'custom:lote',
      header: 'LOTE',
      scope: PhantomColumnScope.COMPONENT,
    });
  });
});

describe('headerMatcher / matchHeader', () => {
  it('answers to the process header, the canonical header and the aliases', () => {
    const { columns } = inferProcessColumns(EMBLEMADO);
    const matcher = headerMatcher(columns);
    expect(matchHeader(matcher, columns, 'cant. requerida lms')).toBe(
      'requiredQuantity',
    );
    expect(matchHeader(matcher, columns, 'CANT. REQUERIDA')).toBe(
      'requiredQuantity',
    );
    expect(matchHeader(matcher, columns, 'Fantasma')).toBe('__family');
    expect(matchHeader(matcher, columns, 'Estructura LM')).toBeUndefined();
  });
});

describe('validateProcessColumns', () => {
  it('accepts the default catalog', () => {
    expect(validateProcessColumns(defaultProcessColumns())).toEqual([]);
  });

  it('rejects removing a required column, repeated headers and the family header', () => {
    const columns = defaultProcessColumns().filter(
      (column) => column.key !== 'itemCode',
    );
    columns.push({
      key: 'custom:x',
      header: 'Fantasma',
      scope: PhantomColumnScope.HEADER,
    });
    columns.push({
      key: 'custom:y',
      header: 'tipo pt',
      scope: PhantomColumnScope.HEADER,
    });
    const problems = validateProcessColumns(columns);
    expect(problems).toContain('Column "Item" cannot be removed.');
    expect(problems.some((problem) => problem.includes('reserved'))).toBe(true);
    expect(problems.some((problem) => problem.includes('repeated'))).toBe(true);
  });
});

describe('names', () => {
  it('compares process names without case, accents or extra spaces', () => {
    expect(sameName('Metalmecánica', ' METALMECANICA ')).toBe(true);
    expect(sameName('ARMADO Y CONEXIÓN', 'armado  y conexion')).toBe(true);
  });

  it('builds own keys from headers', () => {
    expect(customKeyFor('MAYOR 1')).toBe('custom:mayor_1');
  });
});
