# API Oracle y frontend estático

## Conexión activa

Desde el 9 de octubre de 2026, la implementación principal usa Oracle REST Data Services (ORDS), incluido en Autonomous Database. ADMIN por HTTPS permitió instalar la API y comprobar las tablas existentes; sus credenciales se usan exclusivamente en scripts privados de mantenimiento.

URL pública configurada en api-config.js:

~~~text
https://gbd1bb1fefc484d-jolivia.adb.sa-bogota-1.oraclecloudapps.com/ords/admin/alliance/api/v1
~~~

GitHub Pages o Live Server → frontend → API ORDS HTTPS → PL/SQL → tablas Oracle JOlivia. El repositorio guarda el código de ambas partes; Pages publica archivos estáticos y Oracle ejecuta el backend instalado. La conexión SQL*Net del backend Node anterior fue rechazada por la política de red; la conexión ORDS está comprobada y funciona por HTTPS.

Fuentes: [ORDS en Autonomous Database](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/ords-rest.html), [mantenimiento SQL por HTTPS](https://docs.oracle.com/en/database/oracle/oracle-rest-data-services/25.4/orddg/rest-enabled-sql-service.html).

## Uso local y GitHub Pages

Abrir index.html → Centro operativo → Configurar por primera vez. La base permanece sin negocio ni usuarios para que el propietario elija su cuenta. Copiar SETUP_TOKEN con scripts/copy-setup-token.ps1 y pegarlo en el formulario. El token nunca se publica ni se devuelve desde /installation. Después, usar Administración para crear empleados, asignar sucursales y permitir o denegar secciones.

No es necesario iniciar Node ni autorizar la IP de cada empleado. El módulo ordinario conserva la política por defecto de ORDS para servicios públicos, permitiendo orígenes válidos del navegador. Cada operación privada exige tokens de aplicación, usuario habilitado y permisos/sucursal verificados en la base. CORS no concede permisos. Un módulo separado para Origin null permite abrir por doble clic sin cookies. Se verificaron solicitudes y preflight desde orígenes locales y un origen HTTPS de GitHub Pages; el sitio todavía no está publicado en Pages.

El bundle clásico y las rutas hash permiten abrir admin/index.html por file://. Desde ese origen no se instala un service worker. Live Server y HTTPS son los entornos para probar la PWA y el funcionamiento offline completo. Se comprobó Chrome conectado a Oracle en ambos modos; otros navegadores y dispositivos requieren ensayos de entrega.

El workflow publica dist/ con la URL de api-config.js; PUBLIC_API_URL es opcional para cambiar de endpoint. Elegir Settings → Pages → Source → GitHub Actions una vez; **Publicar frontend en GitHub Pages** se ejecuta automáticamente al actualizar main. También admite ejecución manual desde Actions en main. No cargar .env, wallet ni exports. La API permanece en Oracle cuando se cierra este equipo.

## Backend y sesiones

Los paquetes alliance_security, alliance_administration, alliance_catalog, alliance_pos_store, alliance_pos_finance, alliance_pos y alliance_api implementan autenticación, accesos, catálogo y operación por sucursal. Los paneles de las tarjetas llaman a /pos; los clientes con QR llaman a /pos/public. Los módulos alliance.api y alliance.file publican los handlers. No se activó AutoREST para exponer tablas ni se entregaron credenciales SQL al navegador.

Las contraseñas conservan PBKDF2-HMAC-SHA256, sal aleatoria de 16 bytes y 600.000 iteraciones. El acceso actual usa verificadores SCRAM y pruebas de un solo uso: WebCrypto calcula PBKDF2 en el navegador y la base verifica la prueba sin repetir el bucle PL/SQL. Las cuentas anteriores mantienen compatibilidad y se convierten al comprobar su contraseña. Consulta [Rendimiento y autenticación](performance.md) para las mediciones, límites y actualización de verificadores.

Access y refresh son tokens opacos aleatorios de 32 bytes; Oracle guarda únicamente sus hashes. Access dura 15 minutos, la sesión 7 días, con renovación rotatoria y cierre revocable. Access vive en memoria del frontend y refresh en sessionStorage de la pestaña, nunca en la URL. Una sesión activa previamente validada puede recuperarse desde el almacén cifrado del equipo y confirmarse en segundo plano, respetando su vigencia y los marcadores de cierre. No depende de cookies de terceros. La prevención de XSS y CSP siguen en la fase de seguridad.

Modificar accesos o suspender un usuario revoca sus sesiones. La cuenta propietaria queda protegida. Cada solicitud resuelve la autorización desde tablas. Administración y catálogo serializan cambios por negocio, con auditoría y rollback. Los productos offline conservan ID, versión e idempotencia.

## Mantenimiento reproducible

~~~powershell
npm run ords:install
npm run ords:test
npm run ords:package
~~~

ords:install requiere .env privado. Comprueba la compilación antes de publicar, conserva datos y configura únicamente el hash del token inicial si no existe. No repite 001–007. ords:package genera database/ords/install.sql como un solo bloque para el botón verde, sin contraseñas. En instalaciones nuevas, configurar el token mediante el script privado. DDL Oracle no se deshace con rollback: revisar USER_ERRORS si se interrumpe una actualización.

Las pruebas reales crean negocios temporales marcados por UUID y slug de validación, comprueban 28 condiciones y los eliminan sin reiniciar el esquema. El alta inicial también se ensayó dentro de una transacción revertida para conservar la base vacía.

Antes de entrega productiva: migrar de ADMIN a un esquema de aplicación, completar recuperación del propietario, limitación adicional de abuso, monitoreo, backups y ensayos de carga. El backend Fastify conservado utiliza scrypt para nuevas contraseñas, mientras ORDS utiliza PBKDF2: no alternar escrituras de usuarios entre implementaciones sin migrar ese formato.


El centro operativo administra usuarios y accesos para la sucursal seleccionada. Las tarjetas abren el mismo panel operativo de Nápoles, con datos y marca separados en Oracle. Ver [funcionamiento y alcance](branch-operation.md).
