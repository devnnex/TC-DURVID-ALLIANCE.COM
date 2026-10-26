# Consumos, cartera y acuerdos de pago

Cambios compartidos por las cuatro sucursales. Se conservan el acceso rápido, las operaciones locales y la cola de sincronización existentes.

- Se comprobó desde el formulario real que varios productos, añadidos mediante Enter y Añadir a selección, generan una sola venta a crédito y una sola deuda con la suma completa. El cobro no queda también pendiente en la mesa/persona.
- Cuentas por cobrar ahora abre con **Todos los saldos pendientes**, incluyendo fechas futuras. Siguen disponibles los filtros de cuentas vencidas/por cobrar hoy y pagadas. La vista anterior ocultaba las fechas futuras por defecto.
- Las consultas de operaciones que terminan después de una actualización más reciente no sustituyen esa actualización en la interfaz.
- Clientes y cartera aparece inmediatamente después de Cuentas y pertenece al grupo naranja. Mesas usa el título **Mesas y QR**.
- Editar cliente permite definir fecha y frecuencia: una fecha acordada, semanal, cada 15 días o mensual. El sistema sugiere la siguiente fecha al agregar un consumo; el usuario puede cambiarla para esa cuenta. Los meses cortos respetan el día original del acuerdo mensual.
- **Actualizar también las cuentas pendientes** aplica la nueva fecha únicamente a las cuentas abiertas que el usuario confirma. Se validan cliente, sucursal, fecha anterior, saldo y abonos esperados. Si otro equipo cambió esos datos, se conserva el cambio pendiente para revisión. No se alteran los importes ni los abonos; cada cambio conserva fecha anterior, fecha nueva y responsable.
- El desglose dentro del modal de consumo utiliza una columna lateral en escritorio; en móvil mantiene su disposición vertical. Un doble clic sobre un consumo registrado abre un editor flotante. Editar cantidades, precio, producto o nota conserva la selección todavía sin confirmar. El teclado también permite abrirlo desde el desglose.
- Las confirmaciones nativas utilizadas por Costeo, pedidos, cocina y usuarios se reemplazaron por mensajes del sistema. `operational/dialogs.js` ofrece confirmación, aviso y entrada de texto asíncronos; admite cancelación, Escape, Enter, cola de mensajes, foco y texto seguro. Se incluye en la precarga PWA.

## Validación reproducible

```powershell
npm run build
npm test
npx playwright test tests/browser/consumption-credit-flow.spec.ts tests/browser/credit-lifecycle.spec.ts tests/browser/team-and-purchases.spec.ts tests/browser/waiter-orders.spec.ts tests/browser/costing-price-sheet.spec.ts tests/browser/interaction-performance.spec.ts --reporter=line
npx tsx scripts/test-credit-selection-live.ts
```

El último comando usa la configuración privada de mantenimiento. Crea un negocio aislado y lo retira al terminar; verifica el recorrido del navegador contra el servidor real, el total de la deuda, la actualización de fecha/frecuencia, la trazabilidad y el rechazo de fechas inválidas o saldos cambiados. No modifica clientes existentes.

La instalación reproducible incorpora `customer_schedule.sql` antes de `operations_commands.sql`. No requiere migrar ni recrear clientes o deudas. Los acuerdos anteriores siguen disponibles y las cuentas sin frecuencia configurada mantienen su comportamiento previo.

Resultado: compilación, tipos y 125 pruebas automáticas aprobados. Se verificaron 45 escenarios de navegador en tandas: 44 en la regresión conjunta y el caso adicional de una cuenta que llega mientras el acuerdo está abierto. Los tres recorridos finales comprobaron también el ajuste visual en móvil y la reprogramación offline con una respuesta perdida. La recarga de la sesión preparada midió 759 ms en la prueba de rendimiento. El recorrido real del navegador confirmó la deuda completa, el acuerdo de pago, su responsable y el rechazo de fechas inválidas o datos desactualizados; sus datos temporales se retiraron.
