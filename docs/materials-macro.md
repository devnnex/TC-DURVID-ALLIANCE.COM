# Macro de insumos

Disponible en **Inventario → Macro de insumos** para los cuatro negocios. GCOBARF utiliza su hoja de producción y los demás sus hojas de recetas. La merma por ingrediente se explica en [Merma y rendimiento](ingredient-yield.md).

## Vincular una receta

Al agregar una hoja guardada al inventario se elige cuántas porciones representa una unidad vendida y el insumo de la macro correspondiente a cada ingrediente. Varias recetas pueden compartir el mismo insumo. También se puede usar **Vincular receta** para un producto existente.

Las cantidades del lote se dividen por las porciones producidas; las adiciones por porción se conservan. Ambas se multiplican por las porciones de una unidad vendida. Peso, volumen y unidades se convierten dentro de su propia dimensión. Ejemplo: 75 g de salsa para 8 porciones descuentan 9,375 g por porción.

Los insumos creados al vincular una receta comienzan con existencia cero. Al crear un insumo manualmente puedes indicar su existencia inicial. **Editar** reutiliza el mismo formulario y completa nombre, unidad, existencia física actual y alerta con los últimos datos guardados. La cantidad representa el nuevo total: guardar 800 cuando había 1000 registra una corrección de −200, conservando el costo unitario y las reservas. Una versión desactualizada no sobrescribe cambios de otro equipo; la revisión permite confirmar el conteo sobre la existencia del backend. **± Cantidad** permite registrar entradas o retiros, con motivo opcional y costo total de entrada para calcular el costo promedio. Sin motivo se conserva una descripción del tipo de movimiento y su responsable. Un insumo ligado a un producto no se puede eliminar; los insumos independientes se archivan conservando su historial.

## Consumos, ventas y cancelaciones

Los consumos de cuentas abiertas reservan ingredientes: la macro muestra existencia física, cantidad comprometida y disponible. Al cobrar o enviar la cuenta a cartera se registra el descuento físico una sola vez y se cierra la reserva. Retirar o cancelar un consumo libera su reserva; anular una venta devuelve lo descontado.

La selección valida los insumos disponibles y ofrece abrir la macro resaltando el faltante. El backend vuelve a validar bajo el bloqueo de la sucursal, incluyendo las reservas de otras cuentas. Los productos vinculados muestran disponibilidad calculada a partir de sus ingredientes.

Guardar cambios en una receta actualiza sus vínculos existentes cuando las correspondencias siguen completas. Si hay ingredientes nuevos o consumos abiertos, se conserva el vínculo vigente y se solicita revisarlo en la macro; no se reinterpretan consumos ya tomados.

## Sin conexión

Se utiliza la cola durable existente, con el mismo identificador al reintentar. Los cambios sobreviven a una recarga y las confirmaciones perdidas no repiten movimientos. Al reconectar, el backend valida y confirma cada operación. Si dos equipos sin conexión comprometen el mismo último insumo, el conflicto se conserva para revisión: ningún equipo puede conocer las operaciones aún no sincronizadas del otro.

## Verificación

`tests/materials.test.ts` valida conversiones, porciones, reservas, descuentos, protección de vínculos e idempotencia. `tests/browser/materials.spec.ts` cubre el flujo de interfaz, abastecimiento sin conexión y móvil. `scripts/test-materials-live.ts --install` compila los paquetes afectados y prueba el circuito real con un negocio temporal aislado que se elimina al finalizar.
