# Estadísticas de ventas

Coctelería, Cafetería y GCOBARF tienen un acceso **Estadísticas** en la cabecera de Ventas. Abre un análisis independiente y **Volver a ventas** recupera el listado y sus filtros. El análisis comienza con este año hasta hoy; permite Hoy, 7 días, 30 días, este mes, este año y fechas específicas. Siempre incluye todos los tipos de venta y medios de pago; no hereda silenciosamente una búsqueda o filtro del listado.

Los botones Estadísticas, Exportar, Actualizar y Eliminar todo permanecen en una sola fila, con altura uniforme. En pantallas pequeñas la barra permite desplazamiento horizontal sin extender el ancho de la página. En GCOBARF se analizan facturas de venta, no citas o entregas pendientes; los abonos mantienen su tratamiento separado.

## Cinco vistas

- **Resumen:** indicadores, evolución mensual, productos destacados, categorías y actividad de cobro.
- **Productos:** venta neta, cantidad comparable y ganancia histórica, con páginas de resultados; concentración en los primeros tres productos y menor margen conocido.
- **Meses:** total, promedio diario o número de facturas. Se conservan los meses sin ventas y el año de cada mes; un asterisco identifica meses parcialmente incluidos. Se puede seleccionar una barra para ver el detalle.
- **Rentabilidad:** venta antes de descuentos, descuentos, venta neta, costo histórico y ganancia bruta. Impuestos, servicio, propinas, crédito inicial, abonos y cobros recibidos aparecen separados.
- **Horarios:** cierres por franja horaria y promedio de venta por día de la semana. Corresponden a la fecha de facturación, no a la llegada del cliente o la preparación del pedido.

El área de análisis reemplaza su contenido mediante salida y entrada progresivas; las pestañas, el período y los indicadores permanecen disponibles. Las animaciones respetan movimiento reducido. En móvil se recorre un gráfico o detalle a la vez, sin apilar toda la información. Las listas y los meses tienen paginación; cambiar de vista no vuelve a consultar las ventas. Las pestañas admiten flechas, Inicio y Fin del teclado.

## Reglas de cálculo

Los importes se suman en centavos enteros. La **venta neta** es el subtotal de productos menos descuentos; excluye impuestos, servicio y propinas. La **ganancia bruta estimada** resta el costo histórico registrado, sin descontar arriendo, nómina ni otros gastos. Un costo ausente produce un valor desconocido, nunca una ganancia basada en costo cero. Un cero registrado sí se conserva como cero.

El ticket promedio divide la venta neta entre facturas cerradas únicas. **Ventas registradas** incluye facturas a crédito; no afirma que todas estén pagadas. Los abonos posteriores se incluyen en cobros recibidos y permanecen fuera de ventas, productos y ganancia. El crédito al facturar no equivale al saldo pendiente actual. Una venta anulada se excluye; un identificador repetido no crea otra venta.

Los descuentos se distribuyen entre los productos proporcionalmente a su importe, asignando los centavos restantes por mayores residuos. El costo por producto procede del desglose histórico; no se inventa por prorratear el costo total. Los ID de producto conservan separados los productos de igual nombre y agrupan un mismo producto aunque cambie su nombre. Cuando falta el desglose se muestra un renglón identificado como consumo sin desglose. Las categorías y unidades usan el catálogo actual si la factura no las conserva; no recalculan precios ni costos antiguos. El ranking de cantidades solo se habilita si todas las unidades son conocidas y comparables.

Las fechas y horas usan America/Bogota. La comparación utiliza el mismo número de días inmediatamente anteriores. Sin base positiva, con historial parcial o registros inválidos se evita un porcentaje engañoso. El promedio diario y semanal incluye días sin ventas dentro del período seleccionado; no supone que el negocio estuvo abierto esos días. Las conclusiones describen registros, sin inventar demanda futura ni recomendaciones automáticas de compras.

## Integridad, conexión y acceso

Se usa `get_income_report`, protegido por `sales.read` y por negocio/sucursal, sin nuevo permiso ni escritura. Se recorren las páginas de una revisión consistente; si falta una página o se detecta una descarga parcial se muestra su alcance. No se analiza únicamente la primera página del listado de Ventas. El botón **Cómo se calcula** explica las reglas y muestra registros inválidos omitidos, repetidos y datos faltantes.

Cuando el navegador lo permite, un trabajador calcula los agregados fuera del hilo de la interfaz. El modo alternativo conserva el mismo motor y fórmulas. Una respuesta tardía de otra selección, sesión o sucursal no sustituye los datos actuales. El trabajador se termina al cerrar o perder acceso.

El análisis usa el respaldo local durante una desconexión e identifica datos parciales y cambios pendientes. Las ventas locales se vuelven a calcular cuando cambia el respaldo; al reconectar se consulta el reporte disponible sin duplicar facturas. Con la vista abierta se comprueba cada 30 segundos una revisión breve del servidor y solo se vuelve a analizar si cambió. También se actualiza al volver a la ventana. Los archivos de interfaz y del trabajador se incluyen en el caché público de la aplicación; las respuestas privadas no se guardan en ese caché.

Validación: pruebas de fórmulas y centavos, fechas, costos ausentes, créditos y abonos; pruebas de navegador con 501 facturas, cinco vistas, pantallas pequeñas, funcionamiento sin internet y revocación de permisos; y comprobación del motor contra facturas y permisos de Oracle real mediante el negocio temporal aislado de `scripts/test-orders-live.ts`.
