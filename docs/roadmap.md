# Orden de trabajo hacia el 15 de octubre de 2026

El requerimiento de referencia es [requirements.md](requirements.md), copia del Pasted text.txt inicial. El objetivo solicitado es tener el sistema casi completo para el jueves 15 de octubre. La prioridad es terminar recorridos que podamos probar de principio a fin con Oracle y usuarios reales; cada fase debe conservar el portal y las funcionalidades anteriores.

| Orden | Entrega | Prueba que permite avanzar |
| --- | --- | --- |
| 1 | Conexión Oracle, sucursales, usuarios/roles y catálogo | Configurar, iniciar sesión, persistir, recargar desde otro dispositivo, denegar permisos y sincronizar catálogo offline |
| 2 | Ingredientes, proveedores/compras, recetas y costeo | Conversiones correctas, costo de receta y precio según markup/margen, historial de costos |
| 3 | Ledger de inventario y transferencias | Compra/ajuste/merma/transferencia transaccionales, balance reconstruible y alcance por sucursal |
| 4 | Mesas, pedidos, cajas, ventas y pagos | Abrir caja → pedido → cobro dividido → descuento por receta → cierre conciliado |
| 5 | Eventos offline de la operación y conflictos | Venta sin red → reconexión; duplicados, ACK perdido, 100 eventos y dos dispositivos sin duplicar cobros ni movimientos |
| 6 | Recibo POS, reportes y preparación de entrega | Impresión física, reportes por sucursal/permisos, pruebas reales ATP, respaldo/recuperación y despliegue HTTPS |

La fecha guía las prioridades; no sustituye las pruebas ni permite declarar terminado un módulo que aún no opera. El estado y los bloqueos reales se documentan en cada entrega. Recibo POS y factura electrónica DIAN siguen separados según el requerimiento. No se migran datos o funciones del legado sin reconciliación y prueba de su reemplazo.

**Avance 2026-10-09:** conexión ORDS desplegada, administración y catálogo verificados contra Oracle. Chrome conectó desde HTTP con prefijo y file://. La base queda lista para configurar el propietario y las sucursales reales. La siguiente fase es ingredientes, proveedores/compras, recetas y costeo, conservando las pruebas de acceso y sincronización.
