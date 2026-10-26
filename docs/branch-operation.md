# Panel operativo por sucursal

Las tarjetas de index.html representan las sucursales iniciales: GCOBARF, Olivia Coctelería y Olivia Cafetería. Abren el panel de Nápoles adaptado a Oracle. Comparten operational/app.js, su estilo y su transporte; cada sucursal conserva nombre, color, mesas, cuentas, inventario, movimientos y ventas propios.

## Empezar

1. Si todavía no existe el propietario, entra a Centro operativo → Configurar por primera vez. Define su usuario y contraseña y usa el token privado de instalación. Este paso se realiza una vez.
2. Abre una tarjeta de sucursal e inicia sesión con las credenciales de aplicación. El identificador inicial del negocio es tc-alliance, salvo que lo hayas cambiado al configurarlo.
3. Usa Inicio, Atender mesa, Cuentas, Inventario, Movimientos, Ventas, Costo de productos, Insumos y compras, Clientes y cartera y Mesas como en Nápoles. Marca permite personalizar colores e imágenes.
4. Usuarios muestra la gestión de accesos dentro del mismo panel, con el menú lateral y la sucursal actual, sin navegar a otra página. Un usuario nuevo recibe inicialmente acceso a la sucursal seleccionada; el propietario puede asignarle otras y ajustar sus roles y permisos.

El propietario entra a todas las sucursales habilitadas con la misma cuenta. Los empleados solo entran a las asignadas. Las contraseñas no son PIN locales ni credenciales de Oracle. Cambiar accesos o suspender a un empleado revoca sus sesiones.

## Persistencia y cobro

Oracle conserva 24 mesas y seis terrazas y seis materas iniciales por sucursal. El catálogo empieza vacío: no se importan usuarios, productos o ventas del sistema de referencia. La inicialización no repone mesas eliminadas en aperturas posteriores.

El cobro confirma factura, pagos, descuento de existencias, cierre de cuenta y movimiento en una transacción. Oracle verifica los consumos actuales, recalcula importes y costos, rechaza existencias insuficientes y reconoce los reintentos. La interfaz espera esa confirmación antes de anunciar el pago. El cobro necesita conexión; la certificación completa de ventas offline del documento de requisitos queda pendiente.

Los formularios y alarmas conservan la lógica de Nápoles. El panel consulta cambios cada cinco segundos y el chat cada 1,2 segundos. Los QR usan códigos aleatorios por mesa; un cliente puede consultar su cuenta, pedir productos, llamar al personal y escribir en su chat. No obtiene acceso administrativo. Sin QR se muestra la carta pública, sin cuentas.

Eliminar una venta la anula y devuelve sus unidades. Los reinicios de ventas y movimientos retiran el historial de la vista, conservando registros en Oracle para auditoría y sin alterar existencias. Vaciar inventario requiere que no haya cuentas con consumos abiertos. Las imágenes de marca se comprimen y se guardan en la configuración de Oracle.

## Desarrollo

La URL se define una vez en api-config.js. Las credenciales Oracle permanecen en .env privado. El panel funciona desde Live Server, por doble clic y como archivos estáticos en Pages; no requiere iniciar una API local. La API publicada continúa ejecutándose en Oracle cuando este equipo se cierra.

`npm run build` prepara admin/ y dist/. `npm run ords:install` actualiza la implementación PL/SQL. `npm run ords:test:pos` prueba operaciones y pantallas contra Oracle usando únicamente datos temporales. Los archivos de Supabase y los scripts de clonación antiguos son referencia histórica; no configuran este flujo.

Esta adaptación conserva el panel y conecta su operación. Los requisitos adicionales de caja compartida, recetas, costeo avanzado, recuperación offline, concurrencia y migración de datos se siguen evaluando contra requirements.md; no se consideran terminados por esta adaptación.

## Demostración y cuenta de revisión

Cada acceso incluye Volver a negocios y Abrir demostración local. La demostración abre el mismo motor operativo, con productos de ejemplo y almacenamiento separado por sucursal en el navegador; permite probar cuentas y cobros sin llamadas a Oracle. Usuarios muestra la misma gestión de accesos integrada en el panel, en modo de demostración.

A petición del usuario se creó admin como Administrador temporal en tc-alliance, con acceso de propietario a las tres sucursales. Sus credenciales de revisión se guardan en .env privado. No se elimina ni se deshabilita automáticamente; su retirada queda pendiente de la instrucción del usuario. La política de contraseñas de las cuentas nuevas no se modificó.


Desde el portal puedes elegir **Mesero · Tomar pedidos** antes de seleccionar el negocio. La comanda llega a Inicio de esa sucursal y se agrega a su mesa únicamente al aceptarla. Cocina se atiende desde Inicio y el turno se registra en Ventas, con su base, horario y responsable. El Asistente IA queda en pausa y su código se conserva. [Guía de comandas y turnos](orders.md).


## Usuarios dentro del negocio

El enlace **Usuarios** abre la misma gestión de accesos del Centro operativo dentro del panel actual, como Inventario o Ventas. Conserva el menú lateral, la sesión y la sucursal; la dirección mantiene el mismo archivo admin.html con la sección #users. No abre una ventana ni una página incrustada. Crear usuarios, editar roles y permisos y consultar Seguimiento conservan las reglas existentes. El acceso inicial del nuevo usuario queda situado en la sucursal actual; el jefe puede asignarle otras desde la ficha. Centro operativo sigue disponible desde el portal.

La pantalla comparte el transporte autenticado del panel, incluida la renovación de sesión. Los cambios de usuarios y permisos se confirman en Oracle con conexión; no se guardan permisos sin confirmar en una cola de cambios locales. La demostración conserva la vista de revisión sin crear cuentas reales.

## Registrar una compra y conocer el costo por unidad

En **Insumos y compras → Compras**, el formulario aparece directamente en cualquier sucursal. Solo pide:

1. **Nombre del producto:** por ejemplo, Cerveza.
2. **Cantidad comprada:** por ejemplo, 30 unidades.
3. **Valor total de la compra:** por ejemplo, $62.000 por todas las unidades.

Al escribir, muestra **Cada unidad te cuesta**. En ese ejemplo, $62.000 ÷ 30 = aproximadamente **$2.067** al peso más cercano. El registro conserva internamente el cociente completo; el formato visual no agrega centavos finales. Pulsa **Guardar compra** para conservar el nombre, cantidad, total, costo unitario, fecha y responsable.

Este formulario no necesita proveedores ni insumos existentes y no pide factura, método de pago o saldos pendientes. Las pestañas Insumos y Proveedores conservan sus pantallas. Los registros directos sirven para consultar el costo por unidad; no crean proveedores, insumos, productos de inventario ni movimientos de caja. Las compras antiguas vinculadas a proveedores conservan sus registros y abonos existentes.

La operación se confirma en Oracle por sucursal con el permiso de compras. Sin conexión, se conserva en la cola del dispositivo y se envía con su identificador al reconectar, evitando repetir el registro. La demostración usa el mismo formulario con datos locales separados de Oracle.
