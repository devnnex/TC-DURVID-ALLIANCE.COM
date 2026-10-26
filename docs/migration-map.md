# Inspección y mapa de migración

Inspeccionados: los tres clones, `supabase/01_estructura_napoles.sql`, roles/permisos, propinas, Storage/Realtime, configuración de marca, referencia Nápoles `app.js`, `appscript/Code.gs`, README, esquema/migraciones y pruebas. Las copias comparten las mismas entidades; sus diferencias son marca, claves locales y enlaces. No hay credenciales Oracle, exports de TC ni acceso verificado a bases remotas.

| Origen y responsabilidad | Destino / decisión |
| --- | --- |
| business_settings: marca, moneda, impuesto, servicio, propina | businesses + settings JSON; branding por location opcional; no inferir tasas |
| app_users: username, full_name, pin_hash, boss/admin/waiter, permissions | users + roles + role_permissions + user_location_roles; boss→OWNER, admin→ADMIN con permisos revisados, waiter→WAITER |
| auth_sessions / login_attempts / x-app-token | auth_sessions con refresh hash y revocación; JWT de corta duración, límite de intentos; no migrar tokens |
| menu_categories / menu_items | categorías/productos versionados; guardar price como centavos; preservar identificadores con prefijo de fuente cuando colisionen |
| restaurant_tables: número, nombre, QR, active | restaurant_tables por sucursal; códigos QR nuevos tras habilitar el módulo público |
| table_sessions: open/closed/cancelled, totales, payer, assigned_waiter, channel | orders; cerradas con evidencia de pago→sales; comparar con Ventas de Sheets antes de crear transacción |
| session_items: cantidad, precio, notas, served/cancelled, responsables | order_items; sale_items inmutables para cobros reconciliados |
| service_requests: waiter/bill/song/other y resolución | módulo de solicitudes en fase posterior; conservar export y estado |
| chat_messages / RPC de chat | módulo de mensajes en fase posterior; conservar historia, autor y acceso por mesa |
| Storage brand-assets / realtime publication | almacenamiento de marca y SSE opcional; no copiar anon policies a Oracle |
| Sheets Inventario: product_id, unidad, coste, precio, saldo, mínimo, siglas | products / ingredients según clasificación validada + inventory_movements INITIAL_STOCK; no adivinar recetas |
| Sheets Ventas / Detalle_Ventas / Pagos | sales / sale_items / payments, preservando fecha, responsable, snapshot de coste y sale_id |
| Movimientos_Inventario | inventory_movements, conservar ID, referencia, delta, unidad, coste y fecha |
| Auditoria | audit_log importado con fuente; no inventar before/after faltantes |
| Ingresos_Diarios | reconstruir vistas desde ventas/pagos; cotejar totales por día y medio |
| localStorage inventoryMeta / invoiceHistory / movements / walk-in drafts | export/import controlado por dispositivo, ámbito y usuario; nunca leer automáticamente datos de otro negocio |
| localStorage Apps Script jobs / requests / bill-resolution outboxes | reconciliar pendientes antes del corte; no reenviarlos simultáneamente a dos destinos |

RPC encontrados: login/logout/get_current_user, list/save/delete_user, get_bootstrap_data, get_admin_snapshot, get_client_snapshot/get_client_table_state, create_service_request(s)_batch, acknowledge_service_requests, resolve_bill, list/send/close_chat. SQL usa SECURITY DEFINER, token de cabecera, valid_table_access, triggers de límites de rol/normalización y RLS. El equivalente son servicios explícitos con autorización central, no CRUD público. No se encontraron Edge Functions ni backend Node.

Apps Script ofrece upsert/sync/adjust/set/delete/clear_inventory, record/edit/delete_sale, update_inventory_movement_cost, reportes y borrado de sesiones Supabase archivadas. `saleExists_` deduplica por venta/sesión con LockService, pero Sheets no aporta una transacción Oracle. Sus operaciones destructivas **no se trasladan**: el nuevo sistema debe compensar y auditar según el requerimiento.

## Plan de corte por módulo

1. Exportar cada Supabase y cada pestaña Sheets con manifiesto de fuente, negocio, sucursal, fecha, número de filas y hashes. Excluir claves/tokens; custodiar exports fuera del repositorio.
2. `npm run migration:plan -- --input <export.json> --business <uuid> --location <uuid>` valida un export de catálogo y produce un plan; no ejecuta inserciones ni inventa datos financieros.
3. Importar primero identidad, unidades y catálogo en staging; resolver duplicados con mapa de identificadores. Forzar renovación de credenciales; no convertir un hash de PIN en texto.
4. Comparar inventario reconstruido, totales por fecha, líneas, pagos mixtos, costes y ventas individuales/mesas; toda diferencia requiere revisión.
5. Registrar dispositivos, cargar bootstrap IndexedDB, ensayar desconexión/reapertura y idempotencia. El nuevo catálogo tiene pruebas; los ensayos de ventas esperan el módulo financiero.
6. Cambiar un módulo en una sucursal con ventana de corte y bloqueo de escrituras antiguas de ese módulo. Conservación temporal del frontend anterior para consulta/rollback operativo.
7. Retirar Supabase/Apps Script solo al reconciliar datos y comprobar cada flujo. Ninguna base remota se modifica en esta entrega.
