## Context

Los ítems fantasma se mantienen hoy en hojas de Excel externas al sistema. Se necesita traerlos a la plataforma para migrar desde el sistema anterior, con tres restricciones que vienen del entorno actual:

- **project-back** es NestJS 10 + TypeORM 0.3 sobre **SQL Server** (`mssql`). Las convenciones del repo son: entidades con `created_at` / `updated_at` / `deleted_at`, columnas en `snake_case`, DTOs con `class-validator` a través de `ValidationPipe`, guards globales `JwtAuthGuard` + `RolesGuard`, y migraciones SQL escritas a mano en `src/db/migrations/`. `multer` ya está instalado (lo usa el módulo `norm`), pero **no hay ninguna librería de XLSX**.
- **project-admin** es React 19 + Vite 7 + TypeScript, con Wouter, Zustand, TanStack Query, Tailwind 4, Sonner y axios. Ya existe el patrón completo de CRUD con el módulo `bill-of-materials` (`BomListPage`, `BomEditorPage`, `bomService`, `@/types/bom.types`). **No tiene ninguna grilla ni motor de fórmulas.**
- **project-front** tiene el motor de fórmulas ya probado en producción, pero **acoplado**: `SpreadSheet.tsx` son 7.305 líneas donde `evaluateFormula` es un `useCallback` interno mezclado con estado de UI, hojas múltiples, estilos, catálogos de ítems y gráficos. Lo único razonablemente aislado es `src/hooks/useDepGraph.ts` (293 líneas), que ya extrae precedentes, expande rangos y calcula orden topológico.

La decisión de producto ya tomada con el usuario: **modelo cabecera + componentes**, **grid con fórmulas por celda** (no hoja libre) y **módulo independiente** (sin tocar `bill-of-materials` ni `project-front`).

Nota de alcance: los artefactos de planeación viven en `project-back/openspec/`, pero la implementación abarca también `project-admin`, que es un repositorio hermano.

## Goals / Non-Goals

**Goals:**

- Persistir fantasmas como datos consultables y validados, no como celdas sueltas.
- Reproducir en el administrador la experiencia de Excel que los usuarios ya tienen: escribir `=P3/O3` en una celda y ver el resultado propagarse.
- Migrar los archivos existentes en un paso, con reporte de errores por fila en lugar de un "falló el archivo".
- Dejar el motor de fórmulas como módulo autónomo y testeado, reutilizable por futuras pantallas del admin.
- No romper nada de lo existente: cero cambios en tablas, endpoints ni componentes actuales.

**Non-Goals:**

- Hoja de cálculo libre (celdas arbitrarias, múltiples hojas, estilos, merges, rangos con nombre, gráficos `DRAW:`). La grilla se limita a las columnas del modelo.
- Fórmulas entre distintos fantasmas o entre hojas (`Sheet1!A1`). El alcance de referencias es la grilla del fantasma abierto.
- Evaluación de fórmulas en el backend. El backend recibe valores ya calculados y las fórmulas como texto; solo recalcula las reglas por defecto de los campos derivados.
- Integración con `bill_of_materials` o con el diseñador de `project-front`. Se deja el modelo preparado, pero fuera de este cambio.
- Refactorizar `SpreadSheet.tsx` en project-front. Se usa como referencia, se copia lo necesario; ese archivo no se toca.

## Decisions

### 1. Dos tablas: `phantom_item` + `phantom_item_component`

El Excel es plano y repite la cabecera en cada fila (en el archivo real, 9 y 15 filas repiten los mismos 12 campos). Normalizar elimina esa redundancia, hace que `itemCode` sea un identificador de negocio real y calza con el patrón ya usado en `bill_of_materials` / `bill_of_materials_node`.

```
phantom_item
  id, finished_product_type, work_in_process_type, phantom_root_code, kva_rating_standard,
  item_code (único entre no eliminados), reference, item_description, short_description, unit_of_measure,
  formula_overrides (nvarchar max, JSON), created_at, updated_at, deleted_at

phantom_item_component
  id, phantom_item_id (FK), sort_order,
  component_item_code, description, base_quantity, required_quantity, required_quantity_per_unit,
  unit_of_measure, waste_percentage, consumption_warehouse,
  formula_overrides (nvarchar max, JSON), created_at, updated_at, deleted_at
```

*Alternativa descartada*: tabla plana 1:1 con el Excel. Import/export trivial, pero permite que dos filas del mismo ítem tengan cabeceras distintas y obliga a agrupar en cada lectura.

**Tipos en SQL Server**: las cantidades usan `decimal(18,6)` — `required_quantity_per_unit` necesita al menos 4 decimales (`0.0987`) y el margen permite divisiones más finas. `waste_percentage` se guarda como `decimal(5,4)` en fracción (`0%` → `0.0000`), y la UI lo formatea como porcentaje. Los textos usan `nvarchar` con longitudes acotadas (`reference` 50, `short_description` 30) — un poco por encima de los límites de negocio (40 y 20) para que el rechazo lo haga la validación con un mensaje claro y no un truncamiento de la base.

**Las longitudes no se almacenan**: `referenceLength`, `itemDescriptionLength` y `shortDescriptionLength` se calculan en el DTO de salida. Guardarlas sería duplicar estado que se desincroniza.

Lo que sí se persiste es **qué columna mide cada una**: la fórmula `=LARGO(<campo>)` vive en el JSON `formulaOverrides` del registro, y el backend resuelve el nombre de campo (o la letra de columna de la plantilla) contra el mapa de columnas antes de medir. Por defecto miden `reference`, `itemDescription` y `shortDescription` respectivamente, pero un registro puede apuntarlas a otra columna sin cambiar el esquema. Un campo desconocido en la fórmula es un error de validación, no un `0` silencioso.

**El límite de `referenceLength` es del registro, no del sistema**: la columna `reference_length_limit` (`int`, default 40, solo admite 40 o 50) determina contra qué se valida. `itemDescriptionLength` y `shortDescriptionLength` conservan sus límites fijos de 40 y 20.

### 2. Campos derivados: se calculan en el backend, pero la fórmula es sobreescribible

Los campos derivados tienen una regla por defecto que el backend aplica al guardar. Además, cada registro lleva una columna JSON `formulaOverrides` que, cuando trae una entrada para un campo, indica que el usuario escribió su propia expresión; en ese caso el backend **respeta el valor enviado por el cliente** y solo persiste la fórmula como texto.

```ts
// pseudo, en PhantomItemService
const reference = f.formulaOverrides?.reference
  ? dto.reference                              // el grid ya lo calculó
  : `F-${finishedProductType}-${workInProcessType}-${phantomRootCode}${kvaRatingStandard}`;
```

*Por qué así*: mantiene la integridad de los datos cuando entran por API o por importación (donde no hay grid que evalúe), y a la vez permite el caso real que se ve en los archivos, donde una fila concreta se sale de la regla. Meter un evaluador de fórmulas en el backend sería duplicar el motor y mantener dos implementaciones que deben coincidir.

**Sobre la regla de `reference`**: en la plantilla de `KIT EMBLE` el campo *R kVA + Norma* vale `-GY-GENERICO-AD-AZ` (con guion propio) y la referencia resulta `F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ` (37 caracteres, coincide con la columna *Largo 40/50*). En la de `KIT ENCU` vale `43_3/4_4H_125` y la referencia es `F-3CV-EEN-KIT ENCU 43_3/4_4H_125` (32, también coincide) — es decir, con un espacio delante. La lectura consistente es que **el separador viaja dentro del propio campo** `kvaRatingStandard` y la concatenación es directa, sin separador implícito. Esa es la regla por defecto adoptada; como es exactamente el punto donde las plantillas divergen, la fórmula es sobreescribible por registro y la importación conserva la `Referencia` del archivo cuando difiere de la calculada, registrando una advertencia.

### 3. `exceljs` para leer y escribir XLSX

Se necesita **leer y escribir**. `exceljs` cubre ambos y tiene tipos TypeScript, a diferencia de `xlsx`/SheetJS, cuya distribución en npm ha sido problemática.

**La lectura NO usa el `WorkbookReader` de streaming.** Se intentó primero, porque era la razón de elegir la librería, pero exceljs 4.4 tiene un bug que lo hace inservible aquí: en `workbook-reader.js`, `_parseWorksheet` accede a `this.model.sheets` sin haber parseado todavía `xl/workbook.xml`, y toma esa ruta apenas tiene `sharedStrings` y `workbookRels`. Cualquier archivo con texto — es decir, todos los nuestros — falla con `Cannot read properties of undefined (reading 'sheets')`. Medido: 20 de 20 intentos con contenido representativo.

Se usa entonces `workbook.xlsx.readFile()`, que carga la hoja completa en memoria. El límite de 10 MB del endpoint es lo que acota el costo; la prueba de volumen procesa 5.000 filas sin problema. Si en producción aparecen archivos mayores, la salida no es volver al streaming de esta librería sino mover la importación a un job asíncrono.

**Detección de encabezados**: la plantilla real tiene los límites (40, 40, 20) en la fila 1 y los encabezados en la fila 2, pero eso no es garantía. Se escanean las primeras ~10 filas buscando la que contenga las etiquetas conocidas normalizadas (sin acentos, sin espacios extra, en minúsculas) y se construye un mapa `label → column index`. Así el orden de columnas puede variar sin romper la importación.

**Procesamiento por lotes**: las filas se agrupan por `itemCode`; cada grupo se escribe en su propia transacción (`dataSource.transaction`), y los errores se acumulan en un arreglo de reporte en vez de abortar. Así un fallo no deja un fantasma con componentes parciales. Dentro de cada grupo, los `insert` van en lotes de 100 filas, porque SQL Server limita a 2.100 parámetros por sentencia.

*Alternativa descartada*: importar en una sola transacción global. Con miles de filas, un solo error obligaría a rehacer todo el archivo, que es justo el problema que hoy tienen los usuarios.

### 4. Grid: implementación propia sobre `<table>`, no una librería

Las alternativas (AG Grid, Handsontable, Luckysheet) traen licencias comerciales para las funciones de fórmulas, o pesan más que todo el bundle actual del admin. Además, la lógica que hace falta ya existe y está probada en project-front; el trabajo real es extraerla, no escribirla.

Estructura en `project-admin/src/`:

```
lib/formula/
  cellRef.ts        # A1 <-> {row,col}, expansión de rangos   (nuevo, ~80 líneas)
  depGraph.ts       # precedentes/dependientes, orden topológico
                    # (portado de project-front/src/hooks/useDepGraph.ts, sin React)
  evaluate.ts       # evaluación de una expresión contra un mapa de celdas
                    # (extraído de evaluateFormula en SpreadSheet.tsx)
  functions.ts      # SUMA/SUM, PROMEDIO, LARGO, SI, REDONDEAR, CONCATENAR, IZQUIERDA, DERECHA
  index.ts
components/phantom-item/
  PhantomItemGrid.tsx        # tabla, selección, teclado, copiar/pegar
  PhantomItemGridCell.tsx
  FormulaBar.tsx
  PhantomItemHeaderForm.tsx
  PhantomItemImportModal.tsx
hooks/
  usePhantomItemGrid.ts      # estado de la grilla + recálculo, une lib/formula con el modelo
```

`lib/formula/` **no importa React**: es TypeScript puro, testeable con Vitest sin montar componentes. La capa React vive únicamente en `usePhantomItemGrid`.

**Evaluación de expresiones**: se preprocesan las funciones nombradas y las referencias de celda a valores literales, y la expresión aritmética resultante se evalúa con un parser propio pequeño (shunting-yard sobre `+ - * / ^ & ( )` y comparadores). project-front usa `Function("use strict"; return ...)` para este paso; **no se replica** — el contenido viene de un `.xlsx` subido por el usuario y evaluarlo como JavaScript es una vía de ejecución arbitraria en el navegador de quien administra. `mathjs` (que ya usa project-front) no se agrega como dependencia: no maneja el operador `&` de concatenación de Excel y arrastra ~600 KB para un conjunto de operadores que cabe en ~150 líneas.

**Mapeo columna ↔ campo**: la grilla trabaja internamente con referencias `A1` para que las fórmulas se escriban como en Excel, sobre una tabla de mapeo declarativa:

```ts
const COLUMNS = [
  { letter: "A", field: "finishedProductType",        scope: "header",    kind: "text" },
  // ...
  { letter: "G", field: "referenceLength",     scope: "derived",   kind: "length", limit: 40 },
  { letter: "O", field: "baseQuantity",      scope: "component", kind: "number" },
  { letter: "Q", field: "requiredQuantityPerUnit", scope: "component", kind: "number",
    defaultFormula: (row) => `=P${row}/O${row}` },
];
```

Las columnas de cabecera (A–L) se muestran en las filas de componentes con el mismo valor repetido, igual que en el Excel original, pero se editan una sola vez (editar la celda de cabecera en cualquier fila actualiza la cabecera del fantasma). Esto conserva la vista familiar sin permitir cabeceras inconsistentes.

**Recálculo**: al cambiar una celda se consulta `dependents` del grafo, se calcula el orden topológico del subgrafo afectado y se reevalúa solo eso. Los ciclos se detectan durante el orden topológico y se marcan `#CIRCULAR` en lugar de recursar.

### 5. Un solo endpoint de guardado para el editor

`PUT /phantom-items/:id` recibe cabecera + lista completa de componentes y reemplaza la lista. El grid es un editor de documento completo, no de campos sueltos: guardar cada celda por separado generaría decenas de peticiones y estados intermedios inválidos (por ejemplo, longitudes fuera de límite a mitad de edición).

Los endpoints por componente (`POST/PUT/DELETE /phantom-items/components/...`) existen igual para consumo por API y para el formulario simple, pero el grid no los usa.

**Reemplazo de componentes**: en la edición, los componentes previos se marcan eliminados y se insertan los nuevos dentro de una transacción. Es más simple y predecible que un diff por id, y el volumen por fantasma (decenas de filas) lo hace irrelevante en costo.

### 6. Roles

Lectura para `ADMIN`, `DESIGN` y `NORM` (igual que `semi-finished`); escritura, importación y borrado solo `ADMIN` (igual que `design-code-rules`). El guard `RolesGuard` global ya aplica el decorador `@Roles` por método.

## Risks / Trade-offs

- **La regla de concatenación de `reference` puede no ser universal** (las dos plantillas vistas difieren en el separador) → La fórmula es sobreescribible por registro; la importación conserva la `Referencia` del archivo cuando no coincide con la calculada y emite una advertencia en lugar de sobreescribir datos reales.
- **El motor de fórmulas propio no cubre todo Excel** — sin `BUSCARV`, sin referencias entre hojas, sin funciones de fecha → El alcance acordado son fórmulas dentro de una fila/columna de la misma grilla. El conjunto de funciones es extensible en `functions.ts`; si aparece necesidad de `BUSCARV`, se agrega ahí sin tocar el resto.
- **Duplicar la lógica de derivación en front y back** (el grid evalúa, el backend recalcula) → Los casos por defecto se cubren con pruebas en ambos lados usando los mismos ejemplos de las plantillas reales (`0.0987`, `37`, `18`); cuando el usuario sobreescribe la fórmula, el backend deja de recalcular y no hay dos fuentes de verdad compitiendo.
- **Importaciones grandes pueden exceder el timeout HTTP** → Se procesa en streaming por lotes y se acota a 10 MB / ~10.000 filas. Si en producción los archivos resultan mayores, la evolución natural es un job asíncrono con endpoint de estado; no se construye ahora por no ser necesario para el volumen conocido.
- **Los decimales llegan con formato regional** (`100,00`, `0,0987`, `0%`) → El parser de importación normaliza coma decimal, separadores de miles y el sufijo `%` antes de convertir; hay casos de prueba explícitos para cada formato.
- **`nvarchar(max)` para `formulaOverrides` no es consultable** → No se necesita: las fórmulas nunca se filtran ni se ordenan, solo se leen junto con su registro.
- **Riesgo de reintroducir `Function()`/`eval` al portar código de project-front** → El evaluador se escribe con parser propio y se agrega una prueba que verifica que una expresión con sintaxis de JavaScript (por ejemplo `=fetch("...")`) devuelve `#ERROR` en vez de ejecutarse.

## Migration Plan

1. Migración de esquema: `CREATE TABLE phantom_item`, `CREATE TABLE phantom_item_component` con FK e índices sobre `itemCode` (filtrado por `deleted_at IS NULL`) y `phantom_item_id`. No toca tablas existentes; el rollback es `DROP TABLE` de ambas.
2. Desplegar el backend con el módulo registrado. Los endpoints son nuevos: no hay ruta existente afectada.
3. Desplegar el administrador con la sección Fantasmas.
4. Migración de datos: por cada archivo Excel, ejecutar la previsualización (`dryRun`), corregir las filas reportadas y luego confirmar la importación en modo `create`.
5. Verificación: exportar el catálogo importado y compararlo contra el archivo origen (mismo número de filas por ítem, mismas cantidades).

Rollback: como el módulo es autónomo, retirar la entrada del `Navbar` deja el resto del sistema intacto; revertir el esquema es soltar las dos tablas.

## Open Questions

- ¿El campo `Item` (código SAP de cabecera, ej. `500190`) lo asigna SAP y viene siempre en el archivo, o el sistema debe generarlo para fantasmas nuevos creados desde el administrador? El diseño actual asume que se ingresa manualmente y solo se valida su unicidad.
- ¿`BODEGA CONSUMO` (`PI01`, `ENC01`) y `U.M` (`MTS`, `UND`, `GLS`) deben validarse contra catálogos existentes en el sistema, o quedan como texto libre? Por ahora se tratan como texto libre acotado en longitud.
- ¿Existen fantasmas que contengan a otros fantasmas (anidamiento), o siempre son un nivel de cabecera + materiales? El modelo actual asume un solo nivel; soportar anidamiento requeriría una autorreferencia en `phantom_item_component`.
- ~~Confirmar el significado de la columna `Largo 40/50`.~~ **Resuelto**: el valor es la longitud del contenido de otra columna, expresada mediante una fórmula `=LARGO(<campo>)` configurable por registro, y el límite (40 o 50) se define por fantasma en `referenceLengthLimit`.
