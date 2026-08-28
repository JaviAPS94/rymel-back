## 1. Backend — Esquema y entidades

- [x] 1.1 Crear `src/modules/phantom-item/entities/phantom-item.entity.ts` con `finishedProductType`, `workInProcessType`, `phantomRootCode`, `kvaRatingStandard`, `itemCode`, `reference`, `itemDescription`, `shortDescription`, `unitOfMeasure`, `referenceLengthLimit` (int, default 40), `formulaOverrides` (nvarchar max) y los timestamps `created_at` / `updated_at` / `deleted_at`
- [x] 1.2 Crear `src/modules/phantom-item/entities/phantom-item-component.entity.ts` con `phantomItemId` (ManyToOne), `sortOrder`, `componentItemCode`, `description`, `baseQuantity`, `requiredQuantity`, `requiredQuantityPerUnit`, `unitOfMeasure`, `wastePercentage`, `consumptionWarehouse`, `formulaOverrides` y timestamps
- [x] 1.3 Escribir la migración `src/db/migrations/<ts>-phantom-item.ts` creando ambas tablas con `decimal(18,6)` para cantidades, `decimal(5,4)` para desperdicio, FK `phantom_item_component.phantom_item_id → phantom_item.id`, índice filtrado único sobre `itemCode` (`WHERE deleted_at IS NULL`) e índice sobre `phantom_item_id`, con su `down()` que hace `DROP TABLE` de ambas
- [x] 1.4 Ejecutar `npm run migration:run` y verificar que ambas tablas se crean y que `down()` revierte limpio

## 2. Backend — Derivación y validación

- [x] 2.1 Crear `src/modules/phantom-item/utils/derived-fields.ts` con las reglas por defecto: `reference`, `itemDescription`, `shortDescription` y `requiredQuantityPerUnit` (retornando nulo cuando `baseQuantity` es 0)
- [x] 2.2 Implementar el resolver de `=LARGO(<campo>)`, aceptando nombre de campo o letra de columna, con las fuentes por defecto `reference` / `itemDescription` / `shortDescription` y error de validación si el campo no existe
- [x] 2.3 Implementar la validación de límites: `itemDescriptionLength` ≤ 40, `shortDescriptionLength` ≤ 20 y `referenceLength` ≤ `referenceLengthLimit` (40 o 50), devolviendo `400` con campo, longitud obtenida y límite aplicado
- [x] 2.4 Implementar la resolución de fórmulas sobreescritas: si `formulaOverrides[field]` existe se respeta el valor del cliente, si no se aplica la regla por defecto
- [x] 2.5 Escribir `derived-fields.spec.ts` con los casos reales de las plantillas: `F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ` → 37, `FANTASMA KIT EMBLE` → 18, `9.87 / 100` → `0.0987`, `baseQuantity = 0` → nulo

## 3. Backend — DTOs y servicio CRUD

- [x] 3.1 Crear los DTOs de entrada (`create-phantom-item.dto.ts`, `update-phantom-item.dto.ts`, `create-phantom-item-component.dto.ts`, `update-phantom-item-component.dto.ts`, `phantom-items-filters-paginated.dto.ts`) con decoradores de `class-validator`
- [x] 3.2 Crear los DTOs de salida (`phantom-item-output.dto.ts`, `phantom-item-detail-output.dto.ts`, `phantom-item-component-output.dto.ts`) con `@ApiProperty`, incluyendo los largos calculados
- [x] 3.3 Implementar `PhantomItemService.findAllPaginated` con `page`, `limit`, `search` (sobre `itemCode`, `reference`, `shortDescription`), `finishedProductType`, `workInProcessType`, `phantomRootCode` y el conteo de componentes
- [x] 3.4 Implementar `PhantomItemService.findOne` devolviendo la cabecera con sus componentes ordenados por `sortOrder`, y `404` si no existe o está eliminado
- [x] 3.5 Implementar `create` con validación de unicidad de `itemCode` (`409` si duplicado entre no eliminados) y creación de componentes en transacción
- [x] 3.6 Implementar `update` reemplazando la lista completa de componentes dentro de una transacción
- [x] 3.7 Implementar `remove` con borrado lógico en cascada sobre los componentes
- [x] 3.8 Implementar `addComponent`, `updateComponent` y `removeComponent`, asignando el siguiente `sortOrder` disponible al agregar

## 4. Backend — Controlador y registro del módulo

- [x] 4.1 Crear `phantom-item.controller.ts` con `GET /phantom-items`, `GET /phantom-items/:id`, `POST /phantom-items`, `PUT /phantom-items/:id`, `DELETE /phantom-items/:id`
- [x] 4.2 Agregar los endpoints de componentes: `POST /phantom-items/:id/components`, `PUT /phantom-items/components/:componentId`, `DELETE /phantom-items/components/:componentId`
- [x] 4.3 Aplicar `@Roles(ADMIN, DESIGN, NORM)` a los `GET` y `@Roles(ADMIN)` a escritura, borrado e importación
- [x] 4.4 Crear `phantom-item.module.ts` con `TypeOrmModule.forFeature` y registrarlo en `src/app.module.ts`
- [x] 4.5 Verificar los endpoints en Swagger y probar el flujo completo crear → listar → editar → borrar

## 5. Backend — Importación desde Excel

- [x] 5.1 Instalar `exceljs` y agregarlo a `package.json`
- [x] 5.2 Crear `utils/xlsx-header-mapper.ts` que escanee las primeras 10 filas, normalice las etiquetas (sin acentos, minúsculas, sin espacios extra) y devuelva el mapa `field → column index`; rechazar con `400` si faltan columnas obligatorias
- [x] 5.3 Crear `utils/parse-locale-number.ts` que normalice coma decimal, separador de miles y sufijo `%`, con pruebas para `100,00`, `0,0987`, `0%`, `1.234,56` y valores no numéricos
- [x] 5.4 Implementar `PhantomItemImportService.parse` agrupando filas consecutivas por `Item` y tomando la cabecera de la primera fila del grupo (lectura no-streaming: ver design.md, decisión 3)
- [x] 5.5 Implementar la validación por fila acumulando errores (fila, columna, motivo) sin abortar el archivo, y advertencias por cabecera inconsistente dentro de un grupo o `Referencia` distinta de la calculada
- [x] 5.6 Implementar la escritura por lotes con una transacción por grupo, y los modos `create` (conflicto → omitido) y `upsert` (reemplaza componentes)
- [x] 5.7 Implementar el modo `dryRun` que devuelve el mismo reporte sin escribir en base
- [x] 5.8 Crear `POST /phantom-items/import` con `FileInterceptor`, filtro de extensión `.xlsx` y límite de 10 MB, devolviendo `{ created, updated, skipped, errors[], warnings[] }`
- [x] 5.9 Escribir `phantom-item-import.service.spec.ts` cubriendo: agrupación de 5 filas en 1 fantasma, dos ítems en un archivo, fila con cantidad no numérica, fila sin `Item`, y `dryRun` sin efectos

## 6. Backend — Exportación a Excel

- [x] 6.1 Implementar `PhantomItemExportService.export` generando el `.xlsx` plano con las columnas A–T, repitiendo la cabecera en cada fila de su grupo
- [x] 6.2 Crear `GET /phantom-items/export` aceptando los mismos filtros del listado y una lista opcional de ids
- [x] 6.3 Crear `GET /phantom-items/template` que devuelva la plantilla vacía con encabezados y la fila de límites (40, 40, 20)
- [x] 6.4 Probar el viaje de ida y vuelta: exportar → reimportar en modo `upsert` → verificar que el catálogo queda equivalente

## 7. Admin — Motor de fórmulas

- [x] 7.1 Crear `src/lib/formula/cellRef.ts` con conversión `A1 ↔ {row, col}`, etiquetas de columna y expansión de rangos (`P3:P10`)
- [x] 7.2 Portar `project-front/src/hooks/useDepGraph.ts` a `src/lib/formula/depGraph.ts` como TypeScript puro sin React, conservando extracción de precedentes, mapa inverso de dependientes y orden topológico
- [x] 7.3 Crear `src/lib/formula/functions.ts` con `SUMA`/`SUM`, `PROMEDIO`/`AVERAGE`, `LARGO`/`LEN`, `SI`/`IF`, `REDONDEAR`/`ROUND`, `CONCATENAR`/`CONCAT`, `IZQUIERDA`/`LEFT`, `DERECHA`/`RIGHT`
- [x] 7.4 Crear `src/lib/formula/evaluate.ts` con parser shunting-yard sobre `+ - * / ^ & ( )` y comparadores, resolviendo referencias contra un mapa de celdas — sin usar `eval` ni `Function()`
- [x] 7.5 Devolver `#ERROR` en expresiones inválidas y `#CIRCULAR` en ciclos detectados durante el orden topológico
- [x] 7.6 Instalar Vitest y escribir `lib/formula/*.spec.ts`: `=P3/O3` → `0.0987`, `="F-"&A3&"-"&B3` → `F-1CA-TPI`, `=LARGO(F3)` → `37`, `=SUMA(P3:P7)`, propagación en cascada, ciclo → `#CIRCULAR`, `=P3/` → `#ERROR`, y `=fetch("...")` → `#ERROR` (no se ejecuta)

## 8. Admin — Tipos, servicio y rutas

- [x] 8.1 Crear `src/types/phantom-item.types.ts` con `PhantomItem`, `PhantomItemComponent`, `PhantomItemListResponse`, DTOs de creación/edición y el tipo del reporte de importación
- [x] 8.2 Crear `src/services/phantomItemService.ts` siguiendo el patrón de `bomService`: listado paginado, detalle, crear, editar, borrar, importar (multipart), previsualizar, exportar y descargar plantilla
- [x] 8.3 Definir la tabla de mapeo `COLUMNS` (letra ↔ campo ↔ scope `header`/`component`/`derived`, tipo, límite y fórmula por defecto) en `src/components/phantom-item/columns.ts`
- [x] 8.4 Registrar las rutas `/phantom-items` y `/phantom-items/:id` en `App.tsx` dentro de `ProtectedRoute` y agregar la entrada al `Navbar`

## 9. Admin — Listado

- [x] 9.1 Crear `src/pages/PhantomItemListPage.tsx` con tabla de `itemCode`, `reference`, `shortDescription`, `finishedProductType`, `workInProcessType`, `phantomRootCode` y número de componentes, usando TanStack Query
- [x] 9.2 Agregar paginación, buscador por texto (reiniciando a la página 1) y filtros por tipo y raíz
- [x] 9.3 Agregar las acciones crear, importar, exportar y descargar plantilla, deshabilitadas para usuarios sin rol `ADMIN`
- [x] 9.4 Navegar a `/phantom-items/:id` al hacer clic en una fila

## 10. Admin — Grilla con fórmulas

- [x] 10.1 Crear `src/hooks/usePhantomItemGrid.ts` que mantenga el estado de celdas, construya el grafo de dependencias y recalcule solo el subgrafo afectado al editar
- [x] 10.2 Crear `PhantomItemGrid.tsx` con encabezados A, B, C…, numeración de filas y celdas renderizadas desde el mapeo `COLUMNS`
- [x] 10.3 Implementar selección de celda, navegación con flechas / `Tab` / `Enter`, edición en celda y cancelación con `Escape`
- [x] 10.4 Implementar selección de rango con `Shift` + flechas y arrastre
- [x] 10.5 Crear `FormulaBar.tsx` mostrando la referencia de la celda y su fórmula o valor literal, aplicando los cambios a la celda seleccionada
- [x] 10.6 Preinsertar las fórmulas por defecto de las columnas derivadas al agregar filas y al cargar datos, con acción para restaurar la fórmula de una celda sobreescrita
- [x] 10.7 Renderizar las columnas de cabecera repetidas en cada fila, editables una sola vez (editar en cualquier fila actualiza la cabecera)
- [x] 10.8 Renderizar las columnas de longitud como solo lectura, resaltadas en rojo al superar su límite
- [x] 10.9 Implementar agregar y eliminar filas manteniendo el `sortOrder` consistente
- [x] 10.10 Implementar copiar/pegar (`Ctrl/Cmd+C` / `Ctrl/Cmd+V`) de rangos, incluyendo pegado de contenido tabulado desde Excel creando las filas faltantes

## 11. Admin — Editor y guardado

- [x] 11.1 Crear `src/pages/PhantomItemEditorPage.tsx` integrando `PhantomItemHeaderForm`, `FormulaBar` y `PhantomItemGrid`
- [x] 11.2 Implementar el guardado explícito enviando cabecera + lista completa de componentes con sus fórmulas vía `PUT /phantom-items/:id`
- [x] 11.3 Mostrar el indicador de cambios sin guardar y pedir confirmación antes de abandonar la página con cambios pendientes
- [x] 11.4 Mostrar los errores de validación del backend indicando el campo afectado, conservando los cambios en la grilla
- [x] 11.5 Advertir en el botón de guardar cuando existan filas con longitudes fuera de límite
- [x] 11.6 Implementar la creación de un fantasma nuevo desde el editor (cabecera vacía + grilla vacía)

## 12. Admin — Importación

- [x] 12.1 Crear `PhantomItemImportModal.tsx` con selección de archivo `.xlsx`, elección de modo (`create` / `upsert`) y botón de previsualizar
- [x] 12.2 Mostrar el reporte de la previsualización: fantasmas a crear y actualizar, y tabla de errores con número de fila, columna y motivo
- [x] 12.3 Deshabilitar la confirmación cuando el backend reporta columnas obligatorias faltantes, indicando cuáles
- [x] 12.4 Ejecutar la importación real al confirmar, notificar con Sonner y refrescar el listado
- [x] 12.5 Implementar la descarga del export con los filtros activos y la descarga de la plantilla vacía

## 13. Verificación

- [x] 13.1 Ejecutar `npm test` en project-back y confirmar que pasan las pruebas de derivación, importación y números con formato regional
- [x] 13.2 Ejecutar las pruebas del motor de fórmulas en project-admin
- [x] 13.3 Ejecutar `npm run lint` y `npm run build` en ambos proyectos
- [ ] 13.4 Probar de extremo a extremo con un archivo real: previsualizar, importar, editar en la grilla con fórmulas, guardar, exportar y comparar contra el origen — pendiente: requiere verificación manual en navegador (no disponible en esta sesión) con un archivo real
