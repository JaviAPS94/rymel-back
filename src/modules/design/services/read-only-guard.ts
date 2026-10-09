/**
 * Lo que un diseño no puede cambiar en sus celdas protegidas.
 *
 * La plantilla declara zonas de solo lectura, y esas zonas viajan dentro de
 * la copia de cada hoja que se guarda con el diseño. La interfaz del
 * diseñador ya impide editarlas, pero la interfaz no es la autoridad: esta
 * comprobación rechaza en el servidor una actualización que las altere.
 *
 * Qué se compara, y qué no:
 *
 * - **Lo escrito**, no lo calculado. Una fórmula protegida cambia de valor
 *   cuando cambian sus entradas, y eso es legítimo.
 * - **Las hojas que siguen en el diseño**, emparejadas por su `id`. Cargar
 *   otra plantilla sobre un diseño reemplaza sus hojas por otras; eso descarta
 *   el contenido protegido, no lo modifica, y bloquearlo impediría un flujo
 *   que el diseñador tiene.
 * - **Solo contra lo guardado.** Un diseño no guarda de qué plantilla viene,
 *   así que en su creación no hay contra qué comparar.
 */

import { isReadOnly } from '@rymel/design-template';

interface Region {
  startCell: string;
  endCell: string;
}

interface StoredSheet {
  id?: unknown;
  name?: unknown;
  cells?: Record<string, { formula?: unknown; value?: unknown } | undefined>;
  readOnlyZones?: Region[];
  mergedCells?: Region[];
}

export interface ReadOnlyViolation {
  sheet: string;
  cell?: string;
  message: string;
}

const parse = (data: unknown): StoredSheet | null => {
  const value = typeof data === 'string' ? safeParse(data) : data;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const sheet = value as StoredSheet;
  // Solo el formato con envoltorio lleva zonas; el plano es anterior a ellas.
  if (sheet.cells === undefined || typeof sheet.cells !== 'object') return null;
  return sheet;
};

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Lo que el diseñador escribió en la celda. Una celda ausente es una vacía. */
const writtenContent = (sheet: StoredSheet, ref: string): string => {
  const cell = sheet.cells?.[ref];
  const raw = cell?.formula ?? cell?.value ?? '';
  return String(raw);
};

const sameZone = (a: Region, b: Region): boolean =>
  a.startCell.trim().toUpperCase() === b.startCell.trim().toUpperCase() &&
  a.endCell.trim().toUpperCase() === b.endCell.trim().toUpperCase();

/**
 * Compara las hojas guardadas de un diseño con las que llegan para
 * sustituirlas, y devuelve todo lo que alteraría una celda protegida.
 */
export const findReadOnlyViolations = (
  storedData: readonly unknown[],
  incomingData: readonly unknown[],
): ReadOnlyViolation[] => {
  const incomingById = new Map<string, StoredSheet>();
  for (const data of incomingData) {
    const sheet = parse(data);
    if (sheet?.id !== undefined) incomingById.set(String(sheet.id), sheet);
  }

  const violations: ReadOnlyViolation[] = [];

  for (const data of storedData) {
    const stored = parse(data);
    const zones = stored?.readOnlyZones ?? [];
    if (stored === null || stored.id === undefined || zones.length === 0) continue;

    const incoming = incomingById.get(String(stored.id));
    if (incoming === undefined) continue;

    const sheetName = String(stored.name ?? stored.id);
    const incomingZones = incoming.readOnlyZones ?? [];

    for (const zone of zones) {
      if (incomingZones.some((other) => sameZone(zone, other))) continue;
      violations.push({
        sheet: sheetName,
        message: `La zona de solo lectura ${zone.startCell}:${zone.endCell} de "${sheetName}" no se puede quitar ni reducir`,
      });
    }

    const refs = new Set([
      ...Object.keys(stored.cells ?? {}),
      ...Object.keys(incoming.cells ?? {}),
    ]);
    for (const ref of [...refs].sort()) {
      if (!isReadOnly(stored, ref)) continue;
      if (writtenContent(stored, ref) === writtenContent(incoming, ref)) continue;
      violations.push({
        sheet: sheetName,
        cell: ref,
        message: `${sheetName}!${ref} está protegida por la plantilla y no se puede modificar`,
      });
    }
  }

  return violations;
};
