# Impresión y documentos

Referencia existente: `thermalReceiptHtml` y ventana `window.print()` en app.js; imprime consumos/cobros con coste y pagos del flujo antiguo. Se conserva.

Próxima fase: PrintingService desacoplado; PrintJob persistente con tipo, venta, impresora, estado y reintentos. Layout 58 mm, 80 mm, A4/PDF y diálogo navegador; reimprimir no repite venta. KitchenTicket y CashRegisterReport son documentos separados. Confirmación de diálogo no prueba recepción física: estado enviado vs confirmado según driver.

ElectronicInvoicingProvider se diseña como adaptador posterior. Recibo POS se identifica como RECIBO DE VENTA; no se rotula FACTURA ELECTRÓNICA sin respuesta fiscal del proveedor. Esta entrega no hace afirmaciones de cumplimiento fiscal ni emite documentos nuevos.
