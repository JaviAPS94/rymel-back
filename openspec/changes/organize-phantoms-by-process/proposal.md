## Why

El negocio mantiene sus ítems fantasma en un libro de Excel organizado **por proceso de la planta**, una hoja por proceso. Hoy el módulo de fantasmas los trata como una sola lista plana: el importador lee solo la primera hoja, la exportación genera una sola hoja y no hay forma de ubicar un fantasma dentro de la planta. El cliente pidió, en la reunión del 2026-10-08, que se puedan organizar en N procesos con nombre, ampliables a futuro, y que agregar fantasmas después de la carga inicial no obligue a reimportar todo el libro.

Medido sobre el libro real que compartió (`ITEMS FANTASMA ALEX.xlsx`):

- **5 hojas visibles**, una por proceso —EMBLEMADO, ALISTAMIENTO Y ENCUBE, CANASTILLAS, METALMECANICA, ARMADO Y CONEXIÓN— más una oculta (SEF-SEH). **533 fantasmas y 5.235 líneas**; METALMECANICA sola tiene 208 fantasmas y 2.642 líneas. Ningún `Item` se repite entre hojas.
- La columna nueva **«Fantasma»** no es el fantasma: es una **familia** dentro del proceso (F. Emblemas, F. Acc Sol, F- Acc Con AT…), con 1 a 3 familias por proceso.
- **Las columnas cambian de un proceso a otro**: ALISTAMIENTO, CANASTILLAS y SEF-SEH llevan PLAN1/MAYOR1/PLAN2/MAYOR2; EMBLEMADO llama «CANT. REQUERIDA LMS» a la cantidad requerida y añade «CANT. REQUERIDA UNITARIA»; METALMECANICA llama «% DESP. LAMINA» al desperdicio. El modelo actual no admite PLAN/MAYOR y las descartaría en silencio.
- **METALMECANICA tiene dos columnas «Item»** y la primera está vacía. El importador se queda con la primera que encuentra (`xlsx-header-mapper.ts:80`): hoy importaría esa hoja como si no tuviera ningún fantasma.

Lo que ya funciona y se aprovecha: el importador reconoce las columnas por su encabezado y no por su letra, y en modo actualizar solo toca los fantasmas que trae el archivo, por su `Item`. Eso ya es, en parte, «importar solo el grupito nuevo».

## What Changes

**Procesos y familias**

- **Procesos** configurables por un administrador: nombre, orden, y crear, renombrar, reordenar y dar de baja si está vacío. Cada fantasma pertenece a un proceso.
- **Familias** dentro de cada proceso (la columna «Fantasma»). Un fantasma puede no tener familia.
- El listado del admin se organiza por proceso, como las hojas del libro, y filtra por familia además de los filtros actuales.

**Columnas configurables por proceso**

- Cada proceso define **qué columnas usa, en qué orden y con qué encabezado**, a partir del catálogo de columnas conocidas: así EMBLEMADO puede llamar «CANT. REQUERIDA LMS» a la cantidad requerida y METALMECANICA «% DESP. LAMINA» al desperdicio, sin perder el tipo ni las reglas del dato.
- Cada proceso puede añadir **columnas propias** de texto para lo que el catálogo no tiene —PLAN1, MAYOR1, PLAN2, MAYOR2 hoy, y lo que traigan procesos futuros—, guardadas con cada línea.
- La grilla, el importador y el exportador usan las columnas del proceso.

**Importación por libro, por proceso**

- Se importan **todas las hojas visibles** del libro: cada hoja va al proceso con su mismo nombre, y una hoja con un nombre nuevo propone crear el proceso con las columnas que trae. La previsualización lo muestra por proceso antes de escribir nada.
- Importar un libro con **solo algunos fantasmas** actualiza esos y conserva el resto: la vía para agregar un fantasma nuevo desde Excel sin reimportar todo.
- Con encabezados repetidos (el «Item» doble de METALMECANICA) se usa la columna que tiene datos.
- Las hojas ocultas se omiten y se informa. Las columnas que el proceso no usa —hoy «Estructura LM» y «Plantillas Diseño»— se informan como ignoradas.

**Otras vías para agregar fantasmas**

- **Pegar desde Excel** un bloque de filas en un proceso, con las columnas del proceso en su orden: pasa por la misma previsualización y validación que la importación.
- **Alta manual** en el editor, eligiendo proceso y familia (el editor ya existe; se adapta).
- **Exportar el libro completo**, una hoja por proceso con sus columnas, como respaldo; y exportar un solo proceso.

**Fuera de alcance**

- La relación de los fantasmas con las estructuras de lista de materiales y con las plantillas de diseño (columnas «Estructura LM» y «Plantillas Diseño»). El cliente la iba a explicar en la parte de la reunión que no llegó; queda para un change propio.
- La consulta al ERP SIESA para inscribir un ítem y traer su número. No hay integración ni documentación de su API en el sistema.

## Capabilities

### New Capabilities

- `phantom-item-processes`: procesos y familias, columnas configurables por proceso y su administración.
- `phantom-item-workbook-io`: importación del libro por proceso, pegado desde Excel y exportación del libro completo.

### Modified Capabilities

Las capacidades de fantasmas (`phantom-item-catalog`, `phantom-item-grid-editor`, `phantom-item-excel-io`) se definieron en `add-phantom-items-module`, que no está archivado. Este change las amplía con capacidades nuevas en lugar de modificar requisitos todavía no publicados en `openspec/specs/`; en particular, «Formato de la plantilla de importación» (primera hoja, columnas fijas) queda sustituido por la importación por libro. Conviene archivar aquel change antes que éste.

## Impact

- **`project-back`**: tablas `phantom_process`, `phantom_family` y `phantom_process_column`; `process_id` y `family_id` en `phantom_item`; columna `extra_values` (JSON) en `phantom_item_component` para las columnas propias. Migración que crea un proceso «General» para los fantasmas existentes (hoy 1, con 9 líneas). Importador y exportador por libro; endpoints de procesos, familias, columnas y pegado.
- **`project-admin`**: listado por proceso con pestañas y filtro de familia, administración de procesos y columnas, editor con proceso y familia y columnas del proceso, importación de libro con previsualización por proceso, pegado desde Excel y exportación del libro.
- **Datos**: carga inicial del libro real (533 fantasmas, 5.235 líneas) como verificación de extremo a extremo.
