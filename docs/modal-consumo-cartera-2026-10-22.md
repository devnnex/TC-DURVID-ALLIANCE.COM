# Consumo y cartera: distribución y validaciones

Cambios compartidos por Coctelería, Cafetería, GCOBARF y Sucursal.

- En escritorio (900 px o más), el modal muestra permanentemente el consumo registrado a la izquierda, incluso si está vacío. El panel de trabajo conserva cliente, fecha acordada, productos, selección y confirmación. En móvil se conserva el desglose desplegable y la disposición vertical.
- Agregar a cartera combina la cuenta existente y la selección nueva. También funciona sin productos nuevos. Solo se libera la cuenta después de que el registro queda aceptado por la capa persistente existente.
- Si falta cliente o fecha, el aviso aparece dentro del modal y el campo recibe foco. La fecha vacía tiene una animación breve, respetando la preferencia de movimiento reducido.
- Todo cliente registrado en Clientes y cartera recibe crédito, también los registros antiguos. El cupo es opcional: cero indica sin límite. Se respeta el cupo positivo y la inhabilitación; seleccionar un cliente no genera deuda hasta confirmar Agregar a cartera.
- La ficha del cliente usa un modal más ancho y un acuerdo de pago verde. El botón Pagar / abonar siempre está visible para usuarios con permiso de cobro; queda deshabilitado y explicado cuando no hay deuda.
- El cobro de cartera permite pagar todo o escribir un abono menor. Distribuye centavos por vencimiento entre cuentas abiertas y conserva el saldo pendiente, medios de pago, recibido/cambio e impresión del flujo existente. No registra nuevamente la venta ni descuenta inventario.
- Se mantiene el contrato customer_payment, los identificadores idempotentes, la verificación expectedPaid y la cola offline existentes. No se modifica el esquema ni se despliega SQL para estos cambios.

## Verificación

Pruebas de navegador cubren los cuatro negocios, cuenta vacía, cuenta existente sin selección nueva, fecha requerida, ficha amplia, cliente de contado, cobro completo, abono mixto parcial, operación offline, recarga y reintento sin duplicados. La prueba real aislada scripts/test-credit-selection-live.ts comprueba registro de varios productos, cuenta existente y abono parcial contra el backend, y elimina su negocio temporal al terminar.

Resultado: compilación y tipos correctos; 125 pruebas unitarias y 32 escenarios distintos de navegador aprobados (27 de consumo/cartera y 5 de rendimiento; 7 escenarios se repitieron después del ajuste final). La prueba real aislada también aprobó. La recarga preparada midió 605 ms en esta ejecución; esta medición local no representa una garantía de latencia de red. Fuente y dist coinciden para los ocho archivos funcionales editados.
