# CRM clientes · Cafetería y coctelería

La sección **CRM clientes** conserva la colección de clientes de cada negocio. El directorio muestra nombre, teléfono, cumpleaños y el registro con fecha, responsable y origen. Las fichas anteriores permanecen disponibles aunque todavía no tengan fecha de nacimiento. El registro nuevo solicita autorización del cliente y no habilita crédito automáticamente. Los saldos existentes, sus pagos, acuerdos e historiales se conservan.

Los indicadores muestran clientes registrados, quién cumple años hoy y cuántos clientes habilitados cumplen en el mes actual. La pestaña Cumpleaños filtra ese mes. Los cálculos utilizan el día de Bogotá y el indicador diario se actualiza al cambiar de fecha. Para un cumpleaños del 29 de febrero se utiliza el 28 en los años no bisiestos.

En la vista del mesero aparece un registro opcional dentro de la comanda. Al marcar que el cliente autorizó el registro, se solicitan nombre, teléfono y fecha de nacimiento. Sus datos se guardan junto con la comanda, no al abrir el formulario. Una comanda inválida no crea la ficha. Si ya existe el teléfono en ese negocio, se asocia a esa ficha sin sobrescribir sus datos. El pedido, sus consumos aceptados y la preparación conservan el identificador del cliente. El responsable de creación se obtiene de la sesión autenticada.

El mesero conserva únicamente sus permisos de atención: no recibe el directorio del CRM ni los cumpleaños o teléfonos de otros clientes. El resultado de enviar un pedido solo devuelve su asociación por identificador y nombre. El formulario y el carrito se limpian al enviar y el borrador se conserva mientras el pedido esté pendiente de enviar. Sin conexión, registro y comanda comparten una operación persistida; el identificador de operación evita duplicaciones al reconectar o perder una respuesta.

En inventario se comenta el control manual «Actualizar datos» para estos dos negocios. El estado de sincronización permanece visible, alineado a la derecha encima de Historial y respaldo. Se conservan las actualizaciones automáticas y el control de respaldo existente.

## Servidor y verificación

`customer_crm.sql` agrega validación y registro de clientes desde comandas sin crear tablas. Los paquetes `orders`, `operations_commands` y `operations_sales` mantienen las verificaciones de permisos, transacciones y crédito. El instalador ORDS incluye el nuevo paquete antes de sus consumidores.

- `scripts/deploy-customer-crm.ts`: prepara una revisión y copias de los paquetes publicados; `--apply` exige que las versiones revisadas no hayan cambiado y restaura las anteriores si falla la compilación.
- `scripts/test-customer-crm-live.ts`: verifica el CRM y la comanda contra Oracle en un negocio temporal aislado, que elimina al terminar.
- `tests/customer-crm.test.ts`: validación, cumpleaños, autoría, duplicados, asociación y pedidos normales.
- `tests/browser/customer-crm.spec.ts`: directorio, edición, indicadores, móvil, ubicación de la sincronización, permisos del mesero y recuperación offline con respuesta perdida.
