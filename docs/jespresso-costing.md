# Hoja de recetas Jespresso

El costeo de Coctelería, Cafetería y los negocios abiertos con el panel genérico usa `Recetas Jespresso Oliva.xlsx`. GCOBARF conserva su hoja de producción anterior. La librería contiene las 27 hojas, 31 recetas/variantes y 185 renglones de ingredientes del archivo. Las plantillas se abren como borradores; no crean existencias ni movimientos. No se reemplazan recetas existentes con la librería.

## Cálculos

- Importe de ingrediente: cantidad usada × precio de compra ÷ cantidad de la presentación. Las presentaciones del archivo incluyen 900 ml, 170 g y paquetes de 10, 30, 72 o 95 unidades, entre otras.
- Materia prima: suma de ingredientes aplicados **al lote**.
- Imprevistos: materia prima × porcentaje de imprevistos / 100.
- Gerencial: materia prima × suma de porcentajes de mantenimiento, indumentaria y aseo / 100. Cada concepto utiliza su propio porcentaje y la materia prima de esa misma receta.
- Preparación: materia prima + imprevistos + gerencial.
- Porción: preparación ÷ porciones + adiciones **por porción**. Así se maneja la base del helado y sus toppings.
- Base de venta: costo por porción × factor de venta / 100. Un factor de 150 % multiplica por 1,5; no representa un margen del 150 %.
- Recuperación: base de venta × porcentaje de recuperación / 100. Se admite el porcentaje manual del archivo y el cociente entre el objetivo diario y el cierre mensual estimado. Si los costos mensuales son cero, el cociente resulta cero.
- Consumo e IVA: cada porcentaje se aplica a la base de venta, de manera independiente.
- Precio final: base de venta + recuperación + consumo + IVA.
- Objetivo diario: costos mensuales registrados ÷ días de trabajo. Cierre estimado: objetivo diario × días de cierre. La utilidad mensual se calcula cuando se registran las ventas reales del mes.

Los cálculos conservan sus decimales; la interfaz presenta COP sin centavos. El precio propuesto para inventario se redondea hacia arriba al peso. El importe directo registrado en Barquillos se conserva como un valor editable, igual que en la celda del archivo; no se inventa una presentación de compra para justificar ese valor.

## Persistencia e integración

Las recetas siguen en el documento `costing`, con una extensión `recipe.sheet` validada en cliente y servidor. Los ingredientes mantienen el formato existente; los renglones agregan `stage` (`batch` o `portion`) y, cuando corresponde, `manualCost`. Los documentos previos se pueden abrir y editar en el nuevo formato conservando su costo y los insumos originales. La adaptación no se confirma hasta guardar.

Cada receta mantiene su borrador, incluidos campos incompletos. Guardar confirma solamente la receta seleccionada y sus ingredientes: un producto nuevo sin terminar no impide guardar otra receta. Historial muestra los datos confirmados; abrir una receta retoma su borrador si existe. El borrador se escribe con una espera de 100 ms y se vacía también al hacer clic, salir o ocultar la página.

El guardado usa la cola existente de IndexedDB, los identificadores de operación y la revisión del documento. La reconexión confirma las operaciones y descarga la versión del backend. Un conflicto no sobrescribe otra edición. Las claves del borrador se aíslan por negocio, sucursal y usuario. El inventario continúa usando el modal existente, con costo por porción y precio final completados.

## Archivos y comprobación

- `operational/jespresso-engine.js`: cálculo puro y validación.
- `operational/jespresso.js` y `jespresso.css`: hoja editable, historial, biblioteca y exportación.
- `database/ords/jespresso.sql`: validación y cálculo independiente en el servidor; se instala antes de `costing.sql`.
- `node scripts/import-jespresso.mjs`: reconstruye la librería y la referencia de pruebas desde el XLSX original, usando PowerShell/.NET para leerlo.
- `npx vitest run tests/jespresso.test.ts`: recorre todos los renglones y variantes y protege las fórmulas del primer negocio.
- `npx playwright test tests/browser/jespresso.spec.ts`: edición, varios borradores, inventario, eliminación, móvil y desconexión con confirmación perdida.
- `npx tsx scripts/test-jespresso-live.ts`: verifica las 31 recetas contra el backend con un negocio temporal y lo retira al terminar. `--install` actualiza únicamente los dos paquetes de costeo antes de probar.
