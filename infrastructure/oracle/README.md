# Oracle ATP

Una base central y un esquema de aplicación con permisos de instalación controlados. Pool node-oracledb Thin, bind variables y commits explícitos. Credenciales/wallet en entorno, fuera del frontend/repositorio. Ver [deployment](../../docs/deployment.md) y [modelo](../../docs/database.md).

Separar usuario de instalación del de ejecución al endurecer producción; este último necesita SELECT/INSERT/UPDATE de las tablas utilizadas y no permisos DDL ni DELETE financiero. No hay base aprovisionada ni credenciales en esta entrega.
