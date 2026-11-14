# Eliminación y recreación por negocio

La papelera elimina el acceso del negocio abierto mediante una operación específica, distinta de pausar una cuenta. Una cuenta nueva puede usar el mismo nombre y contraseña en ese negocio, con otro ID y sin heredar comandas, ventas atribuidas, propinas ni indicadores del usuario anterior.

Si la identidad anterior aún tiene acceso a otro negocio, ese acceso, sus credenciales y su sesión permanecen vigentes. Al retirar el último acceso, la cuenta se marca como eliminada, se oculta del equipo y se revocan sus sesiones. Los IDs históricos permanecen para conservar las referencias de ventas y auditoría; no se borran cobros, inventario o comprobantes.

Desde el centro administrativo, una cuenta con varios accesos exige seleccionar el negocio antes de eliminarla. La papelera no elimina todos sus negocios de una vez.

Los nombres son exclusivos entre cuentas asignadas al mismo negocio, incluidas las cuentas pausadas. Pueden repetirse en negocios distintos. El acceso usa el negocio seleccionado para resolver la identidad; una entrada central ambigua pide seleccionar negocio y nunca escoge una cuenta al azar. El propietario principal conserva su protección.

Las escrituras de perfil y accesos comprueban los nombres bajo el bloqueo transaccional existente de la organización. Dos altas simultáneas con el mismo nombre en el mismo negocio producen una creación y un conflicto; no quedan usuarios duplicados. Se reutilizan los índices de acceso y se añade un índice para consultar la auditoría de cada usuario.

La eliminación registra un corte de progreso por negocio en la auditoría existente. Si una identidad compartida se vuelve a asignar, el resumen ignora sus comandas anteriores a ese corte exclusivamente en el negocio retirado. Las cuentas recreadas con ID nuevo empiezan de cero directamente.

Las credenciales cifradas del dispositivo se guardan por negocio. Los perfiles anteriores se migran cuando se utilizan, conservando su cifrado y revocación; recrear una cuenta con el mismo nombre no permite restaurar la identidad eliminada.

Migraciones: 017_scoped_users.sql prepara la columna y los índices; 018_release_usernames.sql retira la restricción global antigua únicamente después de comprobar la compilación de la API. El proveedor Node dispone de 008_scoped_users.sql.

Verificación: npm run ords:test:users usa una organización temporal y prueba los cuatro tipos de negocio, identidad nueva, sesiones, nombres repetidos entre negocios, usuarios pausados, accesos compartidos y concurrencia. Las pruebas de navegador cubren eliminar, recrear y comprobar el progreso en cero conservando las ventas históricas.
