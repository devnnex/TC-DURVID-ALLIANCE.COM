# Probar Alliance conectado a Oracle

**Actualización 2026-10-09:** la conexión principal está activa mediante Oracle ORDS. Live Server y GitHub Pages usan la misma API HTTPS. Ver [conexión y mantenimiento](public-api.md). Los pasos Node/TLS siguientes corresponden a la alternativa técnica conservada.

El frontend llama a nuestra API (`/api/v1`). La API conecta a Oracle y valida el usuario, la sucursal y sus permisos. Es el equivalente al servicio backend que consultabas con Supabase o Apps Script: las credenciales Oracle quedan en el servidor y no se incluyen en el frontend.

```
Frontend http://127.0.0.1:4173/admin/
    → /api/v1 → API Node http://127.0.0.1:3001
    → Oracle ATP: una base central
```

La URL de Database Actions es el editor SQL. Para conectar la API se necesita la **cadena de conexión** de la base, el **usuario del esquema** y su **contraseña**. Las migraciones 001–007 ya fueron confirmadas como ejecutadas por el usuario: el arranque de pruebas no las vuelve a ejecutar ni carga datos ficticios.

## Obtener los datos en Oracle Cloud

1. Entra a tu consola de Oracle Cloud y abre la base Autonomous Database donde ejecutaste los SQL.
2. Abre **Database Connection / DB Connection / Conexión de base de datos**.
3. Si la lista **Connection Strings** permite elegir **TLS**, selecciónalo y copia la cadena del servicio de tu base. No copies la URL del editor. El servicio `_tp` corresponde al uso transaccional si tu base lo ofrece; el asistente también acepta las otras cadenas de servicio.
4. Ten a mano el usuario del esquema que contiene las tablas (en las capturas usaste **ADMIN**) y su contraseña de base de datos. Esa contraseña no es necesariamente la de tu cuenta de Oracle Cloud.

La conexión TLS sin wallet exige que la instancia esté configurada para aceptarla. Oracle documenta configurar la lista de acceso para la IP/red del servidor y desmarcar **Require mutual TLS (mTLS) authentication**. Si quieres usar esa modalidad, revisa esos ajustes en los detalles de la base antes de copiar la cadena; conserva el acceso de los equipos que ya utilizas. La configuración de la instancia pertenece a Oracle Cloud y no la cambia el frontend. [Referencia oficial de TLS y mTLS](https://node-oracledb.readthedocs.io/en/v6.9.0/user_guide/connection_handling.html#connecting-to-oracle-cloud-autonomous-databases).

Si tu base exige mTLS, en esa misma ventana pulsa **Download Wallet**, define la contraseña solicitada, descarga y descomprime el ZIP en una carpeta privada. Un wallet es ese archivo de conexión segura: la API necesita la carpeta con `ewallet.pem` y `tnsnames.ora`, su contraseña y un alias de `tnsnames.ora`. El asistente admite esta modalidad sin cambiar el código de la aplicación. Nunca copies el wallet a `assets`, `dist` ni al frontend. [Archivos necesarios para el driver Thin](https://node-oracledb.readthedocs.io/en/v6.9.0/user_guide/connection_handling.html#install-the-wallet-and-network-configuration-files).

## Iniciar las pruebas

Desde la carpeta **TC-DURVID-ALLIANCE**, ejecuta en la terminal PowerShell de VS Code:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-oracle.ps1
```

La primera vez aparece el asistente. Elige **1** para TLS o **2** para wallet; introduce los datos en esa terminal. Las contraseñas se escriben ocultas y no se muestran. Para TLS puedes copiar la cadena desde Oracle y pulsar Enter en el asistente para que la lea del portapapeles y una sus líneas automáticamente. Se guarda en `.env`, archivo privado excluido de Git; los secretos de sesión/instalación se generan automáticamente y se conservan cuando cambias la conexión. Las contraseñas que el asistente guarda como BASE64 están codificadas, no cifradas: el archivo sigue siendo privado. El comando de PowerShell permite ejecutar estos scripts en esa sesión y no cambia la política del equipo.

El arranque comprueba conexión real, las columnas de las 19 tablas, restricciones habilitadas, unidades, permisos iniciales y el registro de instalación. Después compila e inicia frontend y API. Ante un error muestra el dato que debe revisarse y detiene el arranque. Mantén abierta esa terminal; **Ctrl+C** detiene ambos servidores.

Abre **http://127.0.0.1:4173/admin/**. El acceso debe mostrar **Conectado a Oracle**. Los datos guardados se conservan en Oracle al reiniciar la API. Este entorno usa el frontend compilado con PWA y Oracle real, con HTTP limitado al equipo local; no equivale todavía a un despliegue público con HTTPS.

Si necesitas corregir usuario, contraseña, cadena o modalidad:

```powershell
.\scripts\configure-oracle.ps1
.\scripts\start-oracle.ps1
```

Para comprobar solo la conexión, si Node/npm ya están en PATH: `npm run db:check`. Es una comprobación de lectura; no inserta sucursales, usuarios ni ventas. No ejecutes `db:migrate` sobre esta instalación manual sin reconciliar antes su registro de migraciones.

## Primera configuración y prueba como administrador

1. En el frontend entra a **Configurar por primera vez**, o abre `/admin/#/setup`.
2. En otra terminal PowerShell, desde TC-DURVID-ALLIANCE, ejecuta `.\scripts\copy-setup-token.ps1`. Copia el token privado al portapapeles sin imprimirlo. Pégalo en **Token de instalación** del formulario.
3. Confirma nombre/identificador del negocio, todas las sucursales, colores/estado y el usuario/contraseña del propietario. El cuarto espacio sigue editable y deshabilitado hasta definirlo.
4. Guarda, inicia sesión y entra a **Administración**. Crea un empleado, asígnale una sucursal y prueba sus permisos. La pantalla inicial reconoce los negocios ya configurados y evita proponer otra instalación.
5. Crea un producto y espera su confirmación central. Recarga la página; abre el mismo negocio en otro perfil del navegador y confirma que aparece desde Oracle.
6. Suspende al empleado desde el propietario y comprueba que su sesión deja de poder operar. Cambia sus roles/permisos y prueba nuevamente después de habilitarlo e iniciar sesión.
7. Para probar el catálogo offline, carga primero esa sucursal con red, desconecta el navegador, crea un producto y reconecta. El cambio debe pasar de guardado local a confirmado, una sola vez. Esta fase no registra aún ventas o pagos.

Para resultados útiles, anota sucursal, usuario/rol, acción, resultado esperado y observado. Reporta el mensaje de error visible; no copies `.env` ni contraseñas al chat. Las correcciones seguirán el requerimiento de `docs/requirements.md`.

## Estado de esta preparación

La configuración local, la conexión del driver, las comprobaciones y el flujo web están implementados. El usuario confirmó 001–007; todavía faltan en esta estación la cadena y las credenciales reales, por lo que no se declara que Oracle ya haya conectado. El asistente completa ese paso con los datos introducidos localmente.
