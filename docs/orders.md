# Pedidos del mesero y turno en Ventas

## Enviar una comanda

1. Abre el portal principal y elige **Mesero · Tomar pedidos**.
2. Selecciona el negocio donde trabajarás e inicia sesión con tu cuenta. El jefe debe asignarte acceso y permiso para registrar consumos.
3. Elige la mesa, toca los productos y ajusta sus cantidades. Añade observaciones si hacen falta.
4. Pulsa **Enviar comanda a Inicio**. Puedes seguir su estado en Mis últimas comandas.

Cada sucursal tiene su pantalla de pedidos. La plantilla de sucursales adicionales conserva el parámetro branch al pasar entre el panel y la vista del mesero. Una cuenta no puede enviar pedidos a una sucursal que no tenga asignada. Los datos de demostración se guardan aparte de Oracle.

## Atender desde Inicio

Las comandas pendientes permanecen guardadas en el negocio hasta que un usuario autorizado las atiende. **Ver pedido** abre la mesa, productos, cantidades, precios, observaciones y responsable.

**Aceptar y agregar a la mesa** abre su cuenta si hace falta o utiliza la cuenta abierta que se revisó. Agrega los consumos y crea su preparación en una sola operación. Antes de aceptar no agrega consumos ni genera cobros. **Rechazar pedido** conserva el registro del rechazo y no agrega productos.

Preparación y entrega aparecen dentro de Inicio. Cocina marca la comanda lista; el mesero confirma que fue entregada. El responsable de cocina puede atender comandas sin recibir las otras cuentas ni el turno si no tiene esos permisos. El jefe puede ver la operación completa. Se conservan quien tomó el pedido, quien lo aceptó y quien actualizó su preparación o entrega.

Si dos equipos intentan atender el mismo pedido, Oracle verifica su estado dentro de la transacción. Un reintento no vuelve a sumar consumos. Si la cuenta cambió, el precio se actualizó durante una desconexión o el pedido fue rechazado en otro equipo, se conserva el intento y se muestra la revisión correspondiente.

## Turno y saldo base

En **Ventas → Registrar turno**, escribe el nombre de la jornada, hora de inicio, hora de fin y saldo base real. Si la hora final es anterior a la inicial, el horario corresponde a una jornada que cruza medianoche. El registro también conserva la fecha y hora reales de apertura y al usuario autenticado.

El turno es compartido por la sucursal: no se crea uno por cada empleado. Desde **Ver turno y cierre** puedes consultar la base, registrar entradas o retiros y cerrar con el efectivo contado. Los cobros en efectivo, abonos y pagos a proveedores se concilian con esa misma jornada. El cierre conserva su responsable y las diferencias. La base no se suma como venta.

El resumen de medios de pago muestra Efectivo, Transferencia y Bre-B. Los demás medios siguen conservados en cada venta y en cartera; retirar sus tarjetas del resumen no borra datos ni altera totales.

## Sin internet y actualización entre equipos

El equipo debe abrir su cuenta y sucursal con conexión una vez para descargar sus datos. Las comandas y sus cambios se guardan localmente y usan la misma cola de sincronización que las ventas. Un pedido creado sin internet permanece en ese equipo hasta que se envíe: otro dispositivo no puede recibirlo mientras no haya comunicación.

Cuando hay conexión y la pantalla está visible, Inicio y la vista del mesero consultan cada dos segundos una versión pequeña de las comandas. Solo descargan el estado actualizado cuando esa versión cambia. El envío local empieza inmediatamente y los pendientes solo se retiran después de confirmarlos. [Más sobre trabajo sin conexión](offline.md).

El menú conserva Costeo, Insumos y compras y Clientes y cartera; Cocina y Caja se integran en Inicio y Ventas. El código de sus recorridos anteriores se conserva para compatibilidad. El enlace del Asistente IA y su clave de navegación están comentados; sus funciones y datos permanecen para una futura reactivación.
