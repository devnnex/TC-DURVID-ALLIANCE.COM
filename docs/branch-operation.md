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
## Análisis de meseros y avisos de insumos · 24 de noviembre de 2026

En Cafetería y Coctelería, **Ventas → Estadísticas → Meseros** reúne el progreso que antes aparecía en Usuarios. Muestra ventas cobradas, propinas recibidas y comandas por cerrar; cada integrante conserva sus facturas, abonos y desglose. El período del equipo se elige en su propio selector. Las estrellas describen el cierre de comandas, no satisfacción ni horas trabajadas. Se mantienen los permisos previos de consulta del equipo. GCOBARF y Sucursal conservan su ubicación anterior.

Todos los negocios tienen una campana para sus jefes. Cada aviso explica la disponibilidad y el faltante para llegar a diez unidades. La capacidad usa los insumos compartidos, sus medidas y reservas; en producción terminada utiliza las unidades pendientes y el consumo real del lote. Los productos ocultos no se anuncian. Reponer diez unidades o recuperar el mínimo del insumo resuelve el aviso.

**Activar notificaciones** se pulsa una vez por jefe, negocio y dispositivo. La suscripción y la autorización se conservan al recargar, cerrar sesión y volver a entrar. Con permiso ya concedido, la app puede recuperar una suscripción caducada sin repetir la solicitud de permiso. **Desactivar notificaciones** retira ese dispositivo; borrar los datos del navegador o revocar su permiso también puede requerir activarlo de nuevo. El remitente vuelve a comprobar el rol real de jefe antes de enviar.

La PWA del administrador y la del mesero usan el logo guardado en Marca, conservando identidades separadas. Los avisos también utilizan ese logo. En iPhone, las notificaciones web corresponden a la app agregada a la pantalla de inicio ([documentación de Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).

### Activación del servicio de envío

La bandeja dentro del sistema funciona con su inventario actual. Los avisos con la app cerrada necesitan instalar la API adicional y mantener el remitente ejecutándose en un servidor privado:

```powershell
npm run notifications:configure
# Después de completar ORACLE_USER y ORACLE_PASSWORD_BASE64 en .env privado:
npm run notifications:configure -- --apply
npm run notifications:worker
```

El primer comando crea las claves VAPID en `.env`, excluido de Git. La instalación agrega tablas, valida la compilación y publica solo la clave pública. La clave privada permanece en el remitente. `infrastructure/deployment/stock-notifications.service.example` muestra una ejecución continua. Consulta Oracle cada treinta segundos, solicita únicamente insumos y existencias, y programa recordatorios a las **6:30 a. m. y 6:30 p. m., America/Bogota**, mientras exista el faltante. La entrega final también depende del navegador, la red y el proveedor de push.

Como alternativa, `Recordatorios de insumos` en GitHub Actions ejecuta un ciclo cada cinco minutos cuando `STOCK_NOTIFICATIONS_ENABLED=true`. Requiere los secretos `ORACLE_USER`, `ORACLE_PASSWORD_BASE64`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y la variable `VAPID_SUBJECT`. GitHub puede retrasar tareas programadas; para aproximarse a la hora indicada se recomienda el servicio continuo. La clave por franja impide repetir la misma entrega durante reintentos del trabajador.

Se instaló la API en Oracle y se configuraron los secretos y la activación del remitente de GitHub Actions. Las tres sucursales activas devolvieron existencias reales sin errores de compilación. Cada jefe debe pulsar **Activar notificaciones** una vez en su dispositivo; sin esa autorización no existe un destinatario push. El envío programado comienza al publicar este cambio en `main`. Con esta modalidad la revisión ocurre cada cinco minutos y GitHub puede retrasarla; no se garantiza entrega al segundo de las 6:30. Para una frecuencia de treinta segundos puede instalarse el servicio continuo indicado arriba.
