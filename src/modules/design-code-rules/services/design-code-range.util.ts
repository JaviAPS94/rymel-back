/** Dos rangos [min, max] se solapan si comparten al menos un valor (límites inclusivos en ambos extremos). */
export function rangesOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  return aMin <= bMax && bMin <= aMax;
}
