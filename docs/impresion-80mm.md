# Impresión operativa de 80 mm

Coctelería y Cafetería permiten imprimir la comanda desde **Inicio → Ver pedido → Imprimir comanda**. La comanda conserva mesa, identificador, fecha de Colombia, mesero, cantidades y observaciones. Antes de aceptar el pedido indica “Pendiente de aceptación”; imprimir no acepta la comanda, no agrega consumos ni modifica inventario. La opción también está disponible al abrir una preparación aceptada.

Las prefacturas de Cuentas y del diálogo de cobro se identifican como **PREFACTURA / CUENTA POR PAGAR**, sin marcar el consumo como pagado. El comprobante de cobro conserva productos, descuentos, impuestos, propina elegida, medios de pago, efectivo recibido y cambio. Los abonos de cartera mantienen su identificación al reimprimir desde Ventas. No se modificaron reglas de cobro, recetas, inventario ni permisos.

`operational/printing.js` genera documentos locales sin descargar fuentes ni imágenes. Reutiliza una única ventana por pestaña, elimina temporizadores y eventos del documento anterior y evita que una tarea antigua dispare una impresión nueva. La apertura no espera consultas de red. El tamaño de página tiene 80 mm de ancho y altura calculada según el documento, con 4 mm de margen interior (72 mm útiles). Hay botones para reimprimir y cerrar; cancelar el diálogo nativo no repite operaciones. Si un cobro se guarda pero el navegador bloquea o cierra la ventana, se ofrece su comprobante para reintentar sin cobrar de nuevo.

La impresora se selecciona en el diálogo del navegador. Configurar rollo de **80 mm**, escala **100 %** y desactivar encabezados/pies del navegador. El sistema no instala controladores ni puede confirmar que el papel salió físicamente. En este entorno se verificaron navegador y PDF; la prueba física queda pendiente de una impresora térmica conectada.

## Validación

`tests/browser/thermal-printing.spec.ts` cubre en ambos negocios:

- Comandas pendientes y aceptadas, tanto desde Inicio como desde el módulo de preparación.
- Prefacturas desde Cuentas y desde el cobro; generación de PDF con ancho real de 80 mm.
- Cobro e impresión con efectivo, propina y cambio; transferencia, Bre-B, tarjeta y pago mixto.
- Ventanas bloqueadas, reintentos, botón de reimpresión y acceso con clic derecho, comprobando que no duplican ventas ni descuentos de inventario.
- Abonos de cartera y su reimpresión desde Ventas; cierre de caja.
- Exportaciones PDF de inventario, QR individual y varios QR, conservando sus tamaños originales.
- Uso sin conexión, nombres y observaciones largos, texto escapado y 40 documentos consecutivos en una única ventana, sin impresiones antiguas pendientes.

Las llamadas a `window.print()` se interceptan en las pruebas para no abrir el diálogo del sistema. Los PDF se generan con Chromium y se comprueba su ancho. Las imágenes de `docs/printing-examples/` son capturas de los documentos reales, con datos ficticios de prueba; no son facturas fiscales emitidas ni cobros reales. `scripts/preview-thermal-print.ts` monta las dos láminas a partir de esas capturas.
