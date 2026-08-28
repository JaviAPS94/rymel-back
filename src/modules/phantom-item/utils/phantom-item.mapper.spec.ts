import { PhantomItem } from '../entities/phantom-item.entity';
import { toPhantomItemOutput } from './phantom-item.mapper';

/**
 * Lo que sale por `formulaOverrides` es lo que el registro tiene de propio.
 *
 * El mapeador rellenaba los huecos con la fórmula por defecto de cada
 * longitud. Esa fórmula está escrita en el dialecto de este lado
 * —`=LARGO(reference)`, que mide un campo por su nombre porque aquí se calcula
 * sin rejilla— y el editor evalúa referencias de celda, así que la fila
 * cargada le salía con `#ERROR` en las tres columnas de longitud mientras las
 * filas que él mismo añadía, con `=LARGO(F2)`, salían bien.
 */
const record = (formulaOverrides: string | null): PhantomItem =>
  ({
    id: 1,
    finishedProductType: '1V',
    workInProcessType: 'YU',
    phantomRootCode: 'RT',
    kvaRatingStandard: '15',
    itemCode: 'R345343',
    reference: 'F-1V-YU-RT15',
    itemDescription: 'F-1V-YU-RT15',
    shortDescription: 'FANTASMA RT',
    unitOfMeasure: 'U',
    referenceLengthLimit: 40,
    formulaOverrides,
  }) as unknown as PhantomItem;

describe('toPhantomItemOutput', () => {
  it('no inventa overrides para las longitudes', () => {
    const output = toPhantomItemOutput(record(null), 0);

    expect(output.formulaOverrides).toEqual({});
  });

  it('conserva los que el registro sí tiene', () => {
    const output = toPhantomItemOutput(
      record(JSON.stringify({ reference: '="X-"&A1' })),
      0,
    );

    expect(output.formulaOverrides).toEqual({ reference: '="X-"&A1' });
  });

  it('sigue calculando las longitudes, que van aparte', () => {
    // Quitar los overrides fabricados no debe dejar al cliente sin los
    // números: viajan como campos propios, ya calculados aquí.
    const output = toPhantomItemOutput(record(null), 0);

    expect(output.referenceLength).toBe(12);
    expect(output.itemDescriptionLength).toBe(12);
    expect(output.shortDescriptionLength).toBe(11);
  });
});
