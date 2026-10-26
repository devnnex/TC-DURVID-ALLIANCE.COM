# Comparación con la propuesta comercial

Documento revisado: **COCTELERIA CAFETERIA BAR & OTRO COTIZACIÓN Y PROPUESTA DE DESARROLLO DE SOFTWARE.pdf**, 9 páginas, fechado el 26 de septiembre de 2026. El PDF permanece intacto. Esta revisión distingue el alcance funcional de las condiciones comerciales; no modifica pagos, soporte ni acuerdos entre las partes.

| Requerimiento de la propuesta | Evidencia inicial en el sistema | Complemento necesario para cerrar el recorrido |
| --- | --- | --- |
| Acceso móvil y multisede (p. 2, 8) | Portal, logins, paneles y centro del jefe responsive; API central Oracle con permisos por sucursal | Verificar cada formulario nuevo en móvil y conservar el alcance del usuario |
| Ventas, consumos y pagos (p. 2–3) | Mesas, venta individual, cobro mixto, recibos y venta transaccional con idempotencia | Integrar caja, cliente y cartera con la venta existente |
| Inventario y movimientos (p. 2–3) | Existencias de productos, compras simples, ajustes, movimientos y responsable | Existencias de materias primas y ledger de consumo por receta |
| Descuento simultáneo de ingredientes (p. 2–3) | Recetas y costeo guardados en Oracle; la venta descuenta productos terminados | Vincular receta al producto vendible, convertir unidades, validar insumos y descontarlos atómicamente; conservar el costo de cada venta |
| Compras, inversión, mermas y proveedores (p. 3, 8) | Historial de entradas y costos por producto | Proveedores, documentos de compra, precios históricos por proveedor, pagos y saldos pendientes |
| Precios y márgenes (p. 2) | Costeo guiado, margen/recargo, impuestos, canales, práctica y Excel | Mantener el costeo independiente y permitir reutilizar su receta en la operación |
| Trazabilidad por usuario (p. 3) | Seguimiento, auditoría, autores de costeo y productos aprobados | Extender la misma trazabilidad a compras, cocina, cartera y caja |
| Comandas y observaciones; mesero y cocina (p. 8) | Consumos por mesa y chat; rol de mesero y plantilla de cocina | Enviar una comanda con notas, actualizar preparación y entrega, e imprimirla |
| Clientes y fidelización (p. 8) | Nombre del pagador en la cuenta | Ficha de cliente, consentimiento de contacto, historial de compras y visitas, sin inventar un programa de puntos |
| Cartera (p. 8) | El cobro actual exige el total pagado | Crédito habilitado expresamente por cliente, vencimiento, saldo y abonos; distinguir deuda de ingreso recibido |
| Cierre de caja, ventas, costos y proveedores (p. 8) | Reportes de ventas y medios de pago | Apertura, entradas/retiros, efectivo esperado, conteo real, diferencia e historial de cierres |
| Operación sin internet y sincronización (p. 2, 8) | PWA y catálogo offline; demostración local; POS real requiere red para diversas escrituras | Persistir eventos del POS en IndexedDB, recuperar después de cerrar, sincronizar con el mismo identificador y mostrar conflictos sin perder la operación |
| Impresión desde varios dispositivos (p. 2) | Recibo térmico mediante el diálogo del navegador | Reutilizar el diálogo para comanda y cierre; ensayar impresora física durante aceptación |

No se declara cumplimiento por la presencia de un botón o una tabla. Cada recorrido debe operar de extremo a extremo y contar con pruebas de persistencia, permisos, reintentos y aislamiento. Los datos de demostración permanecen separados de los datos reales.

## Criterios de aceptación

1. Comprar insumos a un proveedor, consultar su precio histórico y registrar un abono sin alterar la compra original.
2. Vincular una receta a un producto, venderlo y comprobar todas las salidas y el costo histórico. Un reintento debe producir una sola venta.
3. Enviar una comanda desde una mesa con observaciones y atenderla desde una cuenta de cocina.
4. Registrar un cliente, consultar sus consumos y habilitar crédito únicamente por decisión autorizada; cobrar un abono y conciliar el saldo.
5. Abrir caja, cobrar en varios medios, registrar entrada/retiro y cerrar comparando el efectivo esperado con el contado.
6. Repetir la operación sin red, cerrar/reabrir el navegador y sincronizar; los pendientes y conflictos deben permanecer visibles y no duplicar movimientos.
7. Usar estos recorridos desde móvil y escritorio y revisar recibo, comanda y cierre en una impresora real.

El ensayo de hardware, las cantidades y recetas reales del negocio, y la aprobación operativa del cliente forman parte de la aceptación: no se sustituyen por datos de ejemplo.

## Complementos implementados

Se añadieron Insumos y compras, preparación de comandas, Clientes y cartera y turnos al mismo panel de todas las sucursales. Las comandas se integran ahora en Inicio y el turno con su base y cierre se maneja desde Ventas; Cocina y Caja no agregan enlaces al menú lateral. Se conservaron Inicio, mesas, cuentas, inventario, movimientos, ventas, costeo, usuarios, identidad visual y exportaciones anteriores. Los formularios usan ayudas, valores COP y diseños adaptados a pantallas pequeñas.

Las compras conservan proveedor, cantidad, rendimiento, precio original y abonos; sirven para insumos y productos terminados. La receta del costeo puede vincularse al producto vendible. La venta preparada descuenta los ingredientes en una sola transacción y congela su costo; el catálogo de costeo no inventa existencias. Las comandas conservan producto, observaciones, quién las envió y quién las preparó; preparación y entrega respetan los permisos. Clientes conserva consentimiento, compras, visitas, crédito autorizado, vencimientos y abonos. Caja separa efectivo de transferencias, tarjetas y crédito, y conserva sus cierres y conteos revisados. Ventas separa crédito del dinero recibido y calcula ganancia de productos sin sumar impuestos ni propinas.

La cola persistente del panel permite continuar el turno, reabrir y reconectar. Los reintentos tienen el mismo identificador; las diferencias quedan visibles y una revisión conserva el intento anterior. Tras confirmar pendientes se descarga el estado de Oracle con los cambios de los demás equipos. Ver [guía sin internet](offline.md) y [validación](validation.md).

## Pendiente para aceptación del cliente

- Cargar cantidades, costos, recetas, clientes, proveedores y saldos reales. Los ejemplos no certifican los números del negocio.
- Realizar un turno de aceptación con sus usuarios, equipos e impresoras; revisar recibo, comanda y cierre físico.
- Publicar el frontend mediante el workflow de GitHub Pages cuando el usuario decida hacerlo. La API Oracle ya atiende los paneles; no se publica ningún secreto.
- Verificar capacitación, soporte y condiciones comerciales con el cliente. No se modifica el acuerdo del PDF.


Actualización del 12 de octubre: el mesero elige su negocio en el portal e inicia sesión antes de enviar comandas. La aceptación agrega consumos y preparación de forma atómica; el rechazo conserva su seguimiento sin agregar productos. El Asistente IA permanece comentado. [Recorrido fácil de comandas y turnos](orders.md).
