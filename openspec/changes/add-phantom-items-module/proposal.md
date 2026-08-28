## Why

Los **ítems fantasma** (agrupaciones de materiales que no se almacenan pero se explotan en producción, ej. `KIT EMBLE`, `KIT ENCU`) hoy viven únicamente en hojas de Excel mantenidas a mano. No existen en el sistema: no hay tabla, ni API, ni administrador. Eso bloquea la migración desde el sistema anterior y obliga a mantener la información duplicada y sin validación.

Estructuralmente un fantasma es casi idéntico a un semi-elaborado (una cabecera con su código SAP + N materiales componentes), pero con campos adicionales propios (Tipo PT/PP, Raíz Fantasma, largos de descripción, % desperdicio, bodega de consumo) y con varias columnas **calculadas a partir de otras celdas**, tal como en el Excel original.

## What Changes

- **Nuevo módulo `phantom-item` en project-back** (NestJS + TypeORM + MSSQL) con dos entidades:
  - `phantom_item` (cabecera): Tipo PT, Tipo PP, Raíz Fantasma, R kVA + Norma/Otros, Ítem (código SAP), Referencia, Desc. ítem, Desc. corta, UM.
  - `phantom_item_component` (líneas): Ítem-Componente, Descripción, Cant. base, Cant. requerida, Cant. requerida unitaria, U.M, % desperdicio, Bodega consumo.
- **API REST completa**: listado paginado con filtros, detalle con componentes, crear/editar/eliminar (soft delete) de fantasmas y de componentes, y validación de unicidad del ítem SAP.
- **Campos derivados con fórmulas**: Referencia, Largo 40/50, Largo 40, Largo 20, Desc. corta y Cant. requerida unitaria se calculan a partir de otras celdas. Se persiste tanto el **valor** como la **fórmula** de cada campo derivado, permitiendo sobreescribir la fórmula por registro sin perder el valor calculado.
- **Importación desde Excel**: endpoint que recibe un `.xlsx` con exactamente las columnas de la plantilla actual (A–T), lo valida fila por fila, agrupa las filas por ítem de cabecera y crea/actualiza los fantasmas. Devuelve un reporte de errores por fila sin abortar el archivo completo. Incluye un modo *dry-run* de previsualización.
- **Exportación a Excel**: descarga del catálogo (o de una selección) en el mismo formato plano de la plantilla, para viaje de ida y vuelta.
- **Nueva sección "Fantasmas" en project-admin**: listado, formulario de cabecera y un **editor de grilla tipo Excel** sobre los componentes, con barra de fórmulas, referencias entre celdas (`=P3/O3`, `=LARGO(F3)`, `=E3&"-"&F3`), recálculo por grafo de dependencias, copiar/pegar de rangos y flujo de importación/exportación.
- **Motor de fórmulas reutilizable**: se extrae de `project-front` (`SpreadSheet.tsx`, `useDepGraph.ts`) el núcleo de evaluación de fórmulas y grafo de dependencias hacia un módulo independiente y testeable que consume el nuevo grid del admin.

No hay cambios destructivos: el módulo es autónomo y no toca `bill-of-materials`, `semi-finished` ni el diseñador de `project-front`.

## Capabilities

### New Capabilities

- `phantom-item-catalog`: Modelo de datos de fantasmas (cabecera + componentes), reglas de los campos derivados y sus límites de longitud, y API REST de consulta y administración.
- `phantom-item-excel-io`: Importación de fantasmas desde archivos `.xlsx` con la estructura de la plantilla actual (validación, agrupación, reporte de errores por fila, previsualización) y exportación al mismo formato.
- `phantom-item-grid-editor`: Administrador de fantasmas en project-admin con grilla tipo hoja de cálculo: edición por celda, barra de fórmulas, referencias entre celdas, recálculo por dependencias, y fórmulas por defecto para las columnas derivadas.

### Modified Capabilities

Ninguna. `openspec/specs/` está vacío y este cambio no altera requisitos de módulos existentes.

## Impact

**project-back** (`/Users/alex.pinaida/Resplados/Code/Rymel/project-back`)
- Nuevo `src/modules/phantom-item/` (módulo, controlador, servicios, entidades, DTOs, enums).
- Nueva migración en `src/db/migrations/` para `phantom_item` y `phantom_item_component`.
- Registro del módulo en `src/app.module.ts`.
- Nueva dependencia de parseo/escritura de XLSX (`exceljs`). `multer` ya está instalado y en uso en el módulo `norm`.
- Sin cambios en tablas ni endpoints existentes.

**project-admin** (`/Users/alex.pinaida/Resplados/Code/Rymel/project-admin`)
- Nuevas páginas `PhantomItemListPage` / `PhantomItemEditorPage`, componentes de grilla y modales, `phantomItemService`, tipos y rutas en `App.tsx` + `Navbar`.
- Nuevo módulo interno de motor de fórmulas (portado desde project-front).
- Sin dependencias externas nuevas obligatorias; el grid se implementa con los componentes propios del proyecto.

**project-front**
- Sin cambios. Sirve solo como fuente de referencia del motor de fórmulas.

**Riesgos**
- La convención exacta de separadores al construir `Referencia` depende de cómo venga el campo *R kVA + Norma / Otros* en cada plantilla (en un archivo trae guion inicial, en otro espacio). Se mitiga haciendo la fórmula editable y sobreescribible por registro.
- Los archivos de migración reales contienen miles de filas; la importación debe procesarse por lotes para no agotar memoria ni el timeout de la petición.
