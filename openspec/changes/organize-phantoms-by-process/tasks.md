## 1. Evidencia

- [x] 1.1 Medir el libro real: 5 hojas visibles y 1 oculta, 533 fantasmas, 5.235 líneas, familias por proceso, columnas por hoja, «Item» doble en METALMECANICA, PLAN/MAYOR de cabecera con 7 fantasmas inconsistentes, ningún `Item` entre hojas

## 2. Modelo y migración (project-back)

- [x] 2.1 Entidades `PhantomProcess`, `PhantomFamily`, `PhantomProcessColumn`; `process_id`, `family_id` y `extra_values` en `phantom_item`; `extra_values` en `phantom_item_component`
- [x] 2.2 Migración con proceso «General» y el catálogo actual como columnas; el fantasma existente asignado a él. Probar `down`

## 3. Procesos, familias y columnas (project-back)

- [x] 3.1 Servicio y endpoints de procesos: listar, crear, renombrar, reordenar, dar de baja si está vacío; nombres comparados sin mayúsculas, tildes ni espacios
- [x] 3.2 Familias por proceso: listar, crear, renombrar
- [x] 3.3 Columnas por proceso: leer y reemplazar, con catálogo y propias, protegiendo las obligatorias
- [x] 3.4 Listado de fantasmas filtrado por proceso y familia; alta y edición con proceso, familia y valores propios
- [x] 3.5 Pruebas unitarias de las reglas

## 4. Importación y exportación del libro (project-back)

- [x] 4.1 Lectura de todas las hojas visibles, emparejadas con su proceso; hojas ocultas omitidas
- [x] 4.2 Encabezados por proceso: catálogo con alias del proceso y columnas propias; encabezado repetido resuelto por la columna con datos; columnas ignoradas informadas
- [x] 4.3 Familia desde «Fantasma»; columnas propias de cabecera y de línea; aviso de cabecera inconsistente
- [x] 4.4 Procesos nuevos propuestos en la previsualización y creados al confirmar
- [x] 4.5 Movimiento de proceso de un `Item` existente, avisado
- [x] 4.6 Pegado: filas de texto tabulado con las columnas del proceso, por el mismo camino
- [x] 4.7 Exportación del libro completo y de un proceso; ida y vuelta sin cambios
- [x] 4.8 Pruebas con recortes del libro real

## 5. Admin (project-admin)

- [x] 5.1 Tipos y servicios de procesos, familias, columnas, importación de libro, pegado y exportación
- [x] 5.2 Listado con una pestaña por proceso y filtro de familia
- [x] 5.3 Administración de procesos y de sus columnas
- [x] 5.4 Editor con proceso, familia y columnas del proceso
- [x] 5.5 Importación del libro con previsualización por proceso
- [x] 5.6 Pegar desde Excel en un proceso, con previsualización
- [x] 5.7 Exportar el libro completo y un proceso
- [x] 5.8 Pruebas de las pantallas

## 6. Verificación con el libro real

- [x] 6.1 Previsualizar e importar `ITEMS FANTASMA ALEX.xlsx` contra la base local: 533 fantasmas y 5.121 filas en 5 procesos (5.235 líneas contaban las 115 de SEF-SEH, oculta)
- [x] 6.2 Importar un libro con un solo fantasma nuevo y comprobar que el resto no cambia
- [x] 6.3 Exportar y reimportar sin cambios
- [x] 6.4 Medir la duración de la importación completa y fijar un umbral (13 s creando, 10 s actualizando; umbral 60 s; tiempo de espera del admin para importar y pegar, 5 min, porque el general es de 10 s)

## 7. Regla de referencia y límites del libro real

- [x] 7.1 `reference_separator` por proceso (migración, servicio, `PUT /phantom-processes/:id/reference-separator`), usado al guardar e importar
- [x] 7.2 Deducción de la regla al crear un proceso desde una hoja; límite 40/50 por el largo de la referencia
- [x] 7.3 «Desc. item» sobre 40 aceptada con aviso, al importar y al guardar
- [x] 7.4 Admin: regla en «Procesos», fórmula por defecto de F según el proceso, aviso en la previsualización
- [x] 7.5 Pruebas: regla, deducción con el recorte del libro real, límite 50 con 500558
- [x] 7.6 Numeración de líneas sin huecos cuando una fila se rechaza (la ida y vuelta la cerraba)
