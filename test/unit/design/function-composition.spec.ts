import {
  findCycleThrough,
  invert,
  longestChainFrom,
  reachableFrom,
} from '../../../src/modules/design/validation/function-composition';

const graph = (edges: Record<number, number[]>) =>
  new Map(Object.entries(edges).map(([from, to]) => [Number(from), to]));

describe('function-composition', () => {
  it('encuentra un ciclo indirecto que vuelve al inicio', () => {
    // 1 → 2 → 3 → 1
    expect(findCycleThrough(graph({ 1: [2], 2: [3], 3: [1] }), 1)).toEqual([1, 2, 3, 1]);
  });

  it('un ciclo que no pasa por el inicio no es suyo', () => {
    // 2 ↔ 3, y 1 solo los invoca: el ciclo existe, pero no lo crea 1.
    expect(findCycleThrough(graph({ 1: [2], 2: [3], 3: [2] }), 1)).toBeNull();
  });

  it('sin ciclos devuelve null', () => {
    expect(findCycleThrough(graph({ 1: [2, 3], 2: [3] }), 1)).toBeNull();
  });

  it('la cadena más larga cuenta los niveles anidados', () => {
    expect(longestChainFrom(graph({ 1: [2, 5], 2: [3], 3: [4] }), 1)).toEqual([2, 3, 4]);
  });

  it('lo alcanzable no incluye al inicio ni repite', () => {
    expect(reachableFrom(graph({ 1: [2, 3], 2: [3], 3: [4] }), 1).sort()).toEqual([2, 3, 4]);
  });

  it('el grafo invertido lleva de cada fórmula a quien la invoca', () => {
    const inverted = invert(graph({ 1: [3], 2: [3] }));
    expect(inverted.get(3)).toEqual([1, 2]);
    expect(reachableFrom(inverted, 3).sort()).toEqual([1, 2]);
  });
});
