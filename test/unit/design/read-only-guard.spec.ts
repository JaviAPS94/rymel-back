import { findReadOnlyViolations } from '../../../src/modules/design/services/read-only-guard';

const hoja = (overrides: Record<string, unknown> = {}) => ({
  id: 'design-sheet1',
  name: 'Resumen',
  cells: {
    G17: { value: '=G14*2', formula: '=G14*2', computed: 20 },
    G14: { value: '10', formula: '10', computed: 10 },
    A1: { value: 'libre', formula: 'libre', computed: 'libre' },
  },
  readOnlyZones: [{ id: 'ro-1', startCell: 'G15', endCell: 'G20' }],
  mergedCells: [],
  ...overrides,
});

const conCeldas = (cells: Record<string, unknown>) => hoja({ cells: { ...hoja().cells, ...cells } });

describe('findReadOnlyViolations', () => {
  it('acepta una actualización que no toca lo protegido', () => {
    const entrante = conCeldas({ A1: { value: 'otra', formula: 'otra' } });
    expect(findReadOnlyViolations([JSON.stringify(hoja())], [entrante])).toEqual([]);
  });

  it('acepta que cambie solo el valor calculado de una celda protegida', () => {
    const entrante = conCeldas({
      G14: { value: '11', formula: '11', computed: 11 },
      G17: { value: '=G14*2', formula: '=G14*2', computed: 22 },
    });
    expect(findReadOnlyViolations([JSON.stringify(hoja())], [entrante])).toEqual([]);
  });

  it('rechaza cambiar la fórmula de una celda protegida, nombrando hoja y celda', () => {
    const entrante = conCeldas({ G17: { value: '99', formula: '99', computed: 99 } });
    const violaciones = findReadOnlyViolations([JSON.stringify(hoja())], [entrante]);
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]).toMatchObject({ sheet: 'Resumen', cell: 'G17' });
  });

  it('rechaza borrar una celda protegida', () => {
    const { G17: _borrada, ...resto } = hoja().cells;
    const violaciones = findReadOnlyViolations([JSON.stringify(hoja())], [hoja({ cells: resto })]);
    expect(violaciones.map((v) => v.cell)).toEqual(['G17']);
  });

  it('rechaza escribir en una celda protegida que estaba vacía', () => {
    const entrante = conCeldas({ G19: { value: 'x', formula: 'x' } });
    expect(findReadOnlyViolations([JSON.stringify(hoja())], [entrante]).map((v) => v.cell)).toEqual([
      'G19',
    ]);
  });

  it('rechaza quitar una zona', () => {
    const violaciones = findReadOnlyViolations([JSON.stringify(hoja())], [hoja({ readOnlyZones: [] })]);
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0].cell).toBeUndefined();
    expect(violaciones[0].message).toContain('G15:G20');
  });

  it('rechaza reducir una zona', () => {
    const entrante = hoja({ readOnlyZones: [{ id: 'ro-1', startCell: 'G15', endCell: 'G18' }] });
    expect(findReadOnlyViolations([JSON.stringify(hoja())], [entrante])).toHaveLength(1);
  });

  it('no juzga una hoja que ya no está en el diseño', () => {
    // Cargar otra plantilla reemplaza las hojas: descarta lo protegido, no lo modifica.
    const otra = hoja({ id: 'design-sheet99', cells: {}, readOnlyZones: [] });
    expect(findReadOnlyViolations([JSON.stringify(hoja())], [otra])).toEqual([]);
  });

  it('no hace nada con diseños sin zonas, ni con el formato plano antiguo', () => {
    const sinZonas = hoja({ readOnlyZones: undefined });
    const plano = { A1: { formula: '1' } };
    expect(
      findReadOnlyViolations(
        [JSON.stringify(sinZonas), JSON.stringify(plano), '{}', null],
        [conCeldas({ G17: { formula: '0' } })],
      ),
    ).toEqual([]);
  });

  it('protege entera una celda combinada cuyo origen está protegido', () => {
    const guardada = hoja({
      cells: { B2: { formula: 'Título' } },
      readOnlyZones: [{ id: 'ro-1', startCell: 'B2', endCell: 'B2' }],
      mergedCells: [{ startCell: 'B2', endCell: 'D2' }],
    });
    const entrante = { ...guardada, cells: { B2: { formula: 'Título' }, C2: { formula: 'x' } } };
    expect(findReadOnlyViolations([JSON.stringify(guardada)], [entrante]).map((v) => v.cell)).toEqual([
      'C2',
    ]);
  });
});
