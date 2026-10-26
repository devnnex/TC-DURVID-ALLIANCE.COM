# TC-DURVID Alliance · base reutilizable

Este proyecto contiene un portal para elegir negocio y tres copias aisladas del frontend de Tienda Nápoles. La carpeta original `../TIENDA-NAPOLES-BCA.COM-main` sigue intacta. El cuarto espacio está reservado hasta definir su marca y operación.

## Decisión de arquitectura

Cada negocio activo usa **su propio proyecto Supabase**. El sistema de Nápoles fue diseñado para una sola marca por base de datos: `business_settings.is_primary` es único y las mesas, usuarios, ventas y funciones RPC no llevan identificador de negocio. Meter los tres en una misma base mezclaría datos y permisos. Esta separación conserva la lógica operativa existente y permite crear personal independiente para cada negocio.

| Portal | Frontend administrativo | Configuración | Alta inicial |
| --- | --- | --- | --- |
| GCOBARF Nutripet's | `negocios/gcobarf/admin.html` | `negocios/gcobarf/config.js` | `supabase/05_alta_gcobarf.sql` |
| Jespresso Olivia Coctelería | `negocios/cocteleria/admin.html` | `negocios/cocteleria/config.js` | `supabase/05_alta_cocteleria.sql` |
| Jespresso Olivia Cafetería | `negocios/cafeteria/admin.html` | `negocios/cafeteria/config.js` | `supabase/05_alta_cafeteria.sql` |

La página principal es `index.html`. Cada tarjeta abre el inicio de sesión con el color y la marca del sistema correspondiente. Las tarjetas actuales son composiciones hechas con CSS a partir de la referencia visual. Cuando estén los archivos originales de los logos, se podrán sustituir sin cambiar la navegación.

## Preparar cada Supabase vacío

Repite **la secuencia completa en cada proyecto Supabase**. Abre SQL Editor como `postgres`, pega el contenido de **un archivo por ejecución** y comprueba que termine bien antes de continuar:

1. `supabase/00_preparacion.sql` — habilita `pgcrypto` y verifica Realtime.
2. `supabase/01_estructura_napoles.sql` — tablas, funciones RPC, triggers, políticas RLS y permisos base. Proviene del respaldo **solo de estructura** de Nápoles, no de sus datos.
3. `supabase/02_roles_y_permisos.sql` — Jefe, Administrador y Mesero, con permisos por sección.
4. `supabase/03_propinas.sql` — configuración de propinas desactivada por defecto.
5. `supabase/04_storage_y_realtime.sql` — bucket `brand-assets`, políticas de carga y publicación Realtime.
6. **Solo uno** de los archivos `supabase/05_alta_*.sql` según el negocio. Antes de pegarlo, sustituye `CAMBIAR_PIN` por un PIN privado de 6 a 12 dígitos. Crea la marca y el usuario inicial `jefe`.
7. `supabase/06_verificacion.sql` — comprueba marca, Jefe, bucket, RPC y permisos.

No ejecutes `../TIENDA-NAPOLES-BCA.COM-main/supabase/backups/data_2026-09-03.sql`: contiene usuarios, sesiones, ventas y referencias al proyecto anterior. Tampoco ejecutes `../TIENDA-NAPOLES-BCA.COM-main/supabase/schema.sql` después de esta secuencia; es una colección de cambios históricos, no la estructura inicial.

Al terminar, inicia sesión con usuario `jefe` y el PIN que elegiste. Después crea las mesas, categorías, productos y los demás usuarios desde el panel. No hay datos de Nápoles precargados.

En el proyecto Supabase real, valida en este orden: inicio de sesión del Jefe; creación de una mesa y su QR; solicitud desde `cliente.html`; atención y cobro; creación de un Administrador y un Mesero con permisos distintos; carga de logo/portada. La sintaxis SQL y las rutas locales están comprobadas, pero esas operaciones necesitan un Supabase conectado para probarse de extremo a extremo. En particular, confirma la carga de imágenes desde el navegador: la política de Storage exige el token de la app en la cabecera `x-app-token` y el comportamiento de esa cabecera puede variar en Storage. Si la carga falla, sube la imagen desde el panel de Supabase y registra su URL pública en `business_settings`; no abras permisos anónimos de escritura para resolverlo.

## Conectar el frontend

En cada `negocios/<sistema>/config.js`, cambia `TU_SUPABASE_URL` y `TU_SUPABASE_ANON_KEY` por los valores **de ese mismo negocio**. Pega el origen del proyecto, por ejemplo `https://xxxxx.supabase.co`, sin `/rest/v1`. La anon key se usa en el navegador; **nunca** pegues la `service_role` key. `appsScriptUrl` queda vacío hasta que revisemos `Code.gs` en la siguiente etapa.

Para verlo localmente desde esta carpeta:

```powershell
python -m http.server 8765
```

Abre `http://localhost:8765/`. La app necesita un servidor HTTP o HTTPS para la PWA, los archivos y las rutas. Al publicarlo, sirve toda esta carpeta bajo un mismo origen y conserva las rutas `negocios/...`.

## Qué se conservó y qué falta conectar

- Cada copia mantiene el frontend de Nápoles: mesas, cuentas, solicitudes, chat, inventario, usuarios, roles y reportes. Los QR apuntan a `cliente.html` dentro de su negocio.
- Las claves de almacenamiento local, sesión y caché PWA se separaron por negocio para que un usuario que trabaja en varios sistemas no cruce datos del navegador.
- La interfaz de acceso y el portal tienen marca propia. El panel interno conserva la estructura funcional original y tomará el nombre/color definidos en `business_settings`.
- La sincronización remota de inventario y reportes que depende de Apps Script quedará pendiente hasta configurar y adaptar `Code.gs`. El frontend se entrega con la URL vacía intencionalmente.
- El cuarto negocio no tiene backend ni enlace operativo todavía; al definirlo se crea otra copia y se ejecuta la misma secuencia en su propio Supabase.

El script `tools/prepare_clones.py` documenta cómo se prepararon las tres copias desde la referencia. Solo crea archivos inexistentes para proteger cambios posteriores. No lo ejecutes como mecanismo de actualización automática del código de Nápoles; cualquier mejora futura se revisa y adapta por negocio.
