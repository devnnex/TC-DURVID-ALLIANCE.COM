# Costeo, macro y menú digital

En cafetería y coctelería, el desglose del abastecimiento automático forma parte del área desplazable de la ficha. La lista de ingredientes tiene su propio scroll visible, una indicación para deslizar y los botones de guardar y cancelar permanecen fuera del área desplazable. Los selectores largos de los modales permiten buscar y elegir en un mismo control. El campo de capacidad muestra cifras más legibles y los costos mensuales añadidos se pueden retirar con su pequeña ×.

Las medidas de masa y volumen aparecen junto al número disponible; «unidades» conserva su posición inferior. Nuevo insumo y Vaciar todos los insumos ocupan la parte superior de la macro. El inicio muestra el nombre configurado en Marca y Mesas queda inmediatamente antes de Usuarios, incluso después de incorporar las secciones dinámicas.

En cafetería y coctelería, el desglose de ingredientes de Movimientos utiliza filas con nombre y cantidades legibles, dentro de un área desplazable. La miniatura del Menú Digital permite añadir, cambiar o retirar la foto en una ficha independiente; se conserva la optimización a 80 KB y guardar la foto actualiza únicamente la imagen. El editor habitual omite la antigua franja de foto y muestra sus indicadores con cifras más grandes.

Al agregar desde costeo, el bloque verde reúne la cantidad de la receta, el precio, el stock mínimo y la foto. La cantidad indica si corresponde a preparaciones disponibles o a las que se completarán al guardar. Esta referencia alimenta la vista previa monetaria; no crea productos terminados ni descuenta ingredientes por consultar la ficha. El aviso de abastecimiento y su desglose quedan en el mismo bloque.

Buscar insumo permite escribir o elegir una opción de la macro en un desplegable inferior. El filtrado utiliza los datos cargados, sin otra consulta al servidor, y conserva el texto al cerrar con Escape.

## Vaciar las cantidades

Vaciar todos los insumos requiere conexión, permiso de inventario y rol de jefe o propietario de esa sucursal. El sistema pide escribir VACIAR y confirma la revisión consultada en el servidor. No se puede vaciar con consumos de recetas en cuentas abiertas, incluyendo preparaciones que ya descontaron los ingredientes. Tampoco se ofrece mientras hay cambios locales pendientes de enviar.

Al confirmar se dejan en cero las cantidades físicas de los insumos activos. Se conservan sus nombres, unidades, costos de referencia, alertas y vínculos a recetas. Cada salida conserva responsable, fecha y valor calculado; el abastecimiento anterior queda en el historial. Se libera la cobertura de abastecimiento automático de las recetas para poder volver a agregarlas desde costeo y repetir una práctica. La operación completa se confirma o se revierte, y sus reintentos no duplican salidas. Esta función no se ejecuta en GCOBARF.

## Suspender un producto

Cada producto del Menú Digital tiene un interruptor Activo/Suspendido. Suspender impide ofrecerlo para nuevas ventas y no modifica insumos ni capacidad. Agotado sigue significando que no hay capacidad según los ingredientes. Se necesita permiso de edición de productos para cambiar el interruptor.

El interruptor queda junto al nombre del producto. El KPI **Costo de productos** suma la capacidad disponible por el costo unitario registrado de cada producto; la valoración física de insumos permanece en la macro. Las recetas siguen compartiendo ingredientes y las capacidades son referencias individuales.

## Movimientos al registrar desde costeo

El registro conserva una foto de la capacidad antes y después del abastecimiento y de los ingredientes disponibles por preparación. En Movimientos se muestra cuántos eran preparables en ese momento y se puede abrir su desglose. Es una referencia de capacidad compartida entre recetas; no se contabiliza como otra compra ni como entrada de productos terminados. Cambiar existencias después no altera esa foto. Los ceros históricos no se reconstruyen con cantidades actuales.

GCOBARF ya registra la cantidad efectivamente incorporada como Entrada de producción. Se omite la ficha adicional de cero al incorporar esa producción, conservando sus movimientos reales y su forma de calcular existencias.

## Avisos por evento

Las escrituras que afectan existencias o consumos activan una cola privada de revisión. Oracle comprueba los eventos pendientes cada 15 segundos y activa el remitente por HTTPS, separado de la operación del usuario. El remitente procesa una breve tanda para agrupar cambios rápidos, valida nuevamente al destinatario y evita entregas duplicadas. Se conservan el respaldo periódico y los recordatorios de insumos pendientes de las 6:30 a. m. y 6:30 p. m. en Bogotá.

Cada acceso real de una persona sin rol de jefe genera un aviso al jefe del negocio con nombre, rol y hora. Se excluyen BOSS, OWNER y el propietario, incluso si tienen otros roles. Renovar el token no genera avisos. Los avisos de acceso no tienen recordatorios y se conservan siete días. El logo y el nombre corresponden a la sucursal y se respeta la activación previa del dispositivo.

El remitente instala únicamente sus tres dependencias directas. Sus tandas revisan cambios cada cinco segundos mientras están activas, con espera progresiva ante errores, hasta cuatro entregas simultáneas y prioridad para accesos nuevos. El inventario se vuelve a revisar cuando cambia su versión o como respaldo cada minuto; la limpieza histórica ocurre una vez por hora del proceso. Las entregas completadas o reservadas se filtran y los reintentos conservan sus identificadores. La bandeja usa el push recibido para actualizarse, agrupa ráfagas y comparte resultados entre pestañas de la misma sesión mediante un canal local y un bloqueo, sin otra consulta periódica. Los iconos de cafetería y coctelería se preparan y guardan con fondo negro, incluyendo favicon, instalación y notificaciones.

La entrega al teléfono depende de la cola del remitente, el servicio push, los permisos y la conectividad del dispositivo; no se promete entrega instantánea. Las credenciales de activación permanecen en la configuración privada de Oracle y del remitente, nunca en el frontend. La configuración privada se prepara con `tsx scripts/configure-event-notifications.ts` y se activa con `--enable` después de publicar el remitente.

## Estadísticas, contactos y sobrantes entre negocios

El KPI Costo de productos explica su valor como **Lo que cuesta preparar los productos disponibles aquí**. Conserva el cálculo por capacidad individual y costo unitario. Las estadísticas mantienen el histórico completo, los costos de la venta y la separación de impuestos, propinas, crédito y cobros; simplifican las etiquetas y omiten comparaciones inexistentes. Los productos destacados muestran cinco filas por página sin scroll propio. El área general del análisis permite desplazarse sin comprimir nombres ni cantidades.

En Compras y proveedores, **Proveedores y contactos** organiza proveedores, domiciliarios, mensajerías y otros contactos. Incluye teléfono, documento opcional e información útil, con búsqueda, filtro por tipo y accesos a llamada y WhatsApp. Los contactos anteriores se interpretan como proveedores y conservan sus datos y permisos.

**Enviar desperdicios**, junto al cierre de Avisos del negocio, cambia de vista con la transición de desenfoque y respeta movimiento reducido. Solo está disponible para BOSS/OWNER con permiso de inventario. El emisor declara un sobrante independiente: nombre, cantidad, unidad, negocio receptor, jefe receptor, precio total opcional y observación. No crea, descuenta ni reserva un insumo en su propia macro.

El destino pertenece al mismo tenant y a otro negocio con macro habilitada. Solo el jefe seleccionado puede responder. Al aceptar, una única transacción agrega la cantidad a un insumo activo del mismo nombre y unidad base, o crea uno nuevo. Si existe, calcula su costo promedio ponderado; un envío sin precio entra con costo cero. El movimiento conserva cantidad, importe y responsable. Rechazar no cambia inventario. La autorización se revisa también al recuperar recibos: dobles clics, respuestas perdidas, reintentos e intentos simultáneos no duplican la entrada.

El historial semanal se consulta en páginas de 50, priorizando recepciones pendientes. A los siete días el envío deja de ser visible y aceptable. `ALLIANCE_TRANSFER_RETENTION` elimina sus filas y avisos vencidos cada hora, sin depender de una visita al sitio. El insumo y sus movimientos contables se conservan. Los recibos de idempotencia evitan que reutilizar una operación eliminada reenvíe el sobrante.

El aviso push se limita al jefe receptor, incluye remitente, negocio, cantidad y unidad, y abre la recepción al entrar. Antes de enviarlo se comprueban de nuevo permisos y estado pendiente. Comparte el remitente existente, su cola y sus límites de concurrencia; el formulario no espera una conexión al proveedor push. `npm run transfers:test:live` comprueba el circuito mediante RPC real en negocios aislados y retira sus datos al terminar.
