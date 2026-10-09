/**
 * Values of a process's own columns, stored as JSON `{ key: text }` on the
 * phantom item (header-scoped) or on each component (line-scoped).
 */
export type ExtraValues = Record<string, string>;

/** Keeps only non-empty text values, so an empty column doesn't take space */
export const cleanExtraValues = (values: unknown): ExtraValues => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const clean: ExtraValues = {};
  for (const [key, value] of Object.entries(
    values as Record<string, unknown>,
  )) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text !== '') clean[key] = text;
  }
  return clean;
};

export const serializeExtraValues = (values: unknown): string | null => {
  const clean = cleanExtraValues(values);
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
};

export const parseExtraValues = (
  raw: string | null | undefined,
): ExtraValues => {
  if (!raw) return {};
  try {
    return cleanExtraValues(JSON.parse(raw));
  } catch {
    return {};
  }
};
