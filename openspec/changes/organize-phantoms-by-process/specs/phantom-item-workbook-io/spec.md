## ADDED Requirements

### Requirement: Importación de un libro por proceso

El sistema SHALL importar todas las hojas visibles de un libro `.xlsx`, cada una al proceso de su mismo nombre (sin distinguir mayúsculas, tildes ni espacios sobrantes), reconociendo las columnas por los encabezados de ese proceso. Una hoja sin proceso SHALL proponerse como proceso nuevo, con las columnas reconocidas del catálogo y propias para el resto. La columna «Fantasma» SHALL leerse como la familia. Sustituye a la importación de la primera hoja con columnas fijas.

#### Scenario: Libro completo del cliente

- **WHEN** se importa `ITEMS FANTASMA ALEX.xlsx`
- **THEN** quedan 533 fantasmas y 5.235 líneas repartidos en los 5 procesos visibles, con sus familias y sus columnas propias

#### Scenario: Hoja de un proceso nuevo

- **WHEN** el libro trae una hoja «BOBINADO» y no existe ese proceso
- **THEN** la previsualización propone crearlo con las columnas que trae, y al confirmar se crea

#### Scenario: Hoja oculta

- **WHEN** el libro trae la hoja oculta SEF-SEH
- **THEN** se omite y la previsualización lo informa

### Requirement: Importación parcial sin tocar el resto

En modo actualizar, la importación SHALL crear o actualizar solo los fantasmas que trae el libro, por su `Item`, y SHALL conservar los demás.

#### Scenario: Un fantasma nuevo desde Excel

- **WHEN** después de la carga inicial se importa un libro con una sola hoja METALMECANICA y un solo fantasma nuevo de 6 líneas
- **THEN** se crea ese fantasma y los 208 de METALMECANICA y los de los demás procesos quedan como estaban

#### Scenario: Un fantasma en otra hoja

- **WHEN** se importa un `Item` que ya existe en otro proceso
- **THEN** la previsualización avisa que se moverá, y al confirmar se actualiza y queda en el proceso de la hoja

### Requirement: Lectura robusta de los encabezados del libro

Con encabezados repetidos, el importador SHALL usar la columna con datos. Las columnas que el proceso no usa SHALL informarse como ignoradas. Si las líneas de un fantasma traen distintos valores en una columna de cabecera, SHALL usarse la primera y avisarse.

#### Scenario: «Item» doble

- **WHEN** se importa METALMECANICA, cuya primera columna «Item» está vacía y la segunda tiene los códigos
- **THEN** se importan sus 208 fantasmas con los códigos de la segunda columna

#### Scenario: Columnas fuera de alcance

- **WHEN** EMBLEMADO trae «Estructura LM» y «Plantillas Diseño»
- **THEN** la previsualización las informa como ignoradas

### Requirement: Pegar desde Excel en un proceso

El admin SHALL aceptar un bloque de filas pegado desde Excel en un proceso, leído con las columnas del proceso en su orden y admitiendo una primera fila de encabezado. El bloque SHALL pasar por la misma agrupación, validación y previsualización que un archivo.

#### Scenario: Pegar un fantasma

- **WHEN** el administrador copia en Excel las 6 líneas de un fantasma nuevo y las pega en METALMECANICA
- **THEN** la previsualización muestra un fantasma a crear con 6 líneas, y al confirmar queda guardado

### Requirement: Exportación del libro

El sistema SHALL exportar el libro completo, una hoja por proceso en su orden, con sus columnas y encabezados y «Fantasma» como primera columna, y SHALL poder exportar un solo proceso. Lo exportado SHALL poder reimportarse sin cambios.

#### Scenario: Ida y vuelta

- **WHEN** se exporta el libro y se vuelve a importar en modo actualizar
- **THEN** ningún fantasma cambia

### Requirement: Regla y límites deducidos del libro

Al importar, el sistema SHALL deducir de la hoja la regla de referencia de un proceso nuevo, SHALL elegir el límite 40 o 50 de cada fantasma por el largo de su referencia, y SHALL aceptar con aviso una «Desc. item» de más de 40.

#### Scenario: Regla de una hoja nueva

- **WHEN** se importa una hoja cuyas referencias llevan un espacio antes del kVA
- **THEN** el proceso se crea con la regla «un espacio» y esas referencias no generan avisos

#### Scenario: Referencia de 41 a 50

- **WHEN** un fantasma trae una referencia de 42 caracteres
- **THEN** se importa con límite 50, y el exceso de su «Desc. item» sobre 40 se informa como aviso

#### Scenario: Referencia de más de 50

- **WHEN** un fantasma trae una referencia de 51 caracteres
- **THEN** se omite y se informa como error

