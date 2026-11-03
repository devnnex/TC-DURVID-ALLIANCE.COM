# Macro de insumos

Disponible en **Inventario → Macro de insumos** para los cuatro negocios. GCOBARF utiliza su hoja de producción y los demás sus hojas de recetas. La merma por ingrediente se explica en [Merma y rendimiento](ingredient-yield.md).

## Vincular una receta

Los insumos se seleccionan en la hoja de costeo y una unidad vendida corresponde a una porción de esa receta. Al agregarla al inventario se reutilizan automáticamente esas correspondencias. Varias recetas pueden compartir el mismo insumo. También se puede usar **Vincular receta** para un producto existente.

En Jesspreso Oliva (Cafetería) y Coctelería, **Agregar al inventario** calcula las unidades disponibles con los insumos vinculados, descontando lo comprometido en cuentas abiertas. No requiere escribir existencias del producto preparado y verifica que alcance al menos para una unidad antes de guardar. Si falta un ingrediente, muestra su nombre y las cantidades disponible y necesaria; primero se debe crear o abastecer en la macro. El selector del inicio muestra esta disponibilidad y se actualiza cuando cambian los insumos. Los productos sin receta conservan su inventario por unidades.

Esto también se aplica a productos creados después. Al vincularlos, se reutiliza el insumo de la macro indicado por su referencia guardada, su nombre y medida compatibles, o por los vínculos de ingredientes comunes en recetas anteriores. Por ejemplo, una receta nueva con «Leche» reutiliza el saldo que otras recetas ya vincularon a «Leche entera central». No se crean existencias por cada producto. Si las recetas anteriores apuntan a varios insumos posibles, el formulario pide elegir cuál compartir.

Al habilitar u ocultar una receta en Cafetería o Coctelería, Oracle actualiza conjuntamente el documento del menú y la disponibilidad del producto que devuelve Inventario. La sincronización del navegador incorpora los productos nuevos y sus cambios de disponibilidad al buscador de consumos, incluso si ya está abierto. Los productos ocultos intencionalmente siguen excluidos. `scripts/test-materials-live.ts` verifica este circuito contra Oracle con datos temporales aislados.

Cada dispositivo y usuario autorizado consulta el mismo inventario y la misma macro de su sucursal. Los datos principales se publican en pantalla al recibir la consulta del servidor; el historial y el costeo se descargan por separado y no detienen la llegada de insumos, productos nuevos o cantidades actualizadas. **Actualizar datos** solicita una consulta nueva y muestra la hora de la última sincronización. Un usuario con permiso de consulta puede ver los datos sin recibir permisos de edición. Los registros todavía pendientes de envío permanecen protegidos en el equipo donde se crearon.

Las cantidades del lote se dividen por las porciones producidas; las adiciones por porción se conservan. Ambas se multiplican por las porciones de una unidad vendida. Peso, volumen y unidades se convierten dentro de su propia dimensión. Ejemplo: 75 g de salsa para 8 porciones descuentan 9,375 g por porción.

Preparar 5 de esas porciones descuenta 46,875 g de salsa. Si además cada porción usa 80 ml de leche, se descuentan 400 ml. El descuento se registra al preparar el consumo; cobrar y reintentar su confirmación reutiliza ese registro.

Los insumos creados al vincular una receta comienzan con existencia cero. Al crear un insumo manualmente puedes indicar su existencia inicial. **Editar** reutiliza el mismo formulario y completa nombre, unidad, existencia física actual y alerta con los últimos datos guardados. La cantidad representa el nuevo total: guardar 800 cuando había 1000 registra una corrección de −200, conservando el costo unitario y las reservas. Una versión desactualizada no sobrescribe cambios de otro equipo; la revisión permite confirmar el conteo sobre la existencia del backend. **± Cantidad** permite registrar entradas o retiros, con motivo opcional y costo total de entrada para calcular el costo promedio. Sin motivo se conserva una descripción del tipo de movimiento y su responsable. Un insumo ligado a un producto no se puede eliminar; los insumos independientes se archivan conservando su historial.

## Producción terminada en GCOBARF

**Guardar hoja de producción** registra los pesos iniciales utilizados y descuenta los insumos de la macro. Cada hoja tiene un registro de producción: volver a guardarla no duplica el descuento. Si se editan cantidades o se cambia un insumo, se aplica únicamente la diferencia; reducir una cantidad devuelve lo correspondiente al insumo original. Un faltante rechaza toda la edición y conserva el borrador.

**Agregar al inventario** incorpora la cantidad de producción real ya registrada, sin pedir correspondencias ni porciones y sin descontar nuevamente materias primas. Una producción de 196 crea 196 unidades terminadas. Repetir la incorporación no las duplica. Vender cinco deja 191 unidades; el consumo de ingredientes ya quedó registrado en la producción. Las correcciones posteriores también actualizan las unidades incorporadas; una corrección que intente borrar unidades ya vendidas se rechaza.

## Consumos, ventas y cancelaciones en los demás negocios

Las recetas de Cafetería, Coctelería y cualquier otra sucursal reutilizan los insumos seleccionados en el costeo. El inventario expresa **Puedes preparar** y muestra su capacidad actual. Es un potencial por receta: varias opciones comparten ingredientes y sus capacidades no son existencias independientes.

Agregar un consumo a una cuenta registra su preparación y descuenta físicamente sus ingredientes. La capacidad de las otras recetas cambia con ese mismo movimiento. Editar el consumo aplica la diferencia; cancelarlo devuelve sus ingredientes. Al cobrar o enviarlo a cartera, se reutiliza el detalle ya preparado y no se descuentan los insumos por segunda vez. Anular una venta devuelve su consumo real una sola vez. Las ventas directas que no pasan por una cuenta siguen consumiendo sus ingredientes en la misma operación de venta.

El backend valida cantidades y concurrencia bajo el bloqueo de la sucursal. El detalle de cada producción y preparación permite repetir confirmaciones sin duplicar cantidades y corregirlas posteriormente.

## Sin conexión

Se utiliza la cola durable existente, con el mismo identificador al reintentar. Los cambios sobreviven a una recarga y las confirmaciones perdidas no repiten movimientos. Al reconectar, el backend valida y confirma cada operación. Si dos equipos sin conexión comprometen el mismo último insumo, el conflicto se conserva para revisión: ningún equipo puede conocer las operaciones aún no sincronizadas del otro.

## Verificación

`tests/materials.test.ts` valida conversiones, porciones, reservas, descuentos, protección de vínculos e idempotencia. `tests/browser/materials.spec.ts` cubre el flujo de interfaz, abastecimiento sin conexión y móvil. `scripts/test-materials-live.ts --install` compila los paquetes afectados y prueba el circuito real con un negocio temporal aislado que se elimina al finalizar.
