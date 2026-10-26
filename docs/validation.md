# Validación de esta entrega

2026-10-09, Windows, Node portátil 22.23.3 y Chrome instalado.

- TypeScript y compilación del frontend/backend: pasan.
- 55 pruebas Vitest en 7 archivos: pasan. Incluyen autorización, revocación, administración, aislamiento, catálogo offline, idempotencia, migraciones y transporte ORDS.
- 3 pruebas Playwright: pasan. Portal, adaptación móvil, doble clic y recarga de rutas, administración y reapertura/sincronización offline. Usan una API memory aislada y respuestas ORDS simuladas para la prueba estática.
- 28 comprobaciones contra Oracle real: pasan. Login, sucursales, aislamiento entre negocios, usuarios, permisos/DENY, protección del propietario, suspensión y revocación, catálogo, versión, feed, reintentos y conflicto de idempotencia.
- Chrome conectado a Oracle real desde HTTP con prefijo de repositorio y desde file://: pasa. Conexión visible, formulario inicial habilitado, cuatro sucursales editables, recarga y vista móvil sin desbordamiento. No se enviaron formularios de creación.
- CORS real: solicitudes/preflight desde localhost, un origen HTTPS de GitHub Pages y Origin null se aceptaron. Cada operación privada sigue exigiendo autorización.
- PBKDF2-HMAC-SHA256 con 600000 iteraciones: vector SQL comprobado contra Node; unos 5,7 segundos en la medición inicial. Falta evaluar carga concurrente.
- Paquetes PL/SQL compilados y módulos ORDS publicados. La configuración inicial se probó y revirtió. Las pruebas reales eliminaron exclusivamente sus negocios temporales; la base se dejó inicialmente vacía. Posteriormente, a petición expresa del usuario, se creó tc-alliance y su administrador temporal, que se conserva para revisión.

Las migraciones 001–007 confirmadas por el usuario se conservaron. No se ejecutó seed, no se reinició el esquema y no se modificó el proyecto Nápoles de referencia. Se revisaron los artefactos públicos en dist/ y admin/ frente a contraseña Oracle, JWT_SECRET, SETUP_TOKEN y cadena de conexión privados: cero coincidencias. .env no se empaqueta.

La API está publicada dentro de Oracle y su URL está configurada. El repositorio y GitHub Pages todavía no se han publicado. El ensayo HTTP con prefijo reproduce las rutas estáticas, pero no sustituye una prueba posterior en el dominio definitivo. Docker no se ejecutó; Render no forma parte del flujo desplegado.

Adaptación operativa: 39 comprobaciones reales adicionales pasaron. Incluyen 24 mesas por sucursal, catálogo y existencias separados, cuenta y consumos, pago e idempotencia, movimientos, reportes, QR y chat con aislamiento por mesa, creación de producto y cobro desde formularios reales, cambio de sucursal del propietario y alta de cajero desde el centro con accesos limitados. Chrome abrió las pantallas por HTTP y file://. Los reinicios conservaron existencias e historial de auditoría.

Pendientes según requirements.md: caja compartida completa, recetas y costeo avanzado, conciliación de datos anteriores, certificación del flujo offline de ventas y ensayos de impresión en hardware. También quedan ensayos de dispositivos, concurrencia, rendimiento y seguridad productiva. Los productos sincronizados no equivalen a ventas validadas.

Guías: [API pública](public-api.md), [administración](administration.md) y [fases hasta el 15 de octubre](roadmap.md).

Demostración actualizada: las mismas pantallas operativas, vuelta al portal, inventario de ejemplo, cobro local y centro de usuarios; Playwright comprobó cero llamadas a Oracle. La cuenta temporal real se verificó desde HTTP con prefijo de repositorio y file:// en las tres sucursales y el centro. También se comprobó la demostración por doble clic con el navegador sin conexión.

## Costeo inteligente y respuesta de la interfaz

Motor de costeo: 13 pruebas adicionales; suite completa: 68 pruebas. API Oracle: 21 comprobaciones de guardado, validaciones, lectura, historial, idempotencia, permisos y conflictos, con negocio de prueba aislado retirado al finalizar. Navegador: se verifica el archivo Excel descargado (seis hojas e importes), creación de recetas, recálculo inmediato, persistencia, historial, separación entre sucursales y presentación móvil. [Detalle y comandos](product-costing.md). La autenticación conserva su validación criptográfica: no se promete latencia cero para Oracle.

## Costeo sencillo y sesiones — 10 de octubre de 2026

- 72 pruebas unitarias aprobadas, incluidas respuestas tardías de renovación/logout sin reautenticación ni pérdida de una sesión nueva.
- Nueve escenarios de navegador aprobados: operación previa, Excel e historial, ejemplo separado en las cuatro sucursales, cálculo de la pizza y cambio de precio del queso, conservación de datos del negocio, ayudas con mouse/teclado, receta con canal creado en el mismo paso, login responsive y salida sin esperar la red. La prueba de velocidad retrasa deliberadamente Oracle para verificar respuesta inmediata del botón y salida sin esperar su respuesta.
- 24 verificaciones contra Oracle con negocios aislados y limpieza al terminar, incluidas carga inicial en login y revocación con token de acceso vencido. La cuenta admin del usuario se conserva.
- Compilación y comprobación de tipos aprobadas. Capturas en test-results/friendly-costing-desktop.png, friendly-costing-mobile.png, friendly-login-desktop.png y friendly-login-mobile.png.

## Práctica con cambios al escribir — 10 de octubre de 2026

La práctica de pizza reemplaza el tutorial con pestañas por una sola pantalla. Se comprobaron cambios inmediatos en precios de ingredientes, cantidades, venta, objetivo, caja, alquiler y ventas mensuales; el resultado se inspecciona dentro del mismo evento de entrada, sin guardar ni esperar una petición. Los cuatro negocios conservan sus datos al salir, recargar y volver a practicar. Campos vacíos, negativos o fuera de rango pausan el cálculo y Excel; corregirlos recupera el resultado. Se verifica el archivo Excel descargado con costo $9.500, precio sugerido $19.000 y pérdida $2.500 para el escenario modificado. Se mantiene la prueba del flujo normal de recetas, historial y Excel. En móvil se comprueba ausencia de desbordamiento y resumen de resultados visible mientras se editan los números. Estas pruebas de práctica funcionan por doble clic sin Internet y no envían solicitudes a Oracle. Compilación y comprobación de tipos aprobadas.

## Guardado de formularios — 11 de octubre de 2026

Se reprodujo el formulario de Pizza Grande con tres ingredientes, merma del 10 %, capacidad mensual y objetivo del 100 %. El margen inválido se señala junto al campo y al botón, conservando todos los datos; un recargo del 100 % sí se guarda y produce el precio correcto. Las validaciones también abren campos opcionales cerrados. Se comprueban gastos duplicados, períodos en cero, configuración mensual, edición y eliminación, dependencias de recetas, creación de canal, precio y comisiones, recálculo y persistencia al recargar. Un guardado demorado bloquea escrituras simultáneas; un fallo conserva el borrador y permite reintentar.

Once escenarios Playwright de costeo aprobados, incluidos los recorridos por las tres sucursales originales y la plantilla para sucursales adicionales, la práctica, historial y el archivo Excel descargado. TypeScript y compilación aprobados. El script `test-costing-forms-live.ts` recorre los mismos controles contra Oracle en un negocio temporal con sucursales aisladas; nunca modifica la cuenta administrativa ni los datos del usuario.

## Productos aprobados y pesos colombianos — 11 de octubre de 2026

El historial muestra fichas guardadas expresamente cuando el cálculo está completo y alcanza el objetivo. Una ficha por receta/variante; repetir el guardado la actualiza. Oracle recalcula la aprobación, conserva la instantánea y permite consultarla sin alterar el borrador actual. Las ediciones ya no crean nuevas versiones de historial; conservan auditoría administrativa. Los campos monetarios comparten formato COP dinámico sin centavos finales, incluido costeo, práctica, inventario, catálogo, compras, pagos y edición de ventas.

Validación: 19 pruebas de navegador aprobadas (las cuatro sucursales, formato al teclear y pegar, precisión al editar datos existentes, ficha única, instantánea, retiro sin borrar receta, Excel, práctica y ventas locales); 72 pruebas unitarias; 44 comprobaciones de API Oracle; flujo real de formularios y aprobación en cuatro sucursales temporales; 39 comprobaciones POS reales por HTTP y file://. TypeScript y compilación aprobados. Las pruebas eliminaron únicamente sus negocios temporales. La cuenta administrativa y los datos del usuario permanecen.

## Usuarios, seguimiento y PWA desde el portal — 11 de octubre de 2026

El centro del jefe conserva la sucursal desde la que se abrió Usuarios. La interfaz incorpora búsqueda, estados de acceso, indicadores, permisos y seguimiento con filtros. Los formularios tienen foco inicial, navegación por teclado y cierre con Escape; durante un guardado bloquean cambios simultáneos. Se revisaron visualmente las capturas de escritorio y móvil.

Oracle conserva responsable, sucursal, sección, acción y fecha; registra únicamente cambios confirmados y visitas autorizadas. El costeo identifica ingredientes, recetas, gastos y canales modificados, además del responsable del último guardado y de cada producto aprobado. Las acciones del QR se atribuyen a Cliente de mesa. Los reintentos de operaciones privadas y de solicitudes de atención no duplican las entradas verificadas. La vista nueva empieza a registrar desde esta instalación; conserva la auditoría anterior y los usuarios existentes.

Validación realizada: compilación y TypeScript aprobados; 72 pruebas unitarias; suite completa de 25 escenarios de navegador aprobada; 29 comprobaciones de seguimiento contra Oracle real y 39 de operación POS por HTTP y file://. Incluye permisos del jefe, rechazo de responsables enviados por el cliente, separación entre sucursales, errores sin falsos cambios, autor del costeo e historial, llamados por QR sin duplicados, paginación y consulta real del seguimiento desde el navegador. Las pruebas usan negocios aislados y eliminan únicamente sus datos temporales. También se conservaron las 44 comprobaciones reales de costeo aprobadas.

Las vistas de las cuatro carpetas de sucursales se recorrieron a 320, 390, 768 y 844 píxeles de ancho, incluidas orientación horizontal, sesiones, todas las secciones operativas y editores de usuarios. Una última ejecución de 18 escenarios aprobó los cambios finales de PWA, formularios, responsables, costeo, sesiones y funcionamiento offline. El PWA empieza en el selector de negocios; se comprobó la reapertura offline del portal y del panel de demostración, incluyendo el manifiesto generado con la marca de la sucursal. El caché compartido almacena recursos públicos y excluye las respuestas de API. Los artefactos de Live Server y dist están sincronizados. [Guía de uso](team-activity.md).

## Propuesta comercial y turno sin conexión — 11 de octubre de 2026

Se comparó el PDF original de nueve páginas y se añadieron compras e insumos, proveedores, recetas operativas, comandas, clientes, cartera y caja al panel compartido. Se conservaron las secciones y datos anteriores. La comparación funcional y los límites de aceptación están en proposal-comparison.md.

- 87 casos unitarios aprobados. El motor operacional de 15 casos se revalidó tras el ajuste de redondeo de costos; incluye conversiones, rendimiento, caja, crédito, permisos de conciliación, conteos revisados y separación entre impuestos, utilidad y dinero recibido.
- Suite completa de 38 pruebas de navegador aprobada en la versión final: formularios, costeo, Excel, login, logout, responsive, cuatro sucursales y operación del turno.
- Nueve escenarios de sincronización aprobados: 100 ventas desconectadas, cierre y reapertura, respuesta perdida tras guardar, autenticación local, cambios de otro dispositivo, revisión con conservación del intento anterior, wifi sin acceso a Oracle, receta modificada y turno completo con mesa, cocina, receta, pagos mixtos, compra, abono y cierre. La red se simula en navegador para controlar los fallos y el orden. No equivale a un ensayo de carga de 100 ventas contra Oracle.
- 45 comprobaciones de operaciones contra Oracle real: compras de insumos y productos terminados, rendimiento, costos históricos, abonos, crédito, impuestos y propina separados de utilidad, caja y revisión del conteo, receta obsoleta, reintento idempotente, aislamiento entre sucursales y cuenta de cocina con permisos reales y autor de preparación.
- Regresiones contra Oracle real: 39 POS desde HTTP y file://, 29 de seguimiento y 44 de costeo. Todos los scripts retiraron únicamente sus negocios aislados. La cuenta administrativa temporal y los datos del usuario se conservan.
- API compilada, validada e instalada en Oracle; TypeScript y build aprobados. Los archivos operacionales compilados coinciden con sus fuentes. El sitio publicado excluye .env, scripts, wallet y SQL de mantenimiento.

Una descarga incompleta no sustituye la copia local válida. Los pendientes solo se retiran tras confirmación; una revisión conserva el intento original y un conteo alternativo no altera un cierre previo. Se solicita almacenamiento persistente al navegador, sin asumir que será concedido. Las comandas conservan quién envió y quién preparó el pedido.

Falta la aceptación con las cantidades y recetas reales del cliente y su hardware de impresión. GitHub Pages está preparado, pero no se publicó el repositorio en esta sesión.


## Publicación y sincronización rápida — 11 de octubre de 2026

La API instalada incorpora /pos/batch: hasta 20 operaciones ordenadas, confirmaciones compactas, reintento con el identificador original y parada ante el primer registro que requiere revisión. Se confirmaron 60 comprobaciones reales de operaciones en Oracle, incluidas confirmaciones parciales, reintento de registros previamente individuales y rechazo de grupos demasiado grandes. Diez altas de proveedores tardaron 995 ms en peticiones individuales y 104 ms agrupadas en la conexión de prueba. Los negocios temporales se retiraron al finalizar.

- TypeScript, build, comprobación de URL HTTPS y 87 pruebas unitarias aprobados.
- El recorrido completo de navegador aprobó 40 escenarios; tras ajustar la protección de credenciales y su prueba de renovación tardía, se aprobaron los 13 escenarios de sesiones, sincronización, turno completo y rutas de Pages sobre la compilación final.
- Las 100 ventas sin conexión se confirmaron con un máximo de siete peticiones agrupadas, sin duplicar ventas, pagos ni movimientos. La prueba controla la red mediante un backend de navegador; no es un ensayo de 100 ventas contra Oracle.
- Un retraso deliberado de 1.200 ms en la confirmación central no bloquea el registro local. Se comprueban conflictos, respuestas perdidas, cambios de otro equipo, receta modificada y reapertura sin acceso a Oracle.
- Se retuvo deliberadamente una escritura de credenciales durante la salida: al liberarla, la cuenta quedó cerrada. La marca de revocación se guarda inmediatamente para sobrevivir a la navegación aunque la limpieza de IndexedDB no termine a tiempo.
- El sitio compilado se probó bajo /proyecto/, con la política de caché de publicación: al reabrir el panel no se volvieron a descargar scripts, estilos ni fuentes, y el portal se reabrió sin internet. El centro operativo y sus recursos mantienen las rutas relativas.
- El workflow publica al actualizar main, una vez configurado Pages con GitHub Actions. No se publicó el repositorio en esta sesión.

Los recursos operativos compilados coinciden con sus fuentes; la publicación excluye credenciales, scripts y SQL privados. La confirmación de Oracle y la propagación periódica entre equipos tienen latencia de red; la interfaz distingue el guardado local y los registros pendientes. [Mediciones y funcionamiento](performance.md).


## Mesero, comandas en Inicio y turno en Ventas — 12 de octubre de 2026

El portal permite elegir la entrada de mesero antes del negocio. Las cuatro plantillas comparten el formulario de pedidos, el detalle de la comanda y sus acciones. La plantilla de negocios adicionales conserva su parámetro branch entre ambas pantallas. Se revisaron las capturas de escritorio y móvil del pedido y el modal.

- 93 pruebas unitarias aprobadas, incluidas reglas de comandas: no crear cuentas antes de aceptar, aceptación conjunta de cuenta/consumos/preparación, rechazo, precios y mesas válidos, responsables distintos y protección frente a cambios genéricos de estado.
- El recorrido general aprobó 47 escenarios. Las dos pruebas restantes se adaptaron a la pausa del Asistente IA y a la resolución de hostname del servidor de Pages; el conjunto posterior de 12 escenarios pasó completo sobre el paquete corregido. Incluye el portal, cuatro negocios, turnos persistentes, PWA, doble clic, rechazo, detección de otro dispositivo y comanda sin internet.
- 39 comprobaciones de comandas contra Oracle real: roles de mesero y cocina, ámbito de negocio y sucursal, cantidades y precio autorizado, identidad tomada de la sesión, aceptación sin duplicados, cuenta modificada, rechazo y permiso de entrega. La descarga de cocina muestra pedidos y la referencia de cuenta necesaria, sin descargar las otras cuentas ni caja. Un cambio de estado genérico no puede omitir la aceptación.
- 60 regresiones de operaciones reales aprobadas: recetas, compras, cartera, cocina, caja, cobros, conciliación y sincronización por grupos. Todos los scripts retiraron únicamente sus negocios aislados. La cuenta temporal del usuario y sus datos permanecen.
- TypeScript, compilación, instalación de la API y comprobación de sintaxis JavaScript aprobados. Los archivos públicos compilados coinciden con sus fuentes. Los archivos de credenciales y de mantenimiento permanecen fuera de dist.

El registro de turno conserva el usuario autenticado, base compartida, fecha real de apertura y horario previsto, incluida una jornada que cruza medianoche. Las tarjetas de Ventas muestran Efectivo, Transferencia y Bre-B; los demás pagos continúan en el detalle y la cartera. Los recorridos anteriores de cocina y caja se mantienen para compatibilidad, con las acciones integradas en Inicio y Ventas. La navegación del Asistente IA queda comentada y sus funciones permanecen.

La consulta de versión de comandas cada dos segundos no reemplaza la comunicación de red: un equipo desconectado conserva sus pedidos hasta enviarlos. Solo cambia el estado central cuando Oracle confirma la operación; conserva el intento original ante conflictos. [Guía de uso](orders.md).

La última ejecución sobre el paquete final aprobó nueve escenarios de comandas, selección de negocio, rechazo, propagación entre equipos, turno persistente y rutas de Pages. También se verificaron los 108 archivos públicos, la coincidencia de scripts y worker con sus fuentes y la exclusión de credenciales y SQL de mantenimiento.


## Del costeo al inventario — 15 de octubre de 2026

- Compilación de producción y comprobación TypeScript aprobadas; 93 pruebas unitarias aprobadas.
- Doce pruebas de navegador aprobadas: siete escenarios de traspaso y cinco regresiones de historial y formato de pesos. Incluyen las cuatro plantillas de sucursal, ficha compacta móvil, categoría nueva/existente/relacionada, empates, existencias obligatorias (incluido cero), actualización sin duplicar el producto, historial con precio distinto del borrador, permisos y separación de práctica.
- En sesión autenticada, se registró un producto sin red y se confirmó una sola alta con existencias, costo, precio y mínimo correctos al reconectar contra el backend controlado de pruebas. Esta prueba no escribe datos de prueba en Oracle real.
- El traspaso usa las operaciones existentes de productos e inventario; no requiere migración ni cambios en la API. Los movimientos iniciales indican su origen en Costeo y conservan el responsable autenticado.
- Sintaxis de los scripts, recursos públicos empaquetados y coincidencia con sus fuentes verificadas. Se inspeccionó la captura móvil de la ficha compacta.


## Usuarios integrados y compra con costo unitario — 15 de octubre de 2026

- La gestión existente de usuarios se monta dentro del panel de cada sucursal, conservando el menú, el archivo de la página y la sesión. Se verificó que no utiliza iframe ni navegación a Centro operativo al abrir Usuarios. La prueba autenticada creó y editó accesos por la misma sesión, con los métodos POST/PUT y la sucursal esperada, contra el backend controlado de navegador; no creó usuarios de prueba en Oracle real.
- Se aprobaron cinco escenarios de adaptación móvil del portal y de las cuatro plantillas, incluida apertura y cierre de los editores y Seguimiento. Se inspeccionó la captura de escritorio integrada.
- Cuatro regresiones de la operación de compras, recetas, abonos, cartera, comandas y turno aprobadas. El conjunto final de seis escenarios aprobó las rutas y caché de Pages, la creación/edición integrada de accesos y compras en las cuatro plantillas. Se verificaron costo unitario en vivo, conversión kg a g, pagos completos y parciales, rechazo del sobrepago, responsable y persistencia al recargar.
- Las 93 pruebas unitarias, comprobación TypeScript y compilación de producción aprobaron. Se corrigieron durante la validación la carga de JSX del paquete independiente y la prioridad visual del editor frente al indicador de sincronización.
- La compilación genera los recursos públicos de Usuarios y el worker los incluye para su descarga. Los scripts y plantillas públicos coinciden con dist; no fue necesario modificar ni reinstalar paquetes SQL de Oracle.


## Compra directa de tres datos — 15 de octubre de 2026

El formulario actual de Compras sustituye el paso previo de proveedor e insumo por nombre libre del producto, cantidad y total. Los otros apartados y registros anteriores se conservan.

- 96 pruebas unitarias aprobadas, incluidas precisión de la división, ausencia de proveedores/insumos requeridos, validación de datos, identidad del registro y separación de abonos de proveedor.
- Compilación y TypeScript aprobados; API Oracle actualizada. Las 77 comprobaciones de operaciones reales aprobaron, incluidas las nuevas compras, reintentos, validaciones, responsable de sesión, sucursales separadas y permisos. Los datos temporales del script se retiraron.
- Siete pruebas de navegador aprobadas: acceso a Usuarios, ruta y caché de Pages, compra directa en las cuatro plantillas y compra autenticada sin conexión confirmada una sola vez al reconectar. Se comprueba que el formulario tiene tres campos y ningún selector ni prerrequisito de proveedor/insumo, que $62.000 entre 30 muestra aproximadamente $2.067, que recalcula al escribir y conserva el registro al recargar.

Las cuatro regresiones de operaciones con compras anteriores, abonos, insumos, cartera, comandas y turnos también aprobaron. Los recursos públicos y las plantillas coinciden con sus fuentes; la sintaxis JavaScript es válida.

## Hoja de producción, cartera, borradores y acceso — 17 de octubre de 2026

El [informe de entrega](entrega-2026-10-17.md) detalla el alcance y las mediciones: 99 pruebas unitarias, TypeScript y compilación aprobados; 118 comprobaciones reales de operaciones y 46 de costeo aprobadas; 47 escenarios de navegador verificados en tandas, incluidos móvil, Pages, conflictos y sincronización tras perder la respuesta. El loader desenfoca únicamente el login y desaparece antes de mostrar el panel. Las muestras de rendimiento se documentan con sus límites, sin prometer acceso instantáneo a Oracle.
