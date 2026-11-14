# Compras compactas y continuidad del mesero

## Compras en todos los negocios

Las compras simples se presentan en filas desplegables con el color configurado del negocio. El resumen muestra nombre, cantidad y total. El desglose conserva costo unitario, responsable y fecha, y permite editar o eliminar con permiso `supplies.write`.

La unidad es opcional:

- Con unidad: cantidad numérica positiva en cualquiera de las unidades centrales. El costo se calcula como total dividido entre cantidad; únicamente la presentación monetaria se redondea.
- Sin unidad: descripción de hasta 160 caracteres. No se inventan conversiones, cantidades numéricas ni costos por unidad.
- Los registros antiguos sin unidad explícita conservan su interpretación anterior en unidades.

Editar o eliminar exige la revisión vigente del registro. Se conserva el creador al editar y se identifica al editor. Las compras históricas vinculadas a pagos o movimientos de inventario conservan su flujo anterior; estos comandos simples no alteran esos movimientos.

La lista dibuja veinte registros por página. En el caso habitual no copia ni recorre todo el historial para dibujarlos; búsqueda y fechas filtran los datos antes de construir el HTML. El texto de búsqueda usa una caché débil y el formato de fechas reutiliza su instancia.

Crear, editar y eliminar utilizan la cola durable existente, con orden, identificadores estables y confirmaciones del servidor. Se verificó crear → editar → recargar → eliminar sin conexión y sincronizar tras perder una confirmación, sin duplicar compras ni alterar caja o inventario.

## Meseros de cafetería y coctelería

El modal muestra una animación mientras se guarda. Tras guardar vuelve al selector de mesas del mesero y permite elegir otra mesa o agregar consumo a la anterior. Una comanda pendiente sin internet no se presenta como confirmada por el servidor.

Los enlaces de administración se recalculan cuando llegan los permisos actualizados de la sesión. Se verificó mantener administración y mesero abiertos a la vez, enviar y recargar sin cambiar a la interfaz administrativa.

Cada vista de mesero usa `waiter.webmanifest`, con identidad y arranque en `index.html`; el panel conserva su manifiesto y arranque propios. Una PWA instalada previamente como administración sigue siendo el acceso administrativo: la instalación desde la pantalla de mesero crea su acceso específico. No se modificó el mecanismo público de pedidos de GCOBARF.

## Almacenamiento Oracle

`016_receipt_storage.sql` añade una columna opcional para respuestas comprimidas y un códec interno sin pérdida. Las respuestas menores de 8 KiB mantienen el camino anterior; las mayores usan compresión rápida únicamente si ahorra al menos 15 %. No afecta contraseñas, inicio de sesión, huellas de operaciones, identificadores ni respuestas visibles de la API. Los formatos anteriores y nuevos pueden convivir.

Los reintentos reconstruyen la respuesta original completa, incluidos caracteres Unicode y campos grandes. No se sustituye un resultado histórico por el estado actual ni se elimina su comprobante, para conservar la protección frente a duplicados.

Herramientas de mantenimiento:

- `tsx scripts/audit-storage.ts`: agregados de espacio asignado, comprobantes y documentos. No imprime datos de clientes o credenciales.
- `tsx scripts/compact-receipts.ts`: consulta los comprobantes antiguos elegibles.
- `tsx scripts/compact-receipts.ts --apply`: comprime los existentes, compara íntegramente cada resultado reconstruido con su original antes de sustituirlo y confirma por lotes. No se ejecuta durante el login.

Medición del 14 de noviembre de 2026: se conservaron los 558 comprobantes; 155 pasaron a compresión. El contenido pasó de unos 29,2 MB de JSON a unos 19,5 MB entre respuestas comprimidas y JSON restante, aproximadamente 33 % menos. Son tamaños de contenido, no una medición de espacio físico liberado. El esquema tenía aproximadamente 207 MiB asignados después del cambio, incluyendo segmentos e índices; esto tampoco representa el consumo de toda la instancia.

Oracle publica **20 GB por Autonomous Always Free**, no 50 GB: [restricciones oficiales](https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/autonomous-always-free.html). Una cuota finita no permite prometer conservación ilimitada de registros por tiempo indefinido. Este cambio no contrata recursos, no activa un plan pagado y no purga historial financiero; la evolución del consumo se puede revisar con la auditoría.

## Validación

Compilación completa, pruebas generales, navegador móvil y sin conexión, permisos y sesiones simultáneas. La prueba real de operaciones incorpora cantidades con unidad, texto libre, cambios de modalidad, revisiones obsoletas, eliminación idempotente y repetición exacta de respuestas comprimidas con Unicode.
