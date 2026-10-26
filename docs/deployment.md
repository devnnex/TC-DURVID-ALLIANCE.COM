# Ejecución y despliegue

## Conexión ya instalada

La API ORDS está publicada dentro de Oracle JOlivia. La URL pública de api-config.js funciona desde Live Server, doble clic y el frontend de GitHub Pages. Las credenciales Oracle permanecen en .env privado. [Arquitectura y mantenimiento](public-api.md).

Para empezar, abrir index.html → Centro operativo → Configurar por primera vez. Ejecutar scripts/copy-setup-token.ps1 y pegar el token en el formulario. Elegir propietario y sucursales, guardar e iniciar sesión. El alta de usuarios y permisos se hace desde Administración.

El navegador usa la API directamente: no es necesario arrancar Fastify, instalar wallet ni configurar la IP de cada sucursal. La API continúa disponible cuando se cierra el equipo del desarrollador, mientras Oracle esté disponible.

## Construir y publicar

Node 22.12+ y npm. El runtime portátil de esta estación está bajo ../.tools/.

~~~powershell
npm ci
npm run build
~~~

La compilación crea admin/ para Live Server y dist/ para publicación. Las rutas del panel usan hash y los recursos relativos admiten el prefijo del repositorio. El doble clic funciona con bundle clásico; la PWA y sus service workers se prueban desde Live Server o HTTPS.

Subir el contenido de TC-DURVID-ALLIANCE a la raíz del repositorio, incluida .github/, y elegir **Settings → Pages → Source → GitHub Actions** una vez. Cada actualización de main ejecuta **Publicar frontend en GitHub Pages**: valida, construye y publica dist/. También se puede ejecutar manualmente desde Actions en main. PUBLIC_API_URL es opcional; la URL ORDS ya está configurada. No incluir .env, wallet, exports ni secretos Oracle. No se ha publicado el repositorio en esta entrega.

## Actualizaciones del backend

Editar database/ords/, ejecutar npm run ords:install con .env privado y revisar la validación. El script compila antes de publicar y conserva las tablas/datos existentes. npm run ords:package genera el bloque install.sql para Database Actions. No repetir 001–007 ni ejecutar seed en JOlivia. Las credenciales de mantenimiento nunca llegan a GitHub Pages.

## Pruebas aisladas y alternativa Node

npm test ejecuta Vitest; npm run test:browser levanta una API memory aislada. npm run ords:test ejecuta las comprobaciones reales y elimina únicamente sus negocios temporales. scripts/check-ords-browser.ts comprueba la conexión del navegador real sin enviar altas.

apps/api, los scripts Node/TLS y Docker se conservan como alternativa. No forman parte del recorrido ORDS desplegado; tampoco deben escribir contraseñas scrypt sobre los usuarios PBKDF2 de ORDS sin una migración de formato.

## Entrega productiva

Las pruebas realizadas están en [validation.md](validation.md). Ventas, caja, compras, recetas, seguimiento y operación offline están implementados y probados en los recorridos documentados. Falta la aceptación con datos reales, dispositivos e impresoras del cliente, y medir capacidad con su volumen de trabajo. Publicar el frontend no declara completo el POS ni migra automáticamente Supabase/Apps Script.

El portal inicia la instalación del PWA desde la elección de negocios. El centro del jefe reúne usuarios, permisos y seguimiento de actividad en todas las sucursales; consulta [Equipo y seguimiento](team-activity.md) para usarlo y actualizarlo.
