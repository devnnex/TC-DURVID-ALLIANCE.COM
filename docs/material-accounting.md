# Costos e historial de insumos

En cafetería y coctelería, abre **Macro de Insumos**, justo debajo de **Costo de productos** en la navegación. Es una sección independiente; la hoja de costeo conserva sus recetas y borradores al cambiar entre ambas. **Existencias** muestra cantidad física, cantidad comprometida en cuentas abiertas, disponibilidad, costo promedio por unidad base y valor de las existencias. Los costos y **Estadísticas y entradas** están reservados al propietario, al jefe de la sucursal y al administrador temporal que tiene rol de propietario. El servidor comprueba el rol en cada consulta; un permiso general de ventas no concede acceso a estas estadísticas.

Los accesos **Estadísticas y entradas** y **Vincular receta** están comentados temporalmente en la interfaz de cafetería y coctelería. Se conservan sus datos, módulos y comprobaciones de permisos; el detalle reciente de costos continúa en Editar insumo y el abastecimiento automático desde Costeo sigue funcionando.

## Cómo se calculan los indicadores

- **Costo de productos (Menú Digital):** suma de la capacidad disponible de cada producto × su costo unitario registrado. Los productos sin receta utilizan sus existencias disponibles. Incluye productos suspendidos, que siguen teniendo costo, aunque se excluyen de la venta potencial. Es una referencia por producto: las recetas pueden compartir insumos, por lo que no representa una valoración física de la materia prima.
- **Valor de insumos en existencia (Macro de Insumos):** cantidad física de cada insumo activo × su costo promedio. Un insumo compartido entre recetas se cuenta una sola vez. Incluye existencias comprometidas hasta descontar su consumo; excluye insumos retirados. Este indicador conserva su cálculo independiente del Menú Digital.
- **Capacidad:** preparaciones disponibles por receta, después de descontar las reservas de cuentas abiertas. Las capacidades individuales comparten insumos.
- **Venta potencial:** suma de capacidad individual × precio de venta de cada producto habilitado, más los productos sin receta disponibles. Es una referencia por receta, no una promesa de poder vender simultáneamente todas las capacidades cuando comparten ingredientes; la interfaz lo indica.
- **Entrada:** se convierte la cantidad a la unidad base antes de calcular el costo promedio. Por ejemplo, 1.000 g a $2/g más una entrada de 1 kg por $4.000 dejan 2.000 g a $3/g. Esa entrada conserva $4.000 y $4/g en el historial aunque el promedio cambie después.
- Los totales y los costos unitarios de las tarjetas que superan un peso se presentan en pesos enteros; los costos menores conservan fracciones útiles. Las cantidades se muestran con hasta dos decimales habituales y más precisión si son muy pequeñas. El costo interno puede consultarse sobre el precio de la tarjeta o en su ficha. El redondeo solo afecta la presentación: la base de existencias y los cálculos conservan su precisión existente de ocho decimales.

## Entradas, aumentos y ediciones

Usa **± Cantidad** para registrar nuevas existencias y su costo total. El costo se autocompleta con el precio actual y el jefe puede corregirlo antes de guardar. Si otra persona cambió existencias o costo mientras el formulario estaba abierto, la entrada requiere revisión; no sobrescribe silenciosamente ese cambio. Un usuario autorizado para cantidades pero sin acceso a costos usa la referencia calculada por el servidor.

**Aumentar capacidad** y el abastecimiento inicial de una receta agregan sus ingredientes proporcionalmente. Sus valores son **calculados**, separados de las entradas con costo registrado; no acreditan una compra ni un pago. Las compras de proveedores con líneas de insumos conservan el importe original y la cantidad aprovechable según su rendimiento.

**Editar insumo** corrige el saldo o su valoración actual; conserva una revisión con los costos anterior y posterior y los últimos movimientos. Editar un nombre sin tocar el costo conserva el precio exacto. Las correcciones, los saldos iniciales, los retiros y las devoluciones no se suman como nuevas compras. Ninguna edición reescribe los precios, cantidades, fechas o responsables de entradas anteriores.

## Estadísticas y trazabilidad

Filtra por fechas de Bogotá, insumo y responsable. Se separan costo registrado y costo calculado; cada insumo mantiene su unidad. Se muestran los 30 insumos con mayor valor y páginas de 50 movimientos, con cantidad, costo, precio de la entrada, promedio anterior/posterior, fecha, responsable y motivo. Puedes filtrar un insumo específico aunque no esté entre los primeros 30.

La apertura usa los registros recientes guardados en el equipo y consulta enseguida el historial completo en Oracle. El snapshot está acotado a 200 registros; si no hay conexión, los totales parciales se identifican como tales. Los agregados del servidor abarcan todo el período y no dependen de ese límite. Los datos anteriores que no conservaban el importe exacto de compra aparecen como referencias calculadas, sin inventar facturas históricas.

Los reintentos mantienen el identificador de la operación y no duplican entradas. Los datos están separados por negocio y sucursal. GCOBARF conserva sus costos, historial y valoración de productos terminados; recibe el diseño horizontal adaptable de tarjetas y la verificación de sus indicadores.
