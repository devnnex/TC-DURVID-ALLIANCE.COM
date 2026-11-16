# Refuerzo de acceso y permisos — 2026-11-16

Aplica a coctelería, cafetería, GCOBARF y sucursal, y a los negocios que usen los mismos paquetes. Se conserva el funcionamiento de login, cuentas, comandas, cobros, CRM, impresión y sincronización. No hay cambios de esquema ni de contraseñas; las pruebas reales usan negocios temporales y eliminan sus registros al terminar.

## Cambios

- Los intentos de login y desafío comparten el mismo contador al recibir el nombre o el UUID de una sucursal. Un acceso correcto sigue reiniciando sus contadores. La prueba de autenticación también verifica que la cuenta no haya sido eliminada y pertenezca al negocio del desafío.
- La API Node rechaza tokens Bearer malformados con 401, comprueba los identificadores firmados y oculta los detalles de verificación. La respuesta para cuentas desconocidas conserva el trabajo de comprobación de contraseña sin generar otro hash en cada solicitud.
- Una denegación explícita de un permiso base del mesero se respeta tanto en Oracle como en el cálculo compartido del cliente. Una excepción ALLOW no amplía el mesero a permisos administrativos.
- Los reintentos de escrituras comprueban los permisos actuales antes de devolver el recibo guardado. Si cambiaron los permisos, las respuestas de operaciones con una instantánea se vuelven a filtrar, sin ejecutar otra vez el cambio. Esto evita recuperar datos del CRM que ya no se pueden consultar.
- Las modificaciones directas de descuentos, impuestos, propinas, totales, pagos y cierre de cuentas requieren permiso de cobro. Los cambios de precios manuales requieren ese permiso; un mesero conserva el precio de una línea existente del mismo producto y puede agregar productos al precio vigente. Cambiar el producto no permite conservar indebidamente el precio anterior.
- Las claves JSON se comparan contra campos admitidos y se rechazan claves con comas. Los filtros se validan antes de consultar incluso si no hay registros: campos y operadores limitados, valores escalares y tamaños acotados. El SQL existente conserva consultas estáticas y parámetros, sin concatenar filtros como sentencias.
- El inventario oculta también el costo final de producción cuando falta permiso para consultar costos.
- El navegador envía el token de renovación únicamente al renovar o cerrar sesión. Se conservan las protecciones existentes contra una renovación que termine después de salir.
- Se actualizaron las dependencias vulnerables de producción: @fastify/jwt (incluido fast-jwt), Fastify, fast-uri y Zod. Se adaptaron los dos esquemas record a Zod 4 conservando sus claves y valores. JWT admite exclusivamente HS256, el algoritmo que ya usaba el sistema. Se actualizaron también Vitest y Vite para corregir los avisos críticos de pruebas y el aviso del servidor de desarrollo. El archivo de bloqueo registra las versiones utilizadas.
- Las respuestas API añaden no-cache, no-referrer y DENY para marcos. Node establece nosniff; el gateway ORDS ya lo emite. Se conserva no-store y la política separada para file://. Los registros de Node redactan los campos de credenciales y pruebas incluidos en el cambio.

## Rendimiento y funcionamiento sin conexión

Las nuevas comprobaciones de permisos previas al recibo reutilizan el contexto ya calculado. La firma de permisos se guarda internamente y no se expone al cliente. Los reintentos con permisos iguales devuelven su resultado anterior; la reproyección se hace únicamente cuando cambian permisos o se trata de un recibo antiguo. No se añadieron solicitudes periódicas, librerías, CAPTCHA ni pasos de acceso.

La operación desconectada conserva su diseño actual: usa el último contexto verificado y exige la contraseña local. Los cambios de permisos remotos se conocen al reconectar y el servidor los comprueba al sincronizar. La vigencia local de hasta 60 días se mantiene; reducirla cambiaría el funcionamiento solicitado. Esto no convierte al almacenamiento del navegador en una frontera de autorización del servidor ni cifra todos los datos operativos de IndexedDB.

## Comprobaciones

- 384 pruebas automatizadas de API, roles, transporte, operaciones y autenticación local; compilación completa con TypeScript.
- 185 comprobaciones reales contra Oracle en las cuatro sucursales: login válido, prueba de un solo uso, renovación y revocación, inyecciones como valores literales, filtros inválidos, aislamiento entre negocios, privilegios falsificados, precios y descuentos, denegaciones, reintentos y datos privados.
- Regresión real adicional de comandas/estadísticas (52) y CRM/visitas (30).
- 27 comprobaciones de autenticación real, incluidas acceso desde navegador, conservación de sesión, salida y compatibilidad de contraseñas anteriores. Medición puntual: login 1092 ms, recarga 368 ms, salida 188 ms; no representa una garantía de tiempo para otras redes o equipos.
- 59 pruebas de navegador de comandas, permisos, cuentas propias, administración de equipo, compras, CRM, cobros, impresión y operación desconectada, incluidas 100 ventas y sus reintentos sin duplicados.
- Auditoría npm de producción: cero vulnerabilidades reportadas con las versiones instaladas. La auditoría completa conserva cinco avisos bajos/moderados en herramientas de compilación (deepmerge, glob, minimatch y sus dependientes); no se distribuyen en la aplicación operativa. Se documentan sin forzar dependencias mayores fuera de los rangos declarados por Workbox. No quedan avisos altos o críticos en la auditoría realizada.
- Cabeceras verificadas en los dos endpoints ORDS, incluida la conservación del origen null para file://.

Ejecución repetible: npm test, npm run build y npm run ords:test:security. La auditoría se repite con npm audit --omit=dev. El test real de Oracle necesita las credenciales privadas de Oracle de la estación; no las muestra ni las incorpora al repositorio. El instalador generado conserva los mismos cambios de los archivos fuente SQL. El refuerzo de Oracle se compiló con respaldo previo de los cuerpos de paquetes y verificación de errores.

## Referencias y límites

Los criterios siguen la [autorización de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), sus [controles de autenticación](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) y la [prevención de inyección SQL](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html). Las pruebas confirman los escenarios descritos; no constituyen una certificación de seguridad absoluta ni una prueba de penetración independiente. El mantenimiento de credenciales, infraestructura y equipos sigue siendo necesario.

Las adaptaciones de validación siguen la [guía de migración de Zod](https://zod.dev/v4/changelog) y la compatibilidad del plugin se contrastó con la [documentación de Fastify JWT](https://github.com/fastify/fastify-jwt).
