# Clientes y propinas en cafetería y coctelería

El directorio de clientes aparece antes del análisis de fidelización. Cada ficha tiene **Compras y pagos** como acción principal, sin abrir primero el registro del cliente. El historial muestra consumos y abonos, fechas, responsables, productos e importes; cuando existen, separa propinas, impuestos, servicio y descuentos para explicar el total. La fecha de registro y sus demás datos continúan en **Ver registro**.

En la macro, **Disponible** tiene más separación de las existencias y la valoración. Los botones **Estadísticas y entradas** y **Vincular receta** están comentados en la interfaz de estas dos sucursales. Sus funciones y datos se conservan; el abastecimiento automático desde Costeo sigue disponible.

## Repartir propinas

Abre **Propinas → Repartir propina**. El recorrido tiene tres pasos:

1. Indicar entre cuántas personas se reparte, de 1 a 100.
2. Revisar cuánto corresponde a cada una y escribir sus nombres si se desea sustituir «Persona 1», «Persona 2», etc.
3. Confirmar el importe y las ventas incluidas y registrar el reparto con una nota opcional.

Se reparten pesos enteros y se asigna el sobrante peso a peso, manteniendo exactamente el importe total. Si el importe original incluye centavos, se conservan en la última asignación y se muestran donde es necesario. El registro conserva responsable autenticado, fecha, personas, importes, ventas, mesas y medios de pago de origen.

**Sin reparto registrado** es el saldo de propinas cobradas que no tienen un reparto registrado en el sistema. No es un arqueo de caja ni confirma si se entregó dinero por fuera del software antes de utilizar esta función. El registro no ejecuta transferencias ni genera una venta adicional.

Las propinas a crédito se incorporan proporcionalmente cuando se reciben los abonos: la parte aún no cobrada queda fuera del reparto. Cada venta puede desplegarse para consultar sus productos, el pago inicial y los abonos relacionados, identificando el importe aplicado a esa venta cuando un recibo cubre varias cuentas.

La confirmación requiere conexión y validación del saldo en Oracle. Si cambió mientras se revisaba el reparto, se actualiza y se vuelven a revisar los importes. Dos usuarios no pueden repartir simultáneamente el mismo dinero; un reintento con el mismo identificador no duplica el registro.

## Historial y correcciones

El historial conserva los repartos compartidos y sus detalles. Los jefes pueden **Anular este reparto**, escribiendo un motivo. La anulación conserva el original, identifica quién y cuándo la hizo, y vuelve a dejar el saldo disponible; no mueve dinero automáticamente. Las ventas con propinas ya repartidas requieren resolver ese reparto antes de corregirlas o anularlas.

Consultar requiere permiso de lectura de ventas; registrar requiere además permiso de escritura de ventas. Anular un reparto requiere ser propietario o jefe de esa sucursal. GCOBARF y Sucursal conservan su pantalla anterior de propinas.
