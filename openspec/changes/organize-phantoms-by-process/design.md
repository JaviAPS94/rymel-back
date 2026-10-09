## Context

El módulo de fantasmas (`add-phantom-items-module`) modela un fantasma como cabecera (`phantom_item`, campos de la columna «Tipo PT» a «UM») más líneas de material (`phantom_item_component`, de «ÍTEM - COMPONENTE» a «BODEGA CONSUMO»). Las columnas son un catálogo fijo (`PHANTOM_ITEM_COLUMNS`) que comparten importador, exportador y grilla, y el importador reconoce cada columna por su encabezado.

El libro real del cliente cambia tres supuestos de ese diseño:

| | Supuesto actual | Libro real |
|---|---|---|
| Organización | una lista plana, una hoja | 5 procesos visibles, una hoja cada uno, y una oculta |
| Columnas | un catálogo fijo para todos | cada proceso usa un subconjunto, con sus propios nombres, y PLAN1/MAYOR1/PLAN2/MAYOR2 que el catálogo no tiene |
| Encabezados | únicos | «Item» doble en METALMECANICA, con la primera columna vacía |

Medido en el libro: 533 fantasmas y 5.235 líneas; familias por proceso entre 1 y 3; ningún `Item` repetido entre hojas; PLAN/MAYOR con valor en todas las líneas que los llevan y distintos entre las líneas de un mismo fantasma en 7 de los 76 de ALISTAMIENTO Y ENCUBE. En la base hay hoy 1 fantasma con 9 líneas.

## Goals / Non-Goals

**Goals:** organizar los fantasmas por proceso y familia como el libro; que cada proceso tenga sus columnas sin perder ningún dato del libro; importar el libro completo o parcial, pegar desde Excel, dar de alta a mano y exportar el libro como respaldo.

**Non-Goals:** relacionar fantasmas con estructuras BOM o plantillas; integrar SIESA; cambiar las reglas de los campos derivados (referencia, descripciones, longitudes).

## Decisions

### 1. Proceso y familia son entidades, no texto en el fantasma

`phantom_process(id, name, position)` y `phantom_family(id, process_id, name)`, con nombre único entre los activos —el proceso en todo el sistema, la familia dentro de su proceso—. `phantom_item` gana `process_id` (obligatorio) y `family_id` (opcional).

*Por qué así:* el cliente quiere crear, renombrar y ordenar procesos («anexar N hojas con N nombres»). Con texto suelto en cada fantasma, renombrar un proceso sería reescribir cientos de filas, y una errata crearía un proceso fantasma.

*Alternativa considerada:* familia como texto en el fantasma. Es más simple, pero el filtro por familia dependería de escribirla igual en 700 líneas; el libro ya trae «F- Acc Ar» y «F. Acc Alis» con separadores distintos, y así se ven todas.

### 2. Columnas por proceso: catálogo tipado más columnas propias

`phantom_process_column(process_id, position, key, header, scope)`:

- `key` es un campo del catálogo (`requiredQuantity`, `wastePercentage`…) o una clave propia (`custom:plan1`).
- `header` es el encabezado que usa ese proceso: «CANT. REQUERIDA LMS» en EMBLEMADO, «% DESP. LAMINA» en METALMECANICA, para el mismo campo tipado.
- Las columnas propias declaran si son de **cabecera** o de **línea**, y se guardan como texto en `extra_values` (JSON) de `phantom_item` o de `phantom_item_component`.

*Por qué así:* el catálogo conserva lo que ya vale —tipos, validaciones, campos derivados y fórmulas de longitud—, y las columnas propias cubren lo que hoy no tiene (PLAN/MAYOR) y lo que traigan procesos futuros, sin migraciones por cada columna nueva. PLAN/MAYOR son de cabecera: son la clasificación del fantasma.

*Alternativas consideradas:*
- **Un modelo con todas las columnas conocidas**, cada proceso mostrando las suyas. Más simple, pero cada columna nueva de un proceso futuro exigiría una migración. Se descartó a pedido del responsable.
- **Todo genérico (EAV)**. Perdería los tipos y las reglas de los campos derivados, que son lo que da valor al módulo.

*Alcance de una columna propia nueva:* al importar una hoja de un proceso nuevo, una columna propia a la izquierda de la primera columna de línea del catálogo (`ÍTEM - COMPONENTE` en adelante) es de cabecera; a la derecha, de línea. Es como está armado el libro: PLAN/MAYOR quedan a la izquierda. Se puede corregir después en la administración de columnas.

*Restricción:* las columnas obligatorias del catálogo —`Item` e `ÍTEM - COMPONENTE`, más las que exigen los campos derivados— no se pueden quitar de un proceso.

### 3. La importación es por libro, y cada hoja va a su proceso

Cada hoja visible se empareja con el proceso del mismo nombre, sin distinguir mayúsculas, tildes ni espacios. Una hoja sin proceso se propone como **proceso nuevo**, con las columnas que se reconocen en su encabezado y propias para el resto. La previsualización muestra por proceso cuántos fantasmas se crean y cuántos se actualizan, y las columnas ignoradas. Se escribe por fantasma, en su propia transacción, como hoy.

*Por qué así:* es la forma en que el negocio ya trabaja, y conserva la propiedad que el importador ya tiene —en modo actualizar solo se toca lo que viene en el archivo—, que es la que permite importar un libro con un solo fantasma nuevo.

*Encabezados repetidos:* se usa la columna con más datos. «La primera con datos» no basta: en METALMECANICA la primera «Item» tiene una etiqueta en 6 filas y la segunda los códigos en 2.642; con la primera, toda la hoja quedaría en un solo fantasma. Si dos columnas con el mismo encabezado tienen datos distintos, se informa.

*Hojas ocultas:* se omiten y se informa. SEF-SEH está oculta en el libro y no tiene columna «Fantasma»; si el negocio la quiere, basta con mostrarla.

*Un fantasma que cambia de proceso:* un `Item` que ya existe en otro proceso se actualiza y se mueve al de la hoja, con aviso. El `Item` sigue siendo único en todo el sistema.

### 4. Pegar desde Excel es una importación desde el portapapeles

El bloque pegado se interpreta con las columnas del proceso en su orden, con «Fantasma» primero —el mismo orden con que se exporta—, admitiendo que la primera fila sea el encabezado. El archivo y el pegado entran por el mismo método (`importSheets`); el pegado solo agrega la lectura por posición. Pasa por el mismo agrupamiento, la misma validación y la misma previsualización que un archivo.

*Por qué así:* una segunda vía de alta con reglas propias acabaría aceptando lo que la importación rechaza. Así hay un solo camino, con dos entradas.

*Tamaño:* una hoja entera pegada (METALMECANICA, 2.642 líneas) ronda 0,5 MB, más que el límite de 100 KB de Express para JSON. El límite se amplía a 10 MB solo para `POST /phantom-items/import/paste`, igual que el de archivos, sin tocar el resto de la API.

### 5. La exportación reproduce el libro

Una hoja por proceso, en su orden, con sus columnas y sus encabezados, con «Fantasma» (la familia) como primera columna. Las columnas derivadas (largos) se exportan como valor, no como fórmula: el libro exportado es un respaldo y una entrada de importación, y al importarlas se recalculan de todos modos.

*Límite del formato:* el libro lleva valores, no fórmulas. Una fórmula propia cuyo valor difiere de la regla viaja como literal y vuelve igual (las 139 del libro real sobreviven a la ida y vuelta). Una fórmula propia cuyo valor **coincide** con la regla —un `0.6` fijado en «CANT. REQUERIDA UNITARIA» que vale justo 3/5— no se distingue de la regla y, al reimportar en modo actualizar, el fantasma vuelve a la regla: el valor no cambia, pero deja de estar fijado. Se comprobó con el fantasma de prueba R345343. Si hiciera falta conservarlas, el exportador tendría que marcar esas celdas; no se hace ahora porque el libro del negocio no tiene ninguna. Se puede exportar el libro completo o un solo proceso, y lo exportado se puede volver a importar sin cambios.

### 6. Rutas de procesos en su propio controlador

Procesos, familias y columnas viven en `/phantom-processes`. Colgarlos de `/phantom-items/processes` chocaría con `GET /phantom-items/:id`, y su orden de declaración quedaría como única defensa.

### 7. La regla de «Referencia» es del proceso

Cada proceso guarda qué va entre «Raiz Fantasma» y «R kVA + Norma / Otros»: nada o un espacio. El libro real lo hace así: EMBLEMADO concatena directo (el kVA trae su guion, `-GY-GENERICO-AD-AZ`) y las otras cuatro hojas usan `CONCATENATE("F-",C,"-",D,"-",E," ",F)`. Con una sola regla, la previsualización del libro daba 420 avisos de «el archivo trae otra referencia», que tapaban los avisos reales, y cada uno de esos fantasmas quedaba con su referencia como literal: al editarlo, el editor la recalculaba sin el espacio.

Al importar una hoja que crea un proceso, la regla se deduce de la hoja: la que reproduce la referencia del archivo en más fantasmas; en empate, sin separador, como siempre. Se cambia en «Procesos» y aplica al guardar o importar cada fantasma; las referencias guardadas no se reescriben a escondidas. El editor usa la misma regla como fórmula por defecto de la columna F.

*Alternativas consideradas:*
- **Fórmula libre por proceso.** Más general, pero exige un evaluador de fórmulas en el servidor que hoy no existe para la cabecera; las cinco hojas reales solo difieren en el espacio.
- **Silenciar el aviso cuando solo difiere el espacio.** Esconde el síntoma: el editor seguiría recalculando mal.

### 8. «Largo 40/50» y «Desc. item» sobre 40

El libro no dice qué límite usa cada fantasma; lo dice su largo. Al importar, una referencia de 41 a 50 caracteres toma el límite 50 (46 fantasmas de METALMECANICA, de 41 a 50). Más de 50 sigue rechazándose.

«Desc. item» copia la referencia, así que esos 46 también pasan su «Largo 40». Por decisión del responsable, el exceso de «Desc. item» se acepta con aviso en vez de rechazar el fantasma, y vale igual al guardar desde el editor: si no, un fantasma importado no se podría volver a guardar. Los demás largos siguen siendo un rechazo.

## Risks / Trade-offs

- **[Riesgo] 7 fantasmas de ALISTAMIENTO traen PLAN/MAYOR distintos entre sus líneas.** → Se toma la primera fila, como con los demás campos de cabecera, y se avisa por fantasma.
- **[Riesgo] Mover un fantasma de proceso al importar una hoja equivocada.** → Se informa en la previsualización, antes de escribir.
- **[Trade-off] Las columnas propias son texto.** → Suficiente para PLAN/MAYOR, que son códigos; si una columna propia necesitara cálculo, se promueve al catálogo.
- **[Riesgo] Aceptar «Desc. item» de más de 40 si SIESA no lo admite.** → Queda avisado en cada importación y marcado en rojo en el editor; si SIESA lo rechaza, se vuelve a rechazo cambiando `SOFT_LENGTH_FIELDS`.
- **[Riesgo] Importar 5.121 filas en el navegador y el servidor.** → Ya se escribe por fantasma; se mide con el libro real (533 transacciones) y se fija un umbral.

## Migration Plan

1. Migración: tablas nuevas, columnas nuevas, un proceso «General» con el catálogo actual como columnas, y el fantasma existente asignado a él. Reversible.
2. Servidor: procesos, familias, columnas, importación por libro, pegado y exportación.
3. Admin: listado por proceso, administración de procesos y columnas, editor, importación, pegado y exportación.
4. Carga del libro real como verificación.

## Open Questions

1. ¿Se importa la hoja oculta SEF-SEH? Hoy se omitiría por estar oculta.
2. El fantasma que ya está en la base (proceso «General»): ¿se mueve a algún proceso del libro?
