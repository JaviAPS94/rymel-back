/**
 * La regla con la que una referencia ERP encuentra su estructura BOM: la
 * estructura cuyo código es prefijo de la referencia, entre las no borradas.
 *
 * Es SQL a propósito. La usan la búsqueda por código y el listado de revisión
 * del admin, y si una la resolviera en SQL y otra en JavaScript podrían
 * discrepar en mayúsculas o en comodines (`LIKE` no distingue mayúsculas con
 * la intercalación de la base, y `startsWith` sí).
 *
 * @param bomAlias alias de la tabla `bill_of_materials` en la consulta
 * @param referenceSql expresión SQL con la referencia (`:code`, `e.sap_refence`…)
 */
export const bomMatchesReference = (
  bomAlias: string,
  referenceSql: string,
): string =>
  `${referenceSql} LIKE CONCAT(${bomAlias}.code, '%') AND ${bomAlias}.deleted_at IS NULL`;
