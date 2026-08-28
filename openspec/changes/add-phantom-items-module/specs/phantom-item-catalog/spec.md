## ADDED Requirements

### Requirement: Modelo de datos del fantasma

El sistema SHALL persistir cada ítem fantasma como una cabecera (`phantom_item`) con cero o más componentes (`phantom_item_component`), replicando la estructura de la plantilla de Excel donde las columnas A–L pertenecen a la cabecera y las columnas M–T a cada componente.

La cabecera SHALL contener: `finishedProductType`, `workInProcessType`, `phantomRootCode`, `kvaRatingStandard`, `itemCode` (código SAP), `reference`, `itemDescription`, `shortDescription`, `unitOfMeasure`.
El componente SHALL contener: `componentItemCode`, `description`, `baseQuantity`, `requiredQuantity`, `requiredQuantityPerUnit`, `unitOfMeasure`, `wastePercentage`, `consumptionWarehouse` y un `sortOrder` que preserva la secuencia de las filas.

Ambas entidades SHALL incluir `createdAt`, `updatedAt` y `deletedAt` para borrado lógico, siguiendo la convención del resto de módulos.

#### Scenario: Fantasma con múltiples componentes

- **WHEN** se persiste el fantasma con ítem `500190` y sus 5 filas de materiales
- **THEN** se crea 1 registro en `phantom_item` y 5 registros en `phantom_item_component` referenciando ese fantasma por `phantom_item_id`
- **AND** cada componente conserva su `sortOrder` (0..4) según la posición original de la fila

#### Scenario: Fantasma sin componentes

- **WHEN** se crea un fantasma sin ninguna línea de material
- **THEN** el registro de cabecera se persiste correctamente y su lista de componentes es vacía

### Requirement: Unicidad del ítem SAP

El sistema SHALL tratar el campo `itemCode` de la cabecera como identificador de negocio único entre los fantasmas no eliminados, y SHALL rechazar la creación o edición que produzca un `itemCode` duplicado.

#### Scenario: Alta con ítem duplicado

- **WHEN** se intenta crear un fantasma con un `itemCode` que ya existe y no está eliminado
- **THEN** el sistema responde `409 Conflict` indicando el ítem en conflicto
- **AND** no se crea ningún registro

#### Scenario: Reutilización de ítem de un fantasma eliminado

- **WHEN** se crea un fantasma con un `itemCode` que solo existe en registros con `deletedAt` no nulo
- **THEN** el sistema acepta la creación

### Requirement: Cálculo de campos derivados

El sistema SHALL calcular los campos derivados a partir de otros campos del mismo registro, aplicando por defecto estas reglas:

| Campo | Regla por defecto |
| --- | --- |
| `reference` | `"F-" + finishedProductType + "-" + workInProcessType + "-" + phantomRootCode + kvaRatingStandard` |
| `referenceLength` | `=LARGO(reference)` |
| `itemDescription` | `reference` |
| `itemDescriptionLength` | `=LARGO(itemDescription)` |
| `shortDescription` | `"FANTASMA " + phantomRootCode` |
| `shortDescriptionLength` | `=LARGO(shortDescription)` |
| `requiredQuantityPerUnit` | `requiredQuantity / baseQuantity` |

Los campos de longitud (`referenceLength`, `itemDescriptionLength`, `shortDescriptionLength`) SHALL ser calculados y expuestos por el sistema, y NO SHALL almacenarse como columnas propias.

#### Scenario: Derivación de la referencia y sus longitudes

- **WHEN** se guarda un fantasma con `finishedProductType` = `1CA`, `workInProcessType` = `TPI`, `phantomRootCode` = `KIT EMBLE`, `kvaRatingStandard` = `-GY-GENERICO-AD-AZ`
- **THEN** `reference` es `F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ`
- **AND** `referenceLength` es `37` y `itemDescriptionLength` es `37`

#### Scenario: Derivación de la descripción corta

- **WHEN** `phantomRootCode` es `KIT EMBLE`
- **THEN** `shortDescription` es `FANTASMA KIT EMBLE` y `shortDescriptionLength` es `18`

#### Scenario: Cantidad requerida unitaria

- **WHEN** un componente tiene `baseQuantity` = `100` y `requiredQuantity` = `9.87`
- **THEN** `requiredQuantityPerUnit` es `0.0987`

#### Scenario: Cantidad base en cero

- **WHEN** un componente tiene `baseQuantity` = `0`
- **THEN** `requiredQuantityPerUnit` queda nula y el sistema no lanza un error de división

### Requirement: Fórmula de longitud sobre una columna elegible

Cada campo de longitud SHALL calcularse mediante una fórmula `=LARGO(<campo>)` donde `<field>` identifica la columna cuyo contenido se mide, aceptando tanto el nombre del campo (`reference`) como la letra de columna de la plantilla (`F`).

Cuando un registro define su propia fórmula de longitud en `formulaOverrides`, el sistema SHALL medir el campo que esa fórmula indica en lugar del campo por defecto. Una fórmula que apunte a un campo inexistente SHALL producir un error de validación.

#### Scenario: Longitud sobre el campo por defecto

- **WHEN** un fantasma no define fórmula para `itemDescriptionLength` y su `itemDescription` mide 32 caracteres
- **THEN** `itemDescriptionLength` es `32`

#### Scenario: Longitud sobre otra columna

- **WHEN** un fantasma define `formulaOverrides` = `{"referenceLength": "=LARGO(shortDescription)"}` y su `shortDescription` es `FANTASMA KIT EMBLE`
- **THEN** `referenceLength` es `18`, medido sobre `shortDescription` y no sobre `reference`

#### Scenario: Fórmula por letra de columna

- **WHEN** un fantasma define `formulaOverrides` = `{"itemDescriptionLength": "=LARGO(H)"}`
- **THEN** el sistema mide la columna `H` de la plantilla, que corresponde a `itemDescription`

#### Scenario: Fórmula que apunta a un campo inexistente

- **WHEN** un fantasma define `formulaOverrides` = `{"shortDescriptionLength": "=LARGO(noExiste)"}`
- **THEN** el sistema responde `400 Bad Request` indicando que la fórmula referencia un campo desconocido

### Requirement: Validación de límites de longitud

El sistema SHALL validar `itemDescriptionLength` ≤ 40 y `shortDescriptionLength` ≤ 20, límites fijos declarados por la plantilla.

El límite de `referenceLength` SHALL ser configurable por fantasma mediante el campo `referenceLengthLimit`, cuyos únicos valores admitidos son `40` y `50`, con `40` por defecto. El sistema SHALL validar `referenceLength` contra el límite del propio registro.

Al crear o editar por API, superar un límite SHALL producir un error de validación que identifique el campo, la longitud obtenida y el límite aplicado.

#### Scenario: Referencia demasiado larga con el límite por defecto

- **WHEN** los campos de cabecera producen una `reference` de 45 caracteres y el fantasma no define `referenceLengthLimit`
- **THEN** el sistema responde `400 Bad Request` indicando que `reference` mide 45 y excede el límite de 40 caracteres

#### Scenario: Referencia admitida con el límite de 50

- **WHEN** ese mismo fantasma define `referenceLengthLimit` = `50`
- **THEN** el sistema acepta el registro y `referenceLength` es `45`

#### Scenario: Límite de referencia inválido

- **WHEN** se envía `referenceLengthLimit` = `45`
- **THEN** el sistema responde `400 Bad Request` indicando que solo se admiten los valores 40 y 50

#### Scenario: Descripción corta demasiado larga

- **WHEN** `phantomRootCode` produce una `shortDescription` de 24 caracteres
- **THEN** el sistema responde `400 Bad Request` indicando que `shortDescription` excede el límite de 20 caracteres

### Requirement: Fórmulas persistidas y sobreescribibles

El sistema SHALL permitir que cada campo derivado almacene, además de su valor calculado, una **fórmula** que lo produce. Cuando un registro define una fórmula propia para un campo, el sistema SHALL usar esa fórmula en lugar de la regla por defecto; cuando no la define, SHALL aplicar la regla por defecto.

Las fórmulas SHALL persistirse en una columna JSON por registro (`formulaOverrides` en la cabecera y en el componente), donde la clave es el nombre del campo y el valor la expresión.

#### Scenario: Fórmula sobreescrita en un componente

- **WHEN** un componente guarda `formulaOverrides` = `{"requiredQuantityPerUnit": "=P3/O3*2"}`
- **THEN** el sistema conserva esa expresión al leer el componente
- **AND** el valor almacenado en `requiredQuantityPerUnit` es el resultado enviado por el cliente, no el de la regla por defecto

#### Scenario: Campo sin fórmula propia

- **WHEN** un componente no tiene entrada para `requiredQuantityPerUnit` en `formulaOverrides`
- **THEN** el sistema recalcula el campo con la regla por defecto `requiredQuantity / baseQuantity` al guardar

### Requirement: Listado paginado con filtros

El sistema SHALL exponer `GET /phantom-items` devolviendo los fantasmas no eliminados de forma paginada, con `page` y `limit`, e incluyendo el total de registros y el número de componentes de cada fantasma.

El endpoint SHALL aceptar los filtros opcionales `search` (coincidencia parcial sobre `itemCode`, `reference` y `shortDescription`), `finishedProductType`, `workInProcessType` y `phantomRootCode`.

#### Scenario: Listado por defecto

- **WHEN** se solicita `GET /phantom-items` sin parámetros
- **THEN** se devuelve la primera página de fantasmas no eliminados con el total de registros

#### Scenario: Búsqueda por texto

- **WHEN** se solicita `GET /phantom-items?search=KIT EMBLE`
- **THEN** se devuelven únicamente los fantasmas cuyo `itemCode`, `reference` o `shortDescription` contienen `KIT EMBLE`

#### Scenario: Filtro combinado

- **WHEN** se solicita `GET /phantom-items?finishedProductType=3CV&phantomRootCode=KIT ENCU`
- **THEN** se devuelven solo los fantasmas que cumplen ambas condiciones

### Requirement: Detalle de un fantasma

El sistema SHALL exponer `GET /phantom-items/:id` devolviendo la cabecera con sus campos derivados, sus fórmulas y la lista completa de componentes ordenada por `sortOrder`.

#### Scenario: Detalle existente

- **WHEN** se solicita el detalle de un fantasma existente
- **THEN** la respuesta incluye cabecera, `referenceLength`, `itemDescriptionLength`, `shortDescriptionLength` y todos los componentes ordenados

#### Scenario: Detalle inexistente

- **WHEN** se solicita el detalle de un id que no existe o está eliminado
- **THEN** el sistema responde `404 Not Found`

### Requirement: Administración de fantasmas

El sistema SHALL exponer `POST /phantom-items`, `PUT /phantom-items/:id` y `DELETE /phantom-items/:id` para crear, editar y eliminar lógicamente un fantasma. La creación y edición SHALL aceptar la lista de componentes en el mismo cuerpo, reemplazando la lista completa en la edición.

El borrado SHALL ser lógico (`deletedAt`) y SHALL marcar también sus componentes.

#### Scenario: Creación con componentes

- **WHEN** se envía `POST /phantom-items` con cabecera y 3 componentes
- **THEN** se crea el fantasma con sus 3 componentes y se responde con el detalle completo

#### Scenario: Edición que reemplaza componentes

- **WHEN** se envía `PUT /phantom-items/:id` con una lista de 2 componentes sobre un fantasma que tenía 5
- **THEN** el fantasma queda con exactamente 2 componentes activos

#### Scenario: Borrado lógico

- **WHEN** se envía `DELETE /phantom-items/:id`
- **THEN** el fantasma y sus componentes quedan con `deletedAt` establecido
- **AND** dejan de aparecer en el listado

### Requirement: Administración de componentes individuales

El sistema SHALL exponer `POST /phantom-items/:id/components`, `PUT /phantom-items/components/:componentId` y `DELETE /phantom-items/components/:componentId` para agregar, editar y eliminar líneas de material sin reenviar el fantasma completo.

#### Scenario: Agregar una línea

- **WHEN** se envía `POST /phantom-items/:id/components` con un material
- **THEN** el componente se agrega al final de la lista con el siguiente `sortOrder` disponible

#### Scenario: Eliminar una línea

- **WHEN** se envía `DELETE /phantom-items/components/:componentId`
- **THEN** el componente queda eliminado lógicamente y no aparece en el detalle del fantasma

### Requirement: Control de acceso

Los endpoints de consulta de fantasmas SHALL estar disponibles para los roles `ADMIN`, `DESIGN` y `NORM`. Los endpoints de creación, edición, eliminación e importación SHALL estar restringidos al rol `ADMIN`.

#### Scenario: Consulta con rol DESIGN

- **WHEN** un usuario con rol `DESIGN` solicita `GET /phantom-items`
- **THEN** el sistema devuelve el listado

#### Scenario: Escritura con rol DESIGN

- **WHEN** un usuario con rol `DESIGN` envía `POST /phantom-items`
- **THEN** el sistema responde `403 Forbidden`
