/**
 * Reglas de composición entre fórmulas, sin base de datos.
 *
 * El grafo va de cada fórmula a las que invoca su versión vigente. Viven
 * aparte del servicio para poder probarlas con grafos escritos a mano: son
 * las que deciden si una versión se puede publicar.
 */

/** Cuántos niveles de fórmulas anidadas se admiten. El mismo límite que aplica el motor. */
export const MAX_NESTING_DEPTH = 5;

export type InvocationGraph = ReadonlyMap<number, readonly number[]>;

/**
 * El primer ciclo que pasa por `start`, como cadena de ids que empieza y
 * termina en él, o `null` si no hay.
 */
export const findCycleThrough = (
  graph: InvocationGraph,
  start: number,
): number[] | null => {
  const visit = (node: number, path: number[], seen: Set<number>): number[] | null => {
    for (const next of graph.get(node) ?? []) {
      if (next === start) return [...path, next];
      if (seen.has(next)) continue;
      seen.add(next);
      const found = visit(next, [...path, next], seen);
      if (found) return found;
    }
    return null;
  };
  return visit(start, [start], new Set([start]));
};

/**
 * La cadena de invocaciones más larga que sale de `start`, sin contarlo a él.
 * Supone que no hay ciclos: se comprueban antes.
 */
export const longestChainFrom = (graph: InvocationGraph, start: number): number[] => {
  const memo = new Map<number, number[]>();
  const walk = (node: number): number[] => {
    const cached = memo.get(node);
    if (cached) return cached;
    let best: number[] = [];
    for (const next of graph.get(node) ?? []) {
      const chain = [next, ...walk(next)];
      if (chain.length > best.length) best = chain;
    }
    memo.set(node, best);
    return best;
  };
  return walk(start);
};

/** Todas las fórmulas que `start` invoca, directa o indirectamente. */
export const reachableFrom = (graph: InvocationGraph, start: number): number[] => {
  const seen = new Set<number>();
  const pending = [...(graph.get(start) ?? [])];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node === start || seen.has(node)) continue;
    seen.add(node);
    pending.push(...(graph.get(node) ?? []));
  }
  return [...seen];
};

/** El grafo invertido: de cada fórmula a las que la invocan. */
export const invert = (graph: InvocationGraph): Map<number, number[]> => {
  const inverted = new Map<number, number[]>();
  for (const [caller, callees] of graph) {
    for (const callee of callees) {
      inverted.set(callee, [...(inverted.get(callee) ?? []), caller]);
    }
  }
  return inverted;
};
