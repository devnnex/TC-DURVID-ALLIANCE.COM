# Equipo y seguimiento

Desde el panel de cualquier sucursal, **Usuarios** abre el mismo centro operativo del jefe y conserva la sucursal actual. El jefe usa su misma cuenta para consultar cada negocio.

En **Usuarios y permisos** se puede buscar una persona, consultar su estado y crear o editar sus accesos. La vista muestra el equipo de la sucursal seleccionada; **Mostrar todo el equipo** permite consultar los demás usuarios. La cuenta del jefe permanece protegida.

En **Seguimiento** se consulta quién realizó cada acción, en qué sucursal y cuándo. Se puede filtrar por persona, sección, sucursal, visitas o cambios y período. **Actualizar** obtiene las acciones más recientes; **Ver más actividad** consulta los registros anteriores.

Oracle atribuye las acciones al usuario autenticado. Registra inicio y cierre de sesión, visitas autorizadas, atención de mesas y conversaciones, cambios en cuentas y productos, inventario, ventas, configuración, usuarios y accesos. El costeo detalla altas, ediciones y bajas de ingredientes, recetas, gastos y canales; registra también la configuración, la aprobación de un producto y su retiro del historial. Los formularios fallidos no se presentan como cambios realizados y los reintentos de la misma operación no duplican el registro. Las consultas automáticas y los avisos de escritura del chat quedan fuera del seguimiento visible.

Las acciones realizadas desde un QR de mesa se identifican como **Cliente de mesa**, con la sucursal y el registro correspondiente. No se atribuyen a un empleado: incluyen apertura de cuenta, solicitudes, mensajes y productos añadidos por el cliente.

El costeo muestra quién lo guardó por última vez; cada producto aprobado muestra quién guardó su ficha. Abrir un cálculo anterior conserva su responsable y el borrador actual. Las visitas indican que se abrió una sección, sin afirmar que se realizó una venta o modificación. La nueva vista recoge actividad desde la instalación de esta actualización; la auditoría anterior de Oracle se conserva.

La demostración conserva su seguimiento en este dispositivo, separado de Oracle, con un límite de 500 entradas. Las acciones de práctica no se registran como cambios reales.

## Instalación desde el portal

Abrir `index.html` mediante Live Server o el enlace HTTPS de GitHub Pages. El portal ofrece **Instalar Alliance** cuando el navegador admite esa opción. En iPhone o iPad se usa **Compartir → Agregar a inicio**. La aplicación instalada inicia en la elección de negocios y permite recorrer los accesos y paneles.

Las rutas del manifiesto y del service worker son relativas, también cuando GitHub Pages utiliza una carpeta del repositorio. El caché contiene archivos públicos de la interfaz; las respuestas de la API y los datos privados no se guardan en él. El portal puede abrirse sin conexión después de cargarse; las operaciones reales conservan sus controles de sesión y confirmación en Oracle.

## Mantenimiento

`npm run build` actualiza el frontend y los archivos listos para Live Server/GitHub Pages. `npm run ords:install` instala la tabla de seguimiento y actualiza los paquetes de la API conservando datos y usuarios. `npm run ords:test:activity` verifica identidad, permisos, sucursales, reintentos, fallos, responsables de costeo, paginación y la interfaz real mediante cuentas temporales aisladas.
