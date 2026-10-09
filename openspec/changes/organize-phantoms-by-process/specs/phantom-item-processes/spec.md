## ADDED Requirements

### Requirement: Procesos de fantasmas

El sistema SHALL organizar los fantasmas en procesos con nombre y orden, administrados por un administrador: crear, renombrar, reordenar y dar de baja. El nombre SHALL ser único entre los procesos activos. Un proceso con fantasmas activos SHALL NOT poder darse de baja.

#### Scenario: Crear un proceso nuevo

- **WHEN** un administrador crea el proceso «BOBINADO»
- **THEN** aparece como una pestaña más, al final, sin fantasmas

#### Scenario: Nombre repetido

- **WHEN** se intenta crear «Metalmecánica» y ya existe «METALMECANICA»
- **THEN** se rechaza, porque los nombres se comparan sin mayúsculas, tildes ni espacios sobrantes

#### Scenario: Baja con fantasmas

- **WHEN** se intenta dar de baja un proceso con fantasmas
- **THEN** se rechaza indicando cuántos tiene

### Requirement: Familias dentro de un proceso

Cada fantasma SHALL pertenecer a un proceso y PODRÁ pertenecer a una familia de ese proceso. El nombre de la familia SHALL ser único dentro del proceso. Las familias SHALL poder crearse al dar de alta un fantasma, al importar o desde la administración del proceso.

#### Scenario: Familias del libro

- **WHEN** se importa la hoja ARMADO Y CONEXIÓN
- **THEN** el proceso queda con las familias «F- Acc Ar», «F- Acc Con AT» y «F- Acc Con BT o AU», y cada fantasma en la suya

### Requirement: Columnas configurables por proceso

Cada proceso SHALL definir qué columnas usa, en qué orden y con qué encabezado. Las columnas SHALL ser del catálogo —con su tipo, validación y reglas de campos derivados— o propias del proceso, de texto, declaradas de cabecera o de línea. Las columnas obligatorias del catálogo SHALL NOT poder quitarse.

#### Scenario: Mismo campo, otro nombre

- **WHEN** EMBLEMADO usa la cantidad requerida con el encabezado «CANT. REQUERIDA LMS»
- **THEN** la grilla, la importación y la exportación de EMBLEMADO usan ese encabezado, y el dato se valida como número

#### Scenario: Columnas propias de cabecera

- **WHEN** ALISTAMIENTO Y ENCUBE declara PLAN1, MAYOR1, PLAN2 y MAYOR2 como columnas propias de cabecera
- **THEN** cada fantasma guarda un valor de cada una, y se repite en todas sus líneas al exportar

#### Scenario: Quitar una columna obligatoria

- **WHEN** se intenta quitar «Item» de un proceso
- **THEN** se rechaza

### Requirement: Listado por proceso y familia

El listado de fantasmas del admin SHALL mostrar un proceso a la vez, con una pestaña por proceso en su orden, y SHALL filtrar por familia además de los filtros actuales.

#### Scenario: Filtrar por familia

- **WHEN** el administrador abre METALMECANICA y filtra por «F. TAF»
- **THEN** ve solo los fantasmas de esa familia

### Requirement: Alta y edición con proceso, familia y columnas del proceso

El editor de un fantasma SHALL permitir elegir su proceso y su familia, y SHALL mostrar en la grilla las columnas del proceso en su orden, propias incluidas.

#### Scenario: Alta manual

- **WHEN** el administrador crea un fantasma en ALISTAMIENTO Y ENCUBE, familia «F. Acc Alis»
- **THEN** la grilla muestra las columnas del proceso, incluidas PLAN1 a MAYOR2, y el fantasma queda guardado en ese proceso y familia

### Requirement: Regla de referencia por proceso

Cada proceso SHALL definir qué va entre «Raiz Fantasma» y «R kVA + Norma / Otros» al calcular «Referencia»: nada o un espacio. El sistema SHALL usar esa regla al guardar, al importar y como fórmula por defecto del editor.

#### Scenario: Proceso con espacio

- **WHEN** se guarda un fantasma de un proceso con regla «un espacio», Tipo PT `1AU`, Tipo PP `EEN`, Raíz `KIT ALIS` y kVA `0-75 KVA GT`
- **THEN** su referencia es `F-1AU-EEN-KIT ALIS 0-75 KVA GT`

#### Scenario: Cambiar la regla

- **WHEN** un administrador cambia la regla de un proceso
- **THEN** aplica desde el siguiente guardado o importación de cada fantasma, y las referencias guardadas no cambian

#### Scenario: Regla inválida

- **WHEN** se intenta poner otra cosa que nada o un espacio
- **THEN** se rechaza

