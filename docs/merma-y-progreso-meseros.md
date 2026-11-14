# Merma medida y progreso de meseros · 13 de noviembre de 2026

La hoja de recetas de cafetería y coctelería conserva su distribución. La columna de cantidades pasa a llamarse **Peso inicial** y se añade **Peso final** antes de unidades. La misma hoja compartida también está disponible para sucursales adicionales. GCOBARF conserva su hoja de producción.

## Rendimiento y costo

Los dos pesos están expresados en la unidad seleccionada de la línea. El rendimiento es `final / inicial`, y la merma es `(1 - rendimiento) × 100`. El cálculo conserva los decimales internos.

La merma se muestra automáticamente junto al ingrediente, sin botón para configurarla manualmente. Cuando los pesos coinciden se indica «Sin merma». Los resultados de merma y rendimiento se presentan con un máximo de dos decimales y los costos en pesos enteros; el guardado conserva la precisión de las cantidades originales.

Se reutiliza el contrato existente `lines[].processing`: medir sustituye las etapas manuales por el porcentaje agregado, sin sumarlo a ellas. Este porcentaje se representa en el campo `clean` por compatibilidad con el motor y Oracle; no identifica físicamente la causa de la pérdida. No requiere migración ni instalación de paquetes SQL. Las configuraciones antiguas se conservan al cargar la receta y se sustituyen al cambiar los pesos.

El peso inicial conserva la cantidad de referencia que ya utilizaba la receta. Para mantener el rendimiento y las porciones declaradas, el consumo equivalente y el costo se dividen por el rendimiento, igual que en la merma manual. Por ejemplo, una referencia de 200 g cuyo peso final es 160 g tiene rendimiento de 80 %: el cálculo exige 250 g de inventario para mantener esa cantidad de referencia. A $10.000/kg, la línea cuesta $2.500, o $1.250 por porción si la receta produce dos porciones. Los pesos sirven para medir el rendimiento; no registran por sí solos una salida física.

El badge identifica la merma en el ingrediente. La exportación de Excel incluye ambos pesos y el porcentaje. Se rechaza el peso final mayor al inicial, vacío o cero cuando el inicial es positivo. Las líneas existentes sin utilización pueden mantener ambos valores en cero. Al cambiar el insumo se retira la merma del anterior para no transferir su rendimiento accidentalmente.

Guardar sigue usando la revisión y protección contra cambios de recetas con cuentas abiertas. El vínculo de inventario utiliza el mismo consumo equivalente en navegador y servidor, incluyendo reservas, porciones y adiciones. No hay un segundo descuento por introducir los pesos.

## Comandas y dinero cobrado

En Usuarios se muestran tarjetas de los usuarios con rol Mesero en la sucursal: importe cobrado, participación del equipo, barra comparativa, comandas enviadas, atendidas, cobradas, pendientes, rechazadas y anuladas. Se puede elegir 24 horas, 7, 30 o 90 días.

La atribución usa el identificador del consumo y su comanda original, no el nombre del cajero ni el mesero actualmente asignado a la mesa. Una factura puede contener consumos de varios meseros y consumos de administración. Cada uno participa únicamente por sus propias líneas. El responsable del cobro sigue en el detalle de Ventas; no aparece en el panel de progreso.

El importe corresponde a cobros en el período seleccionado, incluyendo impuestos y descuentos y excluyendo propinas y crédito pendiente. Los pagos de cartera se atribuyen al recibir el abono, a través de su venta original. Un pago parcial produce importe cobrado, pero no convierte la comanda en completamente cobrada. Los repartos se realizan en centavos y distribuyen el resto sin duplicar dinero. Las ventas anuladas y los identificadores repetidos se excluyen.

Las estrellas son un **índice de cierre**: `5 × comandas completamente cobradas / comandas enviadas`, para las comandas enviadas en el período. Sin comandas no se asigna calificación. La fórmula puede consultarse en «Cómo se calcula el progreso». No representa opiniones de clientes ni ajusta por horas trabajadas. Los ingresos de una comanda antigua cobrada hoy cuentan hoy, pero no alteran la cohorte de comandas enviadas hoy.

Se utiliza la descarga operativa existente sin crear otra consulta periódica. Si el historial local alcanzó el límite de ventas recientes, se consulta el reporte del período al abrir el panel, ampliando el rango para ventas a crédito con abonos recientes. Una copia parcial se identifica expresamente y no presenta estrellas como definitivas mientras se completa. Sin conexión solo pueden evaluarse los datos que el equipo ya descargó o registró.

## Capacidad y actualizaciones

El catálogo del mesero muestra cuántas unidades adicionales permiten los insumos. La capacidad considera reservas de cuentas abiertas y los demás productos del carrito que comparten materia prima. Una cantidad superior al máximo muestra el límite concreto e impide enviar la comanda. La validación central existente vuelve a comprobar el inventario al aceptar y consumir; un equipo desconectado no conoce cambios todavía no recibidos de otros dispositivos.

Los desgloses conservan su elección al reemplazar tarjetas durante una actualización. El observador inspecciona únicamente los elementos incorporados, sin recorrer toda la página al cambiar cifras o iconos. El resumen de sincronización conserva su DOM si el texto no cambió. Una cuenta que otro dispositivo haya cerrado conserva el último detalle abierto, con aviso de actualización y acciones deshabilitadas, hasta que el usuario lo cierre.

## Verificación

- `npm test`: costos, rendimiento, reservas, sincronización, autenticación y atribución de cobros.
- `npm run build`: tipos, frontend, API, panel integrado y caché versionada.
- `tests/browser/measured-yield-performance.spec.ts`: pesos, guardado, móvil, estrellas, atribución, capacidad compartida, desgloses y cola de ventas/comandas con 24 horas de antigüedad y respuesta perdida.
- Pruebas de navegador de merma automática, redondeo, borradores, acceso, rendimiento, comandas y operación offline.

La prueba de 24 horas envejece los registros persistidos; no espera un día real. Se conserva la cola existente: se guarda antes de confirmar localmente y solo se retira una operación al recibir su confirmación individual. Los conflictos permanecen visibles para revisión.

Resultado local: compilación completa y tipos correctos, 309 pruebas de lógica y 50 escenarios de navegador verificados en tandas. Incluye la recuperación del historial parcial, la corrección de pesos sin residuos decimales visibles y las vistas de móvil de los cuatro negocios.
