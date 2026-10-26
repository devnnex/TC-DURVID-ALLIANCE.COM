# Cartera y comandas

Los cuatro negocios usan el mismo flujo; los datos y permisos siguen separados por sucursal.

- Seleccionar un cliente en Agregar consumo no crea una deuda. Solo Agregar a cartera del cliente registra el crédito, con fecha acordada, productos y responsable. Incluye los consumos que ya estaban en esa cuenta y la nueva selección; libera la mesa o persona al confirmar.
- La fecha se sugiere a partir de la próxima fecha acordada de una deuda todavía pendiente del mismo cliente. Puede cambiarse antes de confirmar.
- Pagar en la ficha del cliente abre el mismo modal de cobro. Se puede elegir efectivo, transferencia, Bre-B, tarjeta o pago mixto, consultar precuenta e imprimir el recibo. Cuentas por cobrar muestra inicialmente las que vencen hoy o ya vencieron; el filtro permite ver fechas futuras o cuentas pagadas.
- El cobro de cartera genera un recibo separado: reduce el saldo y registra el medio de pago y el responsable. No vuelve a vender los productos ni a descontar existencias. Ejemplo: una venta a crédito de $7.000 genera $7.000 de venta y deuda; cobrar después $7.000 deja deuda cero y dinero recibido $7.000, manteniendo la venta total en $7.000.
- Ventas permite filtrar estos recibos como Pagos de cartera. Los indicadores de venta y utilidad excluyen recibos de cartera; los medios de pago sí incluyen el dinero recibido por ellos. No se puede anular la venta original si ya tiene abonos.
- Eliminar una comanda retira solo sus líneas. Quitar consumos actualiza su preparación. Cuando no queda ningún consumo activo, se libera la cuenta y desaparece la preparación pendiente. Las cuentas ya cobradas no pueden perder consumos mediante este flujo.

## Sincronización

Las acciones nuevas usan la cola persistente por usuario y sucursal. Cada pago tiene un identificador estable, saldos esperados y distribución por deuda; la base valida todo dentro de una transacción. Los reintentos no duplican recibos, abonos ni efectivo. Si otro dispositivo ya cambió una deuda, se conserva el registro para revisión en lugar de volver a cobrarla automáticamente. Tras confirmar los pendientes se vuelve a descargar el estado del servidor.

Sin conexión entre dispositivos, el equipo emisor conserva los pedidos hasta recuperar conectividad; no se promete entrega entre equipos aislados.

## Validación

- Unitarias: tests/credit-lifecycle.test.ts.
- Navegador: tests/browser/credit-lifecycle.spec.ts, costing-inventory.spec.ts y waiter-orders.spec.ts.
- Base real con negocio temporal y limpieza final: scripts/test-credit-lifecycle-live.ts.
- La instalación incluye database/ords/customer_payments.sql a través de scripts/install-ords.ts.
