## ADDED Requirements

### Requirement: Sección de fantasmas en el administrador

El administrador SHALL incluir una sección "Fantasmas" accesible desde la navegación principal, con una página de listado (`/phantom-items`) y una página de edición (`/phantom-items/:id`), protegidas por autenticación y visibles según el rol del usuario.

#### Scenario: Acceso desde la navegación

- **WHEN** un usuario autenticado con rol `ADMIN` abre el administrador
- **THEN** ve la entrada "Fantasmas" en la navegación y puede abrir el listado

#### Scenario: Usuario sin permiso de escritura

- **WHEN** un usuario con rol `DESIGN` abre la sección
- **THEN** puede consultar el listado y el detalle
- **AND** las acciones de crear, editar, importar y eliminar aparecen deshabilitadas

### Requirement: Listado de fantasmas

El listado SHALL mostrar `itemCode`, `reference`, `shortDescription`, `finishedProductType`, `workInProcessType`, `phantomRootCode` y el número de componentes, con paginación, buscador por texto y filtros por tipo y raíz, consumiendo el listado paginado del backend.

#### Scenario: Búsqueda en el listado

- **WHEN** el usuario escribe `KIT ENCU` en el buscador
- **THEN** la tabla muestra únicamente los fantasmas coincidentes y la paginación se reinicia a la primera página

#### Scenario: Abrir el editor

- **WHEN** el usuario hace clic en una fila del listado
- **THEN** navega a `/phantom-items/:id` con el fantasma cargado

### Requirement: Grilla tipo hoja de cálculo

El editor SHALL presentar los componentes del fantasma en una grilla con encabezados de columna estilo Excel (A, B, C, …) y numeración de filas, donde cada columna corresponde a un campo del modelo y cada fila a un componente.

La grilla SHALL soportar: selección de celda, edición en la celda, navegación con teclado (flechas, `Tab`, `Enter`, `Escape`), selección de rango con `Shift` + flechas o arrastre, y agregar/eliminar filas.

#### Scenario: Navegación con teclado

- **WHEN** el usuario tiene seleccionada la celda `O3` y presiona la flecha derecha
- **THEN** la selección se mueve a `P3`

#### Scenario: Edición en celda

- **WHEN** el usuario escribe un valor en una celda y presiona `Enter`
- **THEN** el valor se guarda en el modelo de la grilla y la selección baja una fila

#### Scenario: Cancelar edición

- **WHEN** el usuario está editando una celda y presiona `Escape`
- **THEN** la celda recupera su valor anterior

#### Scenario: Agregar una fila

- **WHEN** el usuario agrega una fila
- **THEN** aparece un componente vacío al final de la grilla con las fórmulas por defecto en sus columnas derivadas

### Requirement: Barra de fórmulas

El editor SHALL incluir una barra de fórmulas que muestre la referencia de la celda seleccionada y su contenido subyacente: la fórmula cuando la celda tiene una, o el valor literal cuando no. Editar la barra SHALL aplicar el cambio a la celda seleccionada.

#### Scenario: Celda con fórmula

- **WHEN** el usuario selecciona una celda cuyo contenido es `=P3/O3`
- **THEN** la barra de fórmulas muestra `=P3/O3` mientras la celda muestra el valor calculado

#### Scenario: Edición desde la barra

- **WHEN** el usuario cambia la barra de fórmulas a `=P3/O3*2` y confirma
- **THEN** la celda recalcula y muestra el nuevo resultado

### Requirement: Motor de fórmulas con referencias entre celdas

La grilla SHALL evaluar las expresiones que comienzan con `=`, resolviendo referencias a otras celdas de la misma grilla (`O3`, `$P$3`) y rangos (`P3:P10`).

El motor SHALL soportar como mínimo: operadores aritméticos (`+ - * / ^`), concatenación de texto (`&`), y las funciones `SUMA`/`SUM`, `PROMEDIO`/`AVERAGE`, `LARGO`/`LEN`, `SI`/`IF`, `REDONDEAR`/`ROUND`, `CONCATENAR`/`CONCAT`, `IZQUIERDA`/`LEFT` y `DERECHA`/`RIGHT`.

#### Scenario: Fórmula aritmética entre celdas

- **WHEN** la celda `Q3` contiene `=P3/O3`, con `O3` = `100` y `P3` = `9.87`
- **THEN** `Q3` muestra `0.0987`

#### Scenario: Concatenación de texto

- **WHEN** una celda contiene `="F-"&A3&"-"&B3` con `A3` = `1CA` y `B3` = `TPI`
- **THEN** la celda muestra `F-1CA-TPI`

#### Scenario: Función de longitud

- **WHEN** una celda contiene `=LARGO(F3)` y `F3` = `F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ`
- **THEN** la celda muestra `37`

#### Scenario: Suma de un rango

- **WHEN** una celda contiene `=SUMA(P3:P7)`
- **THEN** la celda muestra la suma de los valores numéricos de ese rango

### Requirement: Recálculo por grafo de dependencias

La grilla SHALL mantener un grafo de dependencias entre celdas y, al cambiar el valor de una celda, SHALL recalcular únicamente las celdas que dependen de ella, en orden topológico.

#### Scenario: Propagación en cascada

- **WHEN** `Q3` = `=P3/O3` y `R3` = `=Q3*2`, y el usuario cambia `P3`
- **THEN** se recalculan `Q3` y luego `R3`, y ninguna otra celda

#### Scenario: Referencia circular

- **WHEN** el usuario introduce una fórmula que crea un ciclo (por ejemplo `Q3` = `=R3` y `R3` = `=Q3`)
- **THEN** las celdas involucradas muestran `#CIRCULAR` y el editor no entra en bucle infinito

#### Scenario: Fórmula inválida

- **WHEN** el usuario introduce `=P3/`
- **THEN** la celda muestra `#ERROR` y el resto de la grilla sigue funcionando

### Requirement: Fórmulas por defecto en columnas derivadas

Al crear una fila o importar datos, la grilla SHALL preinsertar las fórmulas por defecto de las columnas derivadas definidas en `phantom-item-catalog` (referencia, largos, descripción corta y cantidad requerida unitaria), referenciando las celdas de la misma fila. El usuario SHALL poder sobreescribir cualquiera de esas fórmulas con un valor literal o con otra expresión.

#### Scenario: Fila nueva con fórmula por defecto

- **WHEN** el usuario agrega la fila 8
- **THEN** la celda de cantidad requerida unitaria de esa fila contiene `=P8/O8`

#### Scenario: Sobreescritura con valor literal

- **WHEN** el usuario escribe `0.5` sobre una celda que tenía una fórmula por defecto
- **THEN** la celda queda con el valor literal `0.5` y deja de recalcularse a partir de sus precedentes

#### Scenario: Restaurar la fórmula por defecto

- **WHEN** el usuario usa la acción de restaurar fórmula sobre una celda derivada sobreescrita
- **THEN** la celda vuelve a contener la fórmula por defecto y se recalcula

### Requirement: Indicadores visuales de longitud

La grilla SHALL mostrar las columnas de longitud (`Largo 40/50`, `Largo 40`, `Largo 20`) como celdas calculadas de solo lectura, y SHALL resaltar en rojo la celda cuando el valor supere su límite (40, 40 y 20 respectivamente).

#### Scenario: Longitud dentro del límite

- **WHEN** `Largo 20` vale `18`
- **THEN** la celda se muestra con el estilo normal

#### Scenario: Longitud excedida

- **WHEN** `Largo 20` vale `24`
- **THEN** la celda se resalta en rojo con un mensaje indicando el límite de 20 caracteres
- **AND** el botón de guardar advierte que hay filas fuera de límite

### Requirement: Copiar y pegar rangos

La grilla SHALL soportar copiar (`Ctrl/Cmd+C`) y pegar (`Ctrl/Cmd+V`) rangos de celdas, incluyendo el pegado de contenido tabulado copiado desde Excel, creando las filas necesarias cuando el rango pegado excede las filas existentes.

#### Scenario: Pegar desde Excel

- **WHEN** el usuario copia 12 filas × 8 columnas desde Excel y pega en la celda `M3` de una grilla con 5 filas
- **THEN** la grilla crea las filas faltantes y distribuye los valores en las columnas correspondientes

#### Scenario: Copiar dentro de la grilla

- **WHEN** el usuario copia el rango `O3:P5` y pega en `O10`
- **THEN** los valores se replican en `O10:P12`

### Requirement: Guardado explícito con cambios pendientes

El editor SHALL mantener los cambios en memoria y persistirlos solo cuando el usuario guarda, enviando la cabecera junto con la lista completa de componentes y sus fórmulas. El editor SHALL indicar visualmente que hay cambios sin guardar y SHALL advertir antes de abandonar la página con cambios pendientes.

#### Scenario: Guardado exitoso

- **WHEN** el usuario modifica celdas y presiona guardar
- **THEN** se envían los cambios al backend y se muestra una notificación de éxito
- **AND** el indicador de cambios pendientes desaparece

#### Scenario: Salir con cambios pendientes

- **WHEN** el usuario intenta navegar fuera del editor con cambios sin guardar
- **THEN** el sistema pide confirmación antes de descartar los cambios

#### Scenario: Error al guardar

- **WHEN** el backend rechaza el guardado por validación
- **THEN** se muestra el error indicando el campo afectado y los cambios permanecen en la grilla

### Requirement: Importación de Excel desde el administrador

El administrador SHALL permitir subir un archivo `.xlsx`, previsualizar el resultado antes de confirmar, elegir el modo (`create` o `upsert`), y mostrar el reporte de errores por fila devuelto por el backend.

#### Scenario: Previsualización antes de importar

- **WHEN** el usuario selecciona un archivo y solicita la previsualización
- **THEN** se muestra cuántos fantasmas se crearían y actualizarían, y la lista de errores por fila con su número de fila y motivo

#### Scenario: Confirmación de la importación

- **WHEN** el usuario confirma tras la previsualización
- **THEN** se ejecuta la importación real y se refresca el listado con los fantasmas resultantes

#### Scenario: Archivo con errores bloqueantes

- **WHEN** la previsualización devuelve que faltan columnas obligatorias
- **THEN** el botón de confirmar queda deshabilitado y se indica qué columnas faltan

### Requirement: Exportación desde el administrador

El administrador SHALL permitir descargar el catálogo en `.xlsx` respetando los filtros activos del listado, y descargar la plantilla vacía de importación.

#### Scenario: Exportar con filtros

- **WHEN** el usuario tiene el filtro `finishedProductType=3CV` activo y presiona exportar
- **THEN** se descarga un archivo que contiene únicamente los fantasmas de ese tipo

### Requirement: Motor de fórmulas reutilizable y testeado

El motor de fórmulas SHALL implementarse como un módulo independiente de la interfaz (sin dependencias de React en su núcleo de evaluación ni en la construcción del grafo), con pruebas unitarias que cubran evaluación de expresiones, resolución de referencias, orden de recálculo, ciclos y errores.

#### Scenario: Uso del motor fuera del grid

- **WHEN** se evalúa una expresión con el motor pasándole un mapa de celdas
- **THEN** devuelve el resultado sin requerir un componente montado
