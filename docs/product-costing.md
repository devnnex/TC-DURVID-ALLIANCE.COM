# Costeo por sucursal · 20 de octubre de 2026

La pantalla principal conserva la distribución de la hoja de cálculo: compras del lote, gastos del mes y cantidades realmente producidas. La tabla de producción real ocupa todo el ancho. El panel separado de precio, margen y análisis mensual ya no aparece.

## Usar la hoja

1. Selecciona un producto o pulsa **Nuevo producto**. Sus insumos, cantidades y rendimiento se editan en la misma pantalla.
2. Registra las compras. En GCOBARF, la fecha se asigna automáticamente al guardar un insumo nuevo o cualquier edición, según el día actual de Bogotá. No se introduce manualmente.
3. La tabla muestra **Fecha compra, Insumos, Cantidad usada, Unidad, Valor y Editar**. La factura anterior se conserva en los datos, aunque ya no ocupa una columna.
4. Completa la cantidad producida y, por separado, los gastos y el volumen mensual.
5. Pulsa **Guardar hoja de producción**. Las hojas guardadas aparecen debajo y en **Historial**. **Ver y editar hoja** selecciona el producto y sube al editor; **Eliminar producto** retira la receta y sus gastos exclusivos, manteniendo los insumos compartidos y las demás recetas.

Cerrar el editor de un producto nuevo conserva su borrador y la hoja anterior. Cambiar de producto conserva sus cantidades pendientes. El historial muestra la última información guardada; no sustituye una hoja confirmada por un formulario incompleto. Las aprobaciones antiguas y su auditoría siguen almacenadas.

## Cálculos

El costo de producción usa ingredientes aprovechables, conversiones compatibles, merma y costos directos. El reparto mensual se presenta como referencia separada y no aumenta el mínimo de venta de la hoja. Las recetas actuales anteriores se normalizan a esta base de producción; las aprobaciones históricas mantienen sus datos originales.

El mínimo se redondea hacia arriba al peso e incluye las comisiones y el tratamiento de impuestos configurados. El sugerido conserva el objetivo definido en la receta. Ninguno garantiza cubrir todos los gastos del negocio: depende también del volumen y de los demás productos vendidos. No se inventan volúmenes ni se fija un precio universal de $5.000.

Ejemplo de prueba: $549.600 / 204 = $2.694,117647 de producción por unidad. Sin comisiones ni impuesto, el mínimo es $2.695; con meta de margen del 50 %, el sugerido es $5.389. Los gastos mensuales de $641.000 divididos entre 50 se muestran aparte; no se usan para sugerir $31.029.

## Merma

- **Configurar merma**, junto al ingrediente de la hoja, aplica descongelación, limpieza y cocción según su estado. La merma pertenece a esa preparación; no se suma otra pérdida en el catálogo ni en el producto.
- **Cerrar** o Escape conserva un borrador de merma por receta e ingrediente. **Cancelar** descarta ese borrador y **Guardar y aplicar merma** confirma los porcentajes.
- **Insumos y compras → Insumos → Entrada / merma** registra pérdidas físicas de inventario, con fecha y responsable; es un movimiento distinto del porcentaje usado para costear.

## Hoja de GCOBARF

En GCOBARF, el menú **Macro de insumos** abre la macro junto a **Historial**; los controles de productos para vender quedan ocultos y conservados en el código. Al crear o editar un insumo se registra el valor total de las existencias. La tarjeta muestra el costo por su unidad guardada y el valor de las existencias. Ejemplo: 500 bolsas por $55.000 cuestan $110 cada una. Las nuevas entradas conservan el costo promedio ponderado de lo disponible.

**Todos los insumos** ordena alfabéticamente las tarjetas disponibles y deja al final las que no tienen existencias, también en orden alfabético. Los otros filtros conservan su orden habitual. El aviso de existencias bajas se muestra rojo.

La hoja de GCOBARF permite elegir **Fecha de producción** junto a **Día de producción**. Se propone la fecha actual de Bogotá para una hoja sin fecha; al guardar se conserva dentro del producto (`productionDate`), de forma independiente de las fechas de sus ingredientes y de los demás productos. **Productos guardados** muestra la fecha confirmada en cada tarjeta y **Ver y editar hoja** recupera la fecha de ese producto. Las hojas antiguas sin fecha siguen disponibles y sus tarjetas no reciben una fecha hasta volver a guardarlas. La tabla **Compras para esta producción** omite la columna de fecha y ajusta sus filas y total; el Excel exportado incluye la fecha en **Produccion real**. Las fechas inválidas se rechazan tanto en el navegador como en Oracle.

Cada tarjeta incluye un lápiz junto al nombre. Permite cambiar el nombre del producto sin cambiar su identificador, fecha ni sus ingredientes; la variante se conserva. Cancelar conserva el nombre anterior.

En **Producción mensual** se selecciona mes y año. El total suma la producción real de las hojas guardadas cuya fecha pertenece a ese mes, sin contar las hojas sin fecha ni los cambios pendientes de guardar. Volver a guardar una hoja actualiza su contribución, sin duplicarla; cambiar su fecha la mueve al mes correspondiente. El total y el número de hojas aparecen junto al selector. Oracle vuelve a calcular el total al guardar. Los gastos mensuales se dividen por esa producción; si el mes no tiene hojas guardadas, el costo mensual queda pendiente.

Las columnas **Peso inicial** y **Peso final** pertenecen a cada ingrediente de la hoja. La merma es `inicial - final` y su porcentaje es `(inicial - final) / inicial × 100`, en la misma unidad de la línea. El costo del ingrediente y su consumo en la receta vinculada a la macro usan el peso inicial (`initialQuantity`); el peso final se guarda como `quantity`. Así, 1 kg inicial y 0,8 kg final representan 0,2 kg y 20 % de pérdida, con un consumo de 1 kg. Se admite peso final cero y se rechaza un final mayor al inicial. **Configurar merma** conserva el editor manual: sus porcentajes ajustan el peso final manteniendo el inicial. Las recetas anteriores conservan su costo y consumo al adoptar las dos columnas. Los demás negocios conservan su cálculo habitual de mermas.

La unidad elegida al crear el insumo se conserva: tanto **Editar** como **± Cantidad** la muestran bloqueada. No se convierte silenciosamente un registro de kg a gramos o a unidades. El historial conserva altas, ediciones, entradas, retiros y eliminaciones con los valores anteriores y nuevos, el usuario autenticado y la fecha; permite buscar y filtrar por usuario, acción y fechas. Los movimientos anteriores se muestran cuando esos registros históricos están disponibles.

En **Agregar insumo** o **Editar** de la hoja se puede seleccionar **Insumo de la macro**. El ingrediente vinculado adopta la unidad guardada en la macro y la muestra bloqueada en el editor. La columna **Unidad** usa esa misma medida. Los pesos de hojas anteriores se convierten a esa unidad conservando las cantidades físicas y el porcentaje de merma: 500 g iniciales y 400 g finales pasan a 0,5 kg y 0,4 kg si la macro utiliza kg. Oracle aplica la misma conversión al guardar o consultar la hoja actual. El precio de compra se obtiene de su costo unitario actual. Usar 20 bolsas de $110 cuesta $2.200. La actualización del precio de la macro conserva la cantidad utilizada en la receta. La consulta de una ficha aprobada histórica mantiene sus valores originales.

La producción real se puede desglosar en filas con nombre y cantidad, usando **Agregar cantidad de producción**. El total es la suma de esas filas, incluidas cantidades cero: Pollo 191 + Mixta 0 + Carne 57 = 248. El precio estimado por unidad es **Total compras ÷ Total producción real**, como `H16/F30` en el Excel: $610.931 ÷ 248 = $2.463,4314516129034. La proyección de 230 no reemplaza la producción real. El costo mensual por unidad sigue siendo gastos mensuales ÷ producción mensual y se suma aparte como referencia. Los cálculos conservan los decimales y no cambian las cantidades usadas de los ingredientes al editar la producción real.

La **X** junto a **Editar** quita únicamente ese ingrediente de la hoja abierta, confirma la acción y recalcula sus totales. El catálogo, las demás recetas y la producción real se conservan. El desglose de producción y la eliminación se guardan también en Oracle; las hojas anteriores siguen usando su producción guardada hasta que se editen.

**Nuevo producto** crea una hoja con la tabla de compras vacía. **Agregar insumo** incorpora únicamente la compra registrada. Tanto al crear como al editar, el formulario muestra la fecha actual de Bogotá y vuelve a calcularla al guardar; esa fecha queda registrada en la columna **Fecha compra**. El botón separado **Editar producto** está comentado; las hojas guardadas se abren con **Ver y editar hoja**, que selecciona el producto y lleva el foco al comienzo de su hoja.

La edición de un insumo permite corregir nombre, compra y unidad. En la hoja abierta, corregir la unidad actualiza la fila con la cantidad y unidad ingresadas. En otras recetas, las unidades compatibles conservan la conversión física; al cambiar entre peso, volumen y unidades se corrige la presentación de compra: por ejemplo, 1.000 g de una compra en kg pasa a 1 unidad si esa compra se corrige a unidades. No se introduce una equivalencia física entre kg y unidades. Se conserva la merma de cada línea y se recalculan los importes con la compra corregida.

**Aplicar edición** toma siempre los valores visibles del formulario y actualiza la fila de la hoja abierta y su borrador, aunque no se haya escrito nada. Por ejemplo, si el editor ya muestra 500 por $55.000 y la fila todavía muestra 600, basta con aplicar para dejar 500 y $55.000 en la fila. No hace falta guardar un valor provisional ni volver a escribir el dato. El comportamiento se aplica a cualquier insumo; las cantidades usadas de otras recetas se conservan. También se puede cambiar la cantidad usada directamente en la fila y guardar la hoja.

GCOBARF usa siempre **Personas** en Inicio y conserva **Clientes y cartera**. Sus accesos a Mesas, Atender mesa y Cuentas están comentados; las secciones se conservan inactivas dentro de `template[data-gcobarf-suspended]`. Para reactivarlas se deben restaurar los enlaces, retirar esos contenedores `template` y desactivar `personsOnly` en su `config.js`.

## Inventario y Excel

Las fichas guardadas conservan **Agregar al inventario**. Se completan nombre, variante, categoría, costo de producción y precio; solo se piden existencia y stock mínimo. El impuesto adicional se incluye una sola vez. Las categorías se resuelven dentro de la sucursal y no se crean hasta confirmar el producto.

La descarga XLSX conserva valores numéricos y el detalle de ingredientes, recetas, gastos y canales. La presentación COP usa pesos completos y las cantidades mostradas se redondean; los cálculos mantienen su precisión interna.

## Persistencia

Se reutilizan el guardado auditado, las revisiones de concurrencia y la cola existente de sincronización. La demostración mantiene datos locales separados por sucursal. La confirmación visible distingue entre guardado local pendiente y datos enviados; una falla no elimina el borrador. Las credenciales no forman parte de los formularios persistidos.
