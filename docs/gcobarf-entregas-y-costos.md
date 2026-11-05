# Entregas y costos de GCOBARF

Agregar productos a una entrega aparta sus unidades del inventario. Cambiar cantidades aplica únicamente la diferencia; retirar productos o cancelar la entrega devuelve lo apartado. Cobrar la entrega o abonar su cartera conserva esas existencias. La reserva se guarda por cuenta y permanece aunque se limpie la vista de movimientos.

El calendario distingue pendientes, pagos parciales y pagos completos. Cada cliente conserva su color; el indicador `+N más` permite reconocer las otras entregas del día. El desglose reúne cantidades, fecha de entrega, pagos y observaciones. El historial del cliente incluye entregas anteriores y futuras, y permite consultar varias fichas a la vez.

Movimientos combina cliente, producto, tipo de movimiento y periodo. Los indicadores usan los mismos registros filtrados. Para entregas se filtra por la fecha programada; para otros movimientos, por la fecha del registro. El valor apartado o comprado descuenta las devoluciones y avisa cuando un registro anterior carece de precio relacionado.

Los productos se nombran `GCOBARF - Tipo - AAAAMMDD`. Los tipos adicionales se guardan con el costeo y pueden reutilizarse en otros dispositivos. El lápiz del precio sugerido permite elegir un importe y recalcula el margen mostrado.

El costo final de una unidad es:

```
costo de ingredientes y gastos directos del lote / unidades del lote
+ gastos mensuales aplicables / unidades producidas durante ese mes
```

El inventario conserva separado el costo por unidad para su valoración. La ganancia potencial y el margen descuentan el costo final; las nuevas ventas conservan ese costo en su factura. Cambiar el mes de consulta no altera el mes al que pertenece una producción fechada.

## Actualizar instalaciones

`database/ords/install.sql` contiene los paquetes actualizados. El flujo normal de publicación sigue construyendo el frontend desde `main`.

Los comandos siguientes muestran su plan antes de modificar datos:

```sh
node --import ./node_modules/tsx/dist/loader.mjs scripts/repair-gcobarf-zero-sales.ts
node --import ./node_modules/tsx/dist/loader.mjs scripts/reconcile-gcobarf-deliveries.ts
```

Agregar `--apply` aplica la operación. La reparación exige precios positivos comprobados en la auditoría anterior a la venta, conserva el costo histórico y no cambia existencias. Guarda el antes y después de la factura en auditoría y un respaldo privado en `.tools/`. No reconstruye descuentos o pagos mixtos cuyo reparto se desconozca, ni inventa cuánto efectivo entregó físicamente el cliente.

La conciliación incorpora las reservas de entregas que ya estaban abiertas. Es repetible: las reservas existentes evitan otro descuento. Ambos comandos requieren la configuración privada de Oracle; esa configuración y los respaldos no se publican.

## Comprobaciones

Las pruebas unitarias cubren cantidades, reservas, devoluciones, pagos repetidos, abonos, fechas, costos y reconstrucción histórica. Las pruebas de navegador cubren la consulta móvil, fichas simultáneas, desgloses persistentes y el recorrido de reserva a pago. Los scripts `test-delivery-calendar-live.ts`, `test-gcobarf-costs-live.ts` y `test-credit-lifecycle-live.ts` comprueban Oracle con negocios temporales que eliminan al finalizar.
