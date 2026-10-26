# API /api/v1

**Transporte activo ORDS:** las rutas lógicas se envían a POST /rpc con {method,path,body,access_token,refresh_token,location_id,setup_token}. La respuesta contiene {status,data}; el adaptador restituye el estado de aplicación. Sesiones opacas rotatorias sin cookies y contraseñas PBKDF2. Ver [API pública](public-api.md).

Errores {error:{code,message}}. Validación estricta de campos y tipos. Fechas ISO UTC, UI America/Bogota; dinero en centavos como cadena. ORDS usa access en memoria y refresh en sessionStorage; ambos se verifican en Oracle. El adaptador convierte x-location-id al contexto validado. business_id enviado no sustituye ese contexto. La alternativa Fastify conserva JWT/cookie y validación Zod.

| Método / ruta | Comportamiento inicial |
| --- | --- |
| GET /health | comprueba la base; 200 disponible, 503 si no responde; proveedor sin secretos |
| GET /installation | indica si falta configurar el negocio y si hay token de instalación; nunca devuelve el token |
| POST /admin/setup | propietario, negocio y lista de sucursales en una transacción; exige SETUP_TOKEN y base sin negocio |
| GET /admin/overview | sucursales (incluidas inactivas), usuarios sin hashes, roles y secciones; solo propietario |
| POST /admin/locations | crea sucursal del negocio; solo propietario |
| PUT /admin/locations/:id | cambia nombre, slug, color y estado; protege la última activa |
| POST /admin/users | crea usuario con contraseña PBKDF2 en ORDS, roles y excepciones por sucursal; solo propietario |
| PUT /admin/users/:id | actualiza datos/accesos, contraseña opcional y revoca sesiones; protege cuenta propietaria |
| POST /auth/login | acceso clásico compatible: business slug, username, password; rate limit |
| POST /auth/login/challenge | desafío SCRAM de un solo uso vinculado al negocio, usuario y sucursal |
| POST /auth/login/proof | verifica la prueba, emite sesión y firma del servidor; rate limit |
| POST /auth/refresh | rota refresh y devuelve access opaco en ORDS |
| POST /auth/logout | revoca sesión (también cookie en la alternativa Node) |
| GET /context | usuario + sucursales activas autorizadas + permisos efectivos + is_owner |
| POST /devices/register | registra dispositivo en location autorizada |
| GET /bootstrap | catálogo, unidades, sucursal y cursor consistente; requiere products.read; ingredientes solo con inventory.read |
| GET /products, /ingredients, /units | catálogos autorizados |
| POST /sync | PRODUCT_UPSERT con permiso products.write y dispositivo registrado |
| GET /sync/changes | feed por sucursal paginado, cursor validado |

Las rutas de ventas, caja, inventario financiero, refunds, pedidos, recetas e impresión descritas en el prompt son contratos de fases posteriores. No se exponen endpoints que respondan éxito sin una implementación real.

`/admin/setup` recibe `locations: [{name,slug,color,active}]`, con identificadores únicos y al menos una sucursal activa. La compatibilidad con location_name pertenece únicamente al backend Node; ORDS exige la lista locations. Las rutas de usuarios reciben `{name,username,active,password?,access:[{location_id,roles,overrides}]}`. `overrides` asocia permisos conocidos a `ALLOW` o `DENY`; omitir un permiso significa heredar del rol. La contraseña es obligatoria al crear. No se permite asignar OWNER ni `administration.manage` desde este contrato. Las mutaciones administrativas no usan la cola offline.
