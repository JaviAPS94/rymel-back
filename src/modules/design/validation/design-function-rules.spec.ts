import { TemplateType } from '../../../common/enums';
import {
  detectIncompatibleVariableChange,
  findCodeCollisions,
  parseVariables,
  validateCode,
  validateConstants,
  validateSymbolsDeclared,
  validateVariables,
  ValidationError,
  type ExistingCode,
} from './design-function-rules';

/** Las seis fórmulas que hay hoy en producción, con sus conflictos reales. */
const PRODUCCION: ExistingCode[] = [
  {
    id: 6,
    code: 'CUBIC',
    type: TemplateType.DESIGN,
    name: 'Función cúbica prueba',
  },
  {
    id: 8,
    code: 'QUADRATIC',
    type: TemplateType.DESIGN,
    name: 'Función cuadrática',
  },
  {
    id: 10,
    code: 'QUADRATIC',
    type: TemplateType.DESIGN,
    name: 'Cuadrática con constantes',
  },
  {
    id: 16,
    code: 'CUBIC',
    type: TemplateType.DESIGN,
    name: 'Cúbica con constantes',
  },
  { id: 17, code: 'COST', type: TemplateType.COST, name: 'Calculo de costos' },
  {
    id: 18,
    code: 'ASSOCIATE_COST',
    type: TemplateType.COST,
    name: 'Costos asociados',
  },
];

describe('validateCode', () => {
  it('acepta un código válido y libre', () => {
    expect(() =>
      validateCode('LINEAR', TemplateType.DESIGN, PRODUCCION),
    ).not.toThrow();
  });

  it('rechaza un código ya usado por otra fórmula del mismo tipo', () => {
    expect(() =>
      validateCode('CUBIC', TemplateType.DESIGN, PRODUCCION),
    ).toThrow(/ya lo usa la fórmula/);
  });

  it('admite el mismo código en otro tipo', () => {
    // CUBIC existe en DESIGN; una fórmula de COST puede llamarse igual porque
    // las hojas filtran por tipo antes de resolver.
    expect(() =>
      validateCode('CUBIC', TemplateType.COST, PRODUCCION),
    ).not.toThrow();
  });

  it('rechaza un código que es sufijo de otro existente', () => {
    // El bug vivo: COST captura dentro de ASSOCIATE_COST.
    expect(() =>
      validateCode('COST', TemplateType.COST, [PRODUCCION[5]]),
    ).toThrow(/es sufijo de "ASSOCIATE_COST"/);
  });

  it('rechaza un código del que otro existente es sufijo', () => {
    expect(() =>
      validateCode('EXTRA_COST', TemplateType.COST, [PRODUCCION[4]]),
    ).toThrow(/"COST".*es sufijo de "EXTRA_COST"/);
  });

  it('deja editar una fórmula que conserva su código heredado en conflicto', () => {
    // #6 y #16 comparten CUBIC desde antes de existir esta regla. Editar la
    // descripción de #6 no debe exigir resolver ese conflicto: lo que se
    // impide es crear conflictos nuevos.
    expect(() =>
      validateCode('CUBIC', TemplateType.DESIGN, PRODUCCION, {
        excludeId: 6,
        currentCode: 'CUBIC',
      }),
    ).not.toThrow();
  });

  it('impide cambiar el código a uno que ya está en conflicto', () => {
    expect(() =>
      validateCode('QUADRATIC', TemplateType.DESIGN, PRODUCCION, {
        excludeId: 6,
        currentCode: 'CUBIC',
      }),
    ).toThrow(/ya lo usa la fórmula/);
  });

  it('rechaza formatos inválidos', () => {
    for (const invalido of ['costo-total', '2COST', 'cost', 'CO ST', '']) {
      expect(() => validateCode(invalido, TemplateType.DESIGN, [])).toThrow(
        ValidationError,
      );
    }
  });
});

describe('findCodeCollisions', () => {
  it('encuentra los conflictos que ya existen en producción', () => {
    const colisiones = findCodeCollisions(PRODUCCION);
    const resumen = colisiones.map((c) => `${c.a.id}/${c.b.id}: ${c.reason}`);

    expect(resumen).toEqual([
      '6/16: ambas usan el código "CUBIC"',
      '8/10: ambas usan el código "QUADRATIC"',
      '17/18: "COST" es sufijo de "ASSOCIATE_COST"',
    ]);
  });

  it('no reporta conflictos entre tipos distintos', () => {
    expect(
      findCodeCollisions([
        { id: 1, code: 'COST', type: TemplateType.DESIGN, name: 'a' },
        { id: 2, code: 'COST', type: TemplateType.COST, name: 'b' },
      ]),
    ).toEqual([]);
  });
});

describe('validateVariables', () => {
  it('acepta las variables reales de producción', () => {
    expect(() => validateVariables(['x', 'c', 'd'], {})).not.toThrow();
  });

  it('rechaza variables repetidas', () => {
    expect(() => validateVariables(['x', 'x'], {})).toThrow(/repetida/);
  });

  it('rechaza una variable que también es constante', () => {
    expect(() => validateVariables(['x', 'c'], { c: 2 })).toThrow(
      /variable y como constante/,
    );
  });

  it('rechaza una lista vacía', () => {
    expect(() => validateVariables([], {})).toThrow(/al menos una variable/);
  });
});

describe('validateConstants', () => {
  it('acepta las constantes reales de producción', () => {
    expect(() =>
      validateConstants({ CONST_1: 4, CONST_2: 2, CONST_3: 5 }),
    ).not.toThrow();
  });

  it('rechaza un valor no finito', () => {
    expect(() => validateConstants({ K: Number.POSITIVE_INFINITY })).toThrow(
      /numérico finito/,
    );
    expect(() => validateConstants({ K: 'diez' as unknown as number })).toThrow(
      /numérico finito/,
    );
  });

  it('rechaza un nombre en minúsculas', () => {
    expect(() => validateConstants({ const_1: 4 })).toThrow(/no es válido/);
  });
});

describe('validateSymbolsDeclared', () => {
  it('acepta cuando todo símbolo está declarado', () => {
    expect(
      validateSymbolsDeclared(['x', 'CONST_1'], ['x'], { CONST_1: 7 }),
    ).toEqual([]);
  });

  it('rechaza un símbolo sin declarar', () => {
    expect(() => validateSymbolsDeclared(['x', 'K'], ['x'], {})).toThrow(
      /no están declarados: K/,
    );
  });

  it('avisa de una constante declarada y sin usar, pero no lo impide', () => {
    const avisos = validateSymbolsDeclared(['x'], ['x'], { NO_USADA: 1 });

    expect(avisos).toHaveLength(1);
    expect(avisos[0].kind).toBe('constante-sin-uso');
  });
});

describe('detectIncompatibleVariableChange', () => {
  it('no avisa cuando no cambia nada', () => {
    expect(
      detectIncompatibleVariableChange(['x', 'c', 'd'], ['x', 'c', 'd']),
    ).toEqual([]);
  });

  it('avisa cuando se reordenan las variables', () => {
    // El caso peligroso: sigue evaluando, pero devuelve otro número en todas
    // las hojas ya guardadas.
    const avisos = detectIncompatibleVariableChange(
      ['x', 'c', 'd'],
      ['c', 'x', 'd'],
    );

    expect(avisos).toHaveLength(1);
    expect(avisos[0].kind).toBe('variables-reordenadas');
    expect(avisos[0].message).toMatch(/por posición/);
  });

  it('avisa cuando se elimina una variable', () => {
    const avisos = detectIncompatibleVariableChange(
      ['x', 'c', 'd'],
      ['x', 'c'],
    );

    expect(avisos.map((a) => a.kind)).toEqual(['variables-eliminadas']);
  });

  it('avisa cuando se agrega una variable', () => {
    const avisos = detectIncompatibleVariableChange(['x'], ['x', 'y']);

    expect(avisos.map((a) => a.kind)).toEqual(['variables-agregadas']);
  });

  it('avisa de las dos cosas cuando se sustituye una variable', () => {
    const avisos = detectIncompatibleVariableChange(['x', 'c'], ['x', 'd']);

    expect(avisos.map((a) => a.kind).sort()).toEqual([
      'variables-agregadas',
      'variables-eliminadas',
    ]);
  });
});

describe('parseVariables', () => {
  it('parte y limpia el formato guardado', () => {
    expect(parseVariables(' x , c ,d ')).toEqual(['x', 'c', 'd']);
  });

  it('ignora los separadores sobrantes', () => {
    expect(parseVariables('x,,c,')).toEqual(['x', 'c']);
  });
});
