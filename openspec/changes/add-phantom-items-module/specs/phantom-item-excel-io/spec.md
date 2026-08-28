## ADDED Requirements

### Requirement: Formato de la plantilla de importación

El sistema SHALL aceptar archivos `.xlsx` cuya primera hoja contenga las columnas de la plantilla actual de ítems fantasma, en este orden:

| Col | Encabezado | Destino |
| --- | --- | --- |
| A | Tipo PT | cabecera `finishedProductType` |
| B | Tipo PP | cabecera `workInProcessType` |
| C | Raíz Fantasma | cabecera `phantomRootCode` |
| D | R kVA + Norma / Otros | cabecera `kvaRatingStandard` |
| E | Item | cabecera `itemCode` |
| F | Referencia | cabecera `reference` (derivado) |
| G | Largo 40/50 | derivado, ignorado en lectura |
| H | Desc. item | cabecera `itemDescription` (derivado) |
| I | Largo 40 | derivado, ignorado en lectura |
| J | Desc. corta | cabecera `shortDescription` (derivado) |
| K | Largo 20 | derivado, ignorado en lectura |
| L | UM | cabecera `unitOfMeasure` |
| M | ÍTEM - COMPONENTE | componente `componentItemCode` |
| N | DESCRIPCIÓN | componente `description` |
| O | CANT. BASE | componente `baseQuantity` |
| P | CANT. REQUERIDA | componente `requiredQuantity` |
| Q | CANT. REQUERIDA UNITARIA | componente `requiredQuantityPerUnit` (derivado) |
| R | U.M | componente `unitOfMeasure` |
| S | % DESP. | componente `wastePercentage` |
| T | BODEGA CONSUMO | componente `consumptionWarehouse` |

El sistema SHALL localizar la fila de encabezados por el texto de sus celdas (no por número de fila fijo) y SHALL tratar todas las filas siguientes como datos.

#### Scenario: Encabezados en la segunda fila

- **WHEN** se importa un archivo cuya fila 1 contiene los límites (40, 40, 20) y la fila 2 los encabezados
- **THEN** el sistema detecta la fila 2 como encabezado y lee los datos desde la fila 3

#### Scenario: Columnas faltantes

- **WHEN** el archivo no contiene la columna `ÍTEM - COMPONENTE`
- **THEN** el sistema rechaza el archivo con `400 Bad Request` indicando las columnas requeridas ausentes
- **AND** no se crea ni modifica ningún registro

### Requirement: Agrupación de filas planas en fantasmas

El sistema SHALL agrupar las filas consecutivas que comparten el mismo valor de la columna `Item` en un único fantasma, tomando los campos de cabecera de la primera fila del grupo y creando un componente por cada fila del grupo.

#### Scenario: Cinco filas de un mismo ítem

- **WHEN** se importan 5 filas con `Item` = `500190`
- **THEN** se crea 1 fantasma con `itemCode` = `500190` y 5 componentes, en el orden en que aparecen las filas

#### Scenario: Varios ítems en un archivo

- **WHEN** se importan 9 filas del ítem `500452` seguidas de 15 filas del ítem `500453`
- **THEN** se crean 2 fantasmas, con 9 y 15 componentes respectivamente

#### Scenario: Cabecera inconsistente dentro de un grupo

- **WHEN** dos filas con el mismo `Item` traen distinto valor en `Raíz Fantasma`
- **THEN** el sistema registra una advertencia para esas filas indicando el conflicto
- **AND** conserva el valor de la primera fila del grupo

### Requirement: Validación por fila con reporte de errores

El sistema SHALL validar cada fila de forma independiente y SHALL continuar procesando el resto del archivo cuando una fila falla. La respuesta SHALL incluir el número de fantasmas creados, actualizados y omitidos, y una lista de errores con número de fila, columna y motivo.

Una fila SHALL considerarse inválida cuando falte `Item`, falte `ÍTEM - COMPONENTE`, `CANT. BASE` o `CANT. REQUERIDA` no sean numéricos, o los campos derivados excedan los límites de longitud definidos en `phantom-item-catalog`.

#### Scenario: Fila con cantidad no numérica

- **WHEN** una fila trae `CANT. BASE` = `N/A`
- **THEN** el resultado incluye un error para esa fila indicando la columna `CANT. BASE`
- **AND** las demás filas del archivo se importan normalmente

#### Scenario: Fila sin ítem de cabecera

- **WHEN** una fila tiene la columna `Item` vacía y no pertenece a un grupo previo
- **THEN** el resultado incluye un error para esa fila y la fila se omite

#### Scenario: Archivo completamente válido

- **WHEN** todas las filas son válidas
- **THEN** el resultado reporta `errors` vacío y el conteo de fantasmas creados

### Requirement: Previsualización de la importación

El sistema SHALL exponer un modo de previsualización (`dryRun`) que procese y valide el archivo completo devolviendo el mismo reporte que la importación real, **sin escribir en la base de datos**.

#### Scenario: Previsualización con errores

- **WHEN** se envía el archivo con `dryRun=true` y contiene 3 filas inválidas
- **THEN** el sistema devuelve el reporte con los 3 errores y el resumen de lo que se crearía
- **AND** la base de datos queda sin cambios

### Requirement: Estrategia de conflictos en la importación

El sistema SHALL aceptar un parámetro `mode` con los valores `create` (por defecto) y `upsert`.

En modo `create`, un `itemCode` que ya existe SHALL reportarse como omitido por conflicto. En modo `upsert`, el fantasma existente SHALL actualizarse con los datos del archivo y su lista de componentes SHALL reemplazarse por completo.

#### Scenario: Importación en modo create con ítem existente

- **WHEN** se importa un archivo que contiene el ítem `500190`, que ya existe
- **THEN** ese fantasma se reporta como omitido por conflicto y el registro existente no se modifica

#### Scenario: Importación en modo upsert

- **WHEN** se importa con `mode=upsert` un archivo que contiene el ítem `500190` con 4 componentes, y el existente tenía 5
- **THEN** el fantasma existente queda actualizado con exactamente 4 componentes activos

### Requirement: Importación transaccional y por lotes

El sistema SHALL escribir cada fantasma y sus componentes dentro de una transacción propia, de forma que un fallo de infraestructura no deje fantasmas con componentes parciales. La importación SHALL procesar archivos dentro del límite de tamaño admitido sin agotar la memoria del proceso.

#### Scenario: Fallo a mitad de la escritura

- **WHEN** ocurre un error de base de datos mientras se escribe un fantasma y sus componentes
- **THEN** ese fantasma no queda persistido de forma parcial
- **AND** la respuesta reporta el fallo asociado a las filas de ese grupo

#### Scenario: Archivo grande

- **WHEN** se importa un archivo de 5.000 filas dentro del límite de tamaño
- **THEN** la importación se completa y devuelve el reporte de resultados

### Requirement: Exportación al formato de la plantilla

El sistema SHALL exponer la exportación del catálogo a un `.xlsx` con exactamente las mismas columnas A–T de la plantilla, una fila por componente y los campos de cabecera repetidos en cada fila de su grupo. La exportación SHALL aceptar los mismos filtros del listado y, opcionalmente, una lista de ids.

#### Scenario: Exportar el catálogo completo

- **WHEN** se solicita la exportación sin filtros
- **THEN** se descarga un `.xlsx` con la fila de encabezados y una fila por cada componente de cada fantasma no eliminado

#### Scenario: Viaje de ida y vuelta

- **WHEN** se exporta un conjunto de fantasmas y ese mismo archivo se vuelve a importar en modo `upsert`
- **THEN** el catálogo resultante es equivalente al original, sin duplicados ni pérdida de componentes

### Requirement: Plantilla vacía descargable

El sistema SHALL permitir descargar una plantilla `.xlsx` vacía con los encabezados y la fila de límites (40, 40, 20), para que los usuarios preparen archivos de importación válidos.

#### Scenario: Descarga de plantilla

- **WHEN** se solicita la plantilla vacía
- **THEN** se descarga un `.xlsx` con los encabezados A–T y sin filas de datos

### Requirement: Restricciones del archivo subido

El sistema SHALL aceptar únicamente archivos con extensión `.xlsx` y SHALL rechazar los archivos que superen los 10 MB.

#### Scenario: Archivo con formato no soportado

- **WHEN** se sube un archivo `.csv` o `.xls`
- **THEN** el sistema responde `400 Bad Request` indicando que solo se admite `.xlsx`

#### Scenario: Archivo demasiado grande

- **WHEN** se sube un archivo de 25 MB
- **THEN** el sistema rechaza la petición indicando el límite de tamaño
