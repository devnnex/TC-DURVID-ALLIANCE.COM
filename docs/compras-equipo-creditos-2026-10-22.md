# Compras, proveedores y equipo por negocio

## Clientes y cartera

Toda ficha de esta sección es de un cliente a crédito. No hay que activar otro permiso de crédito en la ficha y no se muestran clientes de contado. La regla también aplica a registros antiguos con allowCredit falso: se conservan sus saldos, límites, estado y acuerdos. El cupo es opcional; cero significa sin límite y un valor positivo sigue siendo un límite real, validado localmente y por el servidor. Deshabilitar una ficha impide nuevos consumos y conserva sus deudas.

La selección del cliente no crea deuda: se confirma con Agregar a cartera del cliente. Se mantiene el cobro inmediato para quien paga al momento. Cada cliente nuevo conserva creador, fecha y última edición; los registros anteriores sin esa información se identifican sin inventar responsables. Los consumos y cobros conservan el usuario autenticado en cada operación.

## Compras y proveedores

Solo se muestran Compras y Proveedores. Se conservan los datos anteriores de insumos, recetas y movimientos para no afectar operaciones existentes.

Agregar compra abre un modal con producto, cantidad y total en COP; calcula total dividido entre cantidad con precisión interna y muestra el costo por unidad redondeado al peso. Guardar cierra el modal y actualiza la lista. No crea inventario ni deudas de proveedores. Un borrador sin guardar se conserva al cerrar y abrir el formulario.

Proveedores es una agenda de contactos con alta y edición mediante modal. Los teléfonos colombianos de diez dígitos reciben indicativo 57 para los enlaces; otros teléfonos deben incluir su indicativo. WhatsApp abre el chat y Llamar usa tel:. Ambas listas mantienen buscador y filtros.

## Roles y responsables

La interfaz ofrece Jefe, Administrador, Trabajador y Mesero. OWNER conserva la cuenta principal protegida; BOSS permite crear jefes limitados a los negocios que se les asignan. No se migran ni se eliminan usuarios existentes.

Administrador y Trabajador muestran casillas de secciones al crearse o editarse. Usuarios es un permiso delegable; no concede autoridad para modificar ventas cerradas ni para asignar Jefe. Un usuario solo puede delegar permisos que tiene y en negocios que puede administrar. El servidor vuelve a validar el ámbito y protege las cuentas de jefe.

Mesero conserva únicamente toma de pedidos y envío de comandas. Sus excepciones no pueden habilitar cobros, usuarios ni otras secciones. Los roles se devuelven explícitamente en el contexto de sesión para distinguir a un trabajador con pocos permisos de un mesero.

Se retira Seguimiento de la interfaz de usuarios. Se mantienen los registros internos de responsabilidad y auditoría. Las tarjetas de usuarios muestran creador y última edición tomados de la auditoría del servidor, sin contraseñas ni datos de autenticación.

## Instalación y pruebas

014_team_roles.sql incorpora los roles y sales.manage de forma aditiva. install.sql y npm run ords:install incluyen esta actualización. Se aplicó y comprobó la compilación de los paquetes del backend.

- npm run build
- npm test
- npx playwright test tests/browser/purchases-contacts-roles.spec.ts tests/browser/team-and-purchases.spec.ts tests/browser/delegated-team.spec.ts tests/browser/consumption-layout-collection.spec.ts tests/browser/interaction-performance.spec.ts
- npx tsx scripts/test-team-roles-live.ts
- npx tsx scripts/test-credit-selection-live.ts

Las pruebas reales crean negocios aislados y eliminan sus datos al finalizar. El recorrido de roles validó 36 comprobaciones de delegación, aislamiento, protección de ventas, responsables, crédito y compras. El recorrido de cartera confirmó varios productos, consumo existente y abono parcial sin duplicar ventas ni descontar inventario nuevamente.

Compilación y tipos aprobados. Pasaron 129 pruebas unitarias; las pruebas de interfaz cubren las cuatro sucursales, compras y contactos en móvil/escritorio, crédito de registros antiguos, selección por roles, delegación, persistencia y sincronización offline, y la velocidad de acceso. La recarga preparada midió 680 ms en esta ejecución local. Fuente y distribución coinciden.
