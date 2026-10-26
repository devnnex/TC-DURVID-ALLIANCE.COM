# Costeo por sucursal · 20 de octubre de 2026

La pantalla principal conserva la distribución de la hoja de cálculo: compras del lote, gastos del mes y cantidades realmente producidas. La tabla de producción real ocupa todo el ancho. El panel separado de precio, margen y análisis mensual ya no aparece.

## Usar la hoja

1. Selecciona un producto o pulsa **Nuevo producto**. Sus insumos, cantidades y rendimiento se editan en la misma pantalla.
2. Registra las compras. La fecha se asigna al registrar un insumo nuevo, con la hora de Colombia. Editar un registro anterior conserva su fecha; si una compra antigua no tenía fecha, no se inventa una.
3. La tabla muestra **Fecha compra, Insumos, Cantidad usada, Unidad, Valor y Editar**. La factura anterior se conserva en los datos, aunque ya no ocupa una columna.
4. Completa la cantidad producida y, por separado, los gastos y el volumen mensual.
5. Pulsa **Guardar hoja de producción**. Las hojas guardadas aparecen debajo y en **Historial**. **Ver y editar hoja** selecciona el producto y sube al editor; **Eliminar producto** retira la receta y sus gastos exclusivos, manteniendo los insumos compartidos y las demás recetas.

Cerrar el editor de un producto nuevo conserva su borrador y la hoja anterior. Cambiar de producto conserva sus cantidades pendientes. El historial muestra la última información guardada; no sustituye una hoja confirmada por un formulario incompleto. Las aprobaciones antiguas y su auditoría siguen almacenadas.

## Cálculos

El costo de producción usa ingredientes aprovechables, conversiones compatibles, merma y costos directos. El reparto mensual se presenta como referencia separada y no aumenta el mínimo de venta de la hoja. Las recetas actuales anteriores se normalizan a esta base de producción; las aprobaciones históricas mantienen sus datos originales.

El mínimo se redondea hacia arriba al peso e incluye las comisiones y el tratamiento de impuestos configurados. El sugerido conserva el objetivo definido en la receta. Ninguno garantiza cubrir todos los gastos del negocio: depende también del volumen y de los demás productos vendidos. No se inventan volúmenes ni se fija un precio universal de $5.000.

Ejemplo de prueba: $549.600 / 204 = $2.694,117647 de producción por unidad. Sin comisiones ni impuesto, el mínimo es $2.695; con meta de margen del 50 %, el sugerido es $5.389. Los gastos mensuales de $641.000 divididos entre 50 se muestran aparte; no se usan para sugerir $31.029.

## Merma

- **Editar insumo → Ajustes de pérdida e impuestos → ¿Qué porcentaje puedes usar?**: un rendimiento del 90 % representa 10 % de pérdida de esa compra.
- **Editar producto → Más detalles de la receta → Pérdida al preparar (%)**: pérdida adicional de preparación. No repetir la ya incluida en el rendimiento del insumo.
- **Insumos y compras → Insumos → Entrada / merma** registra pérdidas físicas de inventario, con fecha y responsable; es un movimiento distinto del porcentaje usado para costear.

## Inventario y Excel

Las fichas guardadas conservan **Agregar al inventario**. Se completan nombre, variante, categoría, costo de producción y precio; solo se piden existencia y stock mínimo. El impuesto adicional se incluye una sola vez. Las categorías se resuelven dentro de la sucursal y no se crean hasta confirmar el producto.

La descarga XLSX conserva valores numéricos y el detalle de ingredientes, recetas, gastos y canales. La presentación COP usa pesos completos y las cantidades mostradas se redondean; los cálculos mantienen su precisión interna.

## Persistencia

Se reutilizan el guardado auditado, las revisiones de concurrencia y la cola existente de sincronización. La demostración mantiene datos locales separados por sucursal. La confirmación visible distingue entre guardado local pendiente y datos enviados; una falla no elimina el borrador. Las credenciales no forman parte de los formularios persistidos.
