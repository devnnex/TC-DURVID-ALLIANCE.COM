# Sincronización y contrato de eventos

Cada instalación guarda `device_id` persistente. La base IndexedDB se separa por business/location/user; los eventos incluyen device y operation UUID. El servidor valida registro del dispositivo, pertenencia a sucursal y permisos desde la sesión. El ID del navegador no otorga autorización.

Evento: `operation_id`, `device_id`, `business_id`, `location_id`, `entity_type`, `entity_id`, `operation_type`, `payload`, `client_created_at`, `base_version`, `idempotency_key`. La fase actual solo admite PRODUCT_UPSERT. La versión no cambia durante retries. Es posible dar de alta y modificar catálogo offline después de descargar bootstrap; no implica que los cobros del frontend antiguo funcionen offline.

Transacción local: producto optimista + evento/outbox. Eventos append-only en `events`; metadatos de entrega en `queue`. Estados PENDING, SYNCING, SYNCED, FAILED, CONFLICT, REQUIRES_REVIEW. No se limita ni recorta el historial de pendientes. SYNCING abandonado vuelve a PENDING tras un lease; Web Locks serializa pestañas cuando está disponible.

POST /api/v1/sync: máximo 100 eventos ordenados; ACK individual. El servidor aplica cada evento en su propia transacción. Unique `(business_id, operation_id)` y `(business_id, idempotency_key)`; se compara también hash del contenido. La misma clave con contenido/dispositivo/actor distinto produce conflicto, nunca otro write. El producto, audit, recibo y feed se confirman juntos. Si se pierde el ACK, retry devuelve el resultado original. Una respuesta de conflicto confirmada también queda registrada, para no reinterpretarla al reintentar.

El cliente marca SYNCED solo al obtener ACK; resultados parciales se mantienen. Error de transporte libera el lease y aplica backoff exponencial acotado. 401 requiere renovar/iniciar sesión; 403 requiere revisión. No se elimina el evento por esos errores. CONFLICT no se reenvía silenciosamente. La UI ofrece conservar versión central o emitir un nuevo evento con base_version actual; nunca muta el evento rechazado.

GET /sync/changes?cursor=N: paginado por contador **transaccional por location**. Snapshot de bootstrap y cursor se leen con transacción Oracle READ ONLY consistente. Aplicar cambios y cursor en una transacción Dexie; no avanzar cursor si falla. Si hay writes locales pendientes para un producto, se conserva su estado optimista y se espera ACK/conflicto; el cursor/feed confirmado igualmente se persiste en cache central. Conflictos entre dispositivos usan comparación de versión, sin last-write-wins.

## Estrategias futuras por dominio

Maestros: versión optimista + revisión. Pedidos: versión/transiciones válidas y responsable; dos dispositivos no fusionan pagos automáticamente. Inventario: eventos de consumo/entrada, no sustitución de saldo; validar stock central bajo bloqueo. Si allow_negative_stock está habilitado, aceptar ledger y crear alerta, preservando venta. Financieros: recibos inmutables y compensaciones, sin mezcla automática de ventas/refunds. Cada SALE_COMPLETED debe insertar venta, líneas, pagos, ledger, caja, snapshot y auditoría atómicamente; aún no es un evento habilitado.

El dashboard central únicamente puede mostrar la última telemetría recibida. No puede saber que hay 146 pendientes en un dispositivo que lleva horas desconectado si este no informó ese número; muestra última conexión/estado conocido, sin inventar frescura.
