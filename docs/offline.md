# Trabajar un turno sin internet

El panel de cada sucursal guarda una copia de sus datos y una cola de operaciones en IndexedDB. El mismo mecanismo se usa en las cuatro sucursales y en las sucursales adicionales. Oracle sigue siendo el registro central.

## Preparar el equipo una vez

1. Abre el portal con Live Server o desde GitHub Pages sobre HTTPS. Instala la PWA si quieres un acceso directo.
2. Inicia sesión con internet en la cuenta y sucursal que usarás. Deja que termine la descarga inicial.
3. Registra las existencias, las recetas, clientes y proveedores reales que necesites. Revisa el estado de sincronización antes del turno.

La primera entrada de una cuenta en un equipo requiere internet. Después se conserva una autorización local durante siete días desde la última verificación, coherente con la duración máxima de la sesión Oracle. Se verifica la contraseña mediante PBKDF2; no se guarda la contraseña. La renovación de sesión guardada para recuperar la cuenta activa se cifra con AES-GCM. Salir conserva los pendientes y exige verificar la cuenta para volver a entrar.

## Durante el turno

Puedes atender mesas, registrar consumos, ventas y cobros, trabajar con insumos, compras, comandas, clientes, abonos, caja y costeo usando los datos descargados. Cada cambio se guarda antes de mostrar la confirmación local. El aviso inferior diferencia trabajo sin conexión, registros pendientes y registros que necesitan revisión. La página puede cerrarse y reabrirse sin perder la cola, siempre que el navegador conserve su almacenamiento.

Las operaciones del jefe que requieren validación central, como cambiar accesos, corregir o anular ventas confirmadas y reiniciar historiales, necesitan conexión. El catálogo público QR y el centro de usuarios no sustituyen la descarga y autorización del panel de trabajo. Los equipos desconectados no reciben las nuevas comandas o cambios de otros equipos mientras no puedan comunicarse con Oracle.

## Al volver la conexión

La aplicación inicia el envío en cuanto hay conexión y agrupa hasta 20 operaciones por petición, en orden, con el identificador original y bajo la cuenta que las creó. Los grupos grandes también tienen un límite de tamaño. El envío conserva las operaciones agregadas mientras se sincroniza; no requiere recargar la página. Solo retira un pendiente cuando Oracle lo confirma. Si una operación del grupo necesita revisión, Oracle conserva las anteriores confirmadas y detiene las siguientes; el navegador conserva las restantes. Si se pierde la respuesta después del guardado, Oracle reconoce el reintento y no vuelve a descontar inventario ni repetir el cobro. Tras confirmar la cola, descarga el estado central actualizado; también consulta cambios nuevos mientras sigue abierta y conectada. La comprobación automática ocurre cada cinco segundos, y la descarga central ordinaria tiene una separación mínima de quince segundos para evitar solicitudes completas continuas. Después de confirmar cambios locales o volver a la ventana se comprueban los pendientes; una cola confirmada fuerza la descarga actualizada. Esto es sincronización en segundo plano, no comunicación instantánea entre equipos.

El jefe puede consultar desde casa lo que los equipos hayan sincronizado. Un equipo que aún no se ha conectado conserva sus registros localmente: ningún servidor puede mostrar registros que todavía no recibió.

Una receta cambiada en otro equipo, edición obsoleta, falta de existencias o crédito insuficiente o cambio de permisos detiene el registro para revisión. No se resuelve sobrescribiendo o borrando silenciosamente. En Estado puedes reintentar después de corregir la causa o revisar una edición, conteo o cierre. Una revisión conserva el intento original; si una caja ya fue cerrada por otro equipo, el segundo conteo queda separado del cierre original.

Si cambió una receta, la revisión muestra los ingredientes actuales antes de confirmar. Confirma únicamente si corresponden a lo que preparaste; la venta conserva el valor cobrado y Oracle valida los consumos y su costo al confirmarla.

El jefe puede habilitar expresamente registrar existencias por revisar en Insumos. Está desactivado de forma predeterminada; conserva movimientos y saldos negativos visibles y exige reconciliarlos antes de desactivarlo. No inventa compras ni existencias.

## Datos e instalación

Cada copia y cola se separa por API, negocio, sucursal y usuario. Una cuenta no envía los pendientes de otra. La auditoría central conserva el responsable autenticado, equipo, hora del equipo y fecha de confirmación en Oracle.

El resumen offline contiene ventas recientes descargadas y ventas locales. Si la descarga alcanza su límite de 2.000 ventas, se indica que el historial es parcial. Al conectar y confirmar pendientes, el reporte consulta el historial central del período elegido. Los precios y costos originales de cada venta permanecen guardados.

Para trabajar sin internet y poder reabrir la aplicación usa Live Server en localhost o la PWA de GitHub Pages/HTTPS. El doble clic permite abrir archivos, pero file:// no instala un service worker. Instalar la PWA y guardar datos locales no reemplaza el respaldo central: no borres datos del navegador con registros pendientes y usa un perfil normal, no privado.

La implementación alternativa de /admin/ con Dexie conserva sus pruebas de catálogo; la operación multisucursal descrita aquí corresponde a los paneles conectados a Oracle ORDS.


Inicio y la vista del mesero comprueban además una versión breve de las comandas cada dos segundos mientras están visibles y conectados. Cuando cambia, descargan la sucursal actualizada. Las consultas de versión no generan visitas ni eventos de auditoría, y no descargan historiales completos si los pedidos siguen iguales. Los pedidos creados sin conexión llegan a otros dispositivos solamente al enviarse; se conservan los cambios de cuenta o precio para revisión. [Comandas](orders.md).
