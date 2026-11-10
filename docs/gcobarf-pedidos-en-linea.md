# Pedidos en línea de GCOBARF

La página pública está en `negocios/gcobarf/pedidos.html`. Inicio del administrador incluye el enlace **Abrir pedidos en línea** junto al calendario; se puede compartir esa URL con los clientes. Los accesos actuales de meseros y los demás negocios conservan su funcionamiento.

El catálogo consulta cada cinco segundos los productos terminados del inventario de GCOBARF. Incluye los agotados en gris y deshabilitados, respeta la disponibilidad marcada por el negocio y excluye recetas que aún no son producto terminado. No publica costos ni datos de clientes. Las cantidades se expresan en unidades enteras del producto registrado.

El cliente elige productos y cantidades, nombre, teléfono, domicilio o recogida, una fecha y hora de Colombia, observaciones y autorización de contacto. Departamento y ciudad están desactivados temporalmente. La dirección es opcional: si contiene texto sin la palabra completa «barrio» (sin distinguir mayúsculas), se exige un barrio adicional. Si la dirección ya incluye esa palabra, no se exige otro campo. El precio mostrado corresponde a los productos; cualquier costo de domicilio se coordina con el negocio. No se cobra ni se marca el pedido pagado desde la página pública.

Cada pedido tiene una sola fecha. Para otra entrega, incluso en la misma fecha, se crea una orden nueva con otra clave de confirmación; el nombre y teléfono permiten vincularla al mismo cliente activo. El calendario administrativo y el detalle de sus consumos identifican las órdenes web con el badge **Agendado desde la web**.

Tocar la foto o **Elegir +** abre la ficha del producto con controles **− / +**, cantidad editable y total inmediato. Después de agregarlo, las tarjetas muestran su cantidad y permiten ajustarla sin abrir otra ficha. El carrito mantiene esos mismos controles, muestra subtotales y separa la revisión de productos de los datos de entrega. Una confirmación visible y el botón flotante **Ver mi pedido** muestran el resultado de cada cambio. El borrador del carrito se conserva en el navegador; la reserva de inventario ocurre únicamente al confirmar la programación. Los reintentos pendientes conservan su pedido original.

Confirmar crea un cliente cuando no hay uno activo con el mismo nombre y teléfono, una entrega abierta en `table_sessions` y sus productos en `session_items`. La entrega tiene `source: online`, teléfono, modalidad, dirección y observaciones visibles en la agenda del administrador. Usa las mismas reservas persistentes que una entrega creada por el administrador: confirmar descuenta existencias, cobrar no vuelve a descontarlas y cancelar desde el administrador las devuelve.

El servidor bloquea la sucursal durante la confirmación, verifica existencias y precios actuales, rechaza cantidades duplicadas, fraccionarias o insuficientes y días anteriores a la fecha actual de Colombia. Hoy está permitido. La misma regla de fechas se aplica al crear y reprogramar en administración, en línea y sin conexión; el historial conserva sus consultas, cobros y cancelaciones. Estos controles aplican incluso si el administrador permite ajustes con existencias negativas. Los reintentos usan una clave privada de 256 bits, guardada antes del envío, para no duplicar entregas ni reservas cuando se pierde la respuesta. Hay límites de creación por teléfono e IP.

**Mis entregas programadas** conserva las referencias privadas en el navegador del cliente y consulta únicamente esas entregas. No muestra agendas ni nombres de otras personas. Refleja la reprogramación, cancelación y los pagos registrados por el negocio. Otro navegador no tendrá ese historial; borrar los datos del sitio borra sus referencias locales, sin eliminar el pedido del calendario del negocio.

## Instalación y comprobación

Se usa Oracle ORDS, como el administrador existente; no requiere cambios en Supabase.

- `npm run ords:package` actualiza el instalador completo e incluye el nuevo paquete.
- `node --import ./node_modules/tsx/dist/loader.mjs scripts/deploy-gcobarf-orders.ts` verifica que la API publicada coincida con el punto de partida. Con `--apply`, respalda el cuerpo anterior en `.tools/`, compila el nuevo paquete y agrega su ruta pública; restaura el cuerpo de la API si falla.
- `node --import ./node_modules/tsx/dist/loader.mjs scripts/deploy-gcobarf-delivery-rules.ts --apply` verifica y respalda los cuerpos publicados de los paquetes de pedidos y agenda, y aplica únicamente sus reglas de dirección y fechas. Conserva sus firmas y restaura ambos cuerpos si falla.
- `node --import ./node_modules/tsx/dist/loader.mjs scripts/test-gcobarf-orders-live.ts` comprueba Oracle real usando datos temporales en una sola transacción que se revierte al terminar. Valida disponibilidad, precios, reservas, reintentos, privacidad, abonos, pago y cancelación.
- `npx playwright test tests/browser/gcobarf-public-orders.spec.ts` comprueba el catálogo, móvil, pedido a calendario, recuperación de respuestas perdidas y rechazo por stock.

La publicación habitual de GitHub Pages empaqueta los nuevos archivos automáticamente al hacer push a `main`.
