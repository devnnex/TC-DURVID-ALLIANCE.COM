# Merma y rendimiento

La acción **Configurar merma** aparece debajo del nombre del ingrediente en la hoja de producción de GCOBARF y en la hoja de recetas de los demás negocios. El mismo modal se utiliza en todos. GCOBARF conserva su diseño de costeo y ahora dispone también de **Inventario → Macro de insumos**.

## Datos y alcance

El modal lee la presentación comprada del registro de ingrediente ya utilizado por el motor de costeo. Si hay un vínculo con la macro, el costo mostrado se obtiene del costo unitario actual del insumo para esa presentación; al guardar, cliente y backend actualizan esa referencia de compra usando el inventario. Sin vínculo se utiliza la compra ya registrada en el ingrediente. Los importes se muestran como referencia y no se duplican en la configuración de merma. La cantidad utilizada y su unidad provienen de la línea real de la receta. Los cambios locales de los controles son solo una vista previa hasta pulsar **Guardar y aplicar merma**. Cancelar conserva el documento anterior.

La configuración se guarda en `recipe.lines[].processing`, con versión, estado almacenado, estado utilizado y tres porcentajes: descongelación, limpieza y cocción. Es específica de esa preparación; no modifica un porcentaje global del ingrediente. Los porcentajes empiezan en cero y el estado utilizado empieza como **Según las mermas que ajuste**. En ese modo, los porcentajes seleccionan las etapas por aplicar; las etapas ya realizadas en el estado almacenado no se repiten. También se pueden elegir estados explícitos. No se adivinan pérdidas según el nombre del producto.

Los estados identifican las transformaciones ya realizadas. También se admiten ingredientes congelados que ya están limpios o cocidos; descongelar un alimento ya cocido no vuelve a aplicar la cocción. No se permite convertir un estado preparado en uno anterior.

En computador, el modal muestra los controles a la izquierda y la cantidad utilizada, resultados y botones a la derecha, con una división vertical. En móvil se apila sin desbordamiento horizontal. Un porcentaje vacío o fuera de rango marca su campo en rojo con una breve animación (se respeta la preferencia de movimiento reducido), deja los resultados pendientes e impide guardar hasta corregirlo.

Para corregir una merma guardada, abre otra vez **Configurar merma**, modifica los porcentajes y guarda. **Quitar mermas**, debajo de los resultados, solicita confirmación en un modal del sistema; pone los tres porcentajes en cero y vuelve al estado de receta automático, conservando el estado almacenado. Todavía es una vista previa: solo se conserva al pulsar **Guardar y aplicar merma**. Cancelar o cerrar conserva los últimos valores guardados. La retirada no reconstruye ventas anteriores ni devuelve existencias ya consumidas.

## Cálculo compartido

Solo se aplican las etapas necesarias entre ambos estados. Su rendimiento se multiplica secuencialmente, sin sumar porcentajes. La cantidad equivalente es `cantidad requerida / rendimiento aplicable`. Los porcentajes admiten decimales y deben ser menores que 100.

Ejemplo: inventario congelado, receta con 150 g descongelados, descongelación del 5 %: se requieren `150 / 0,95 = 157,894736842… g` de inventario. Una merma de cocción configurada no afecta ese consumo crudo. Si el estado usado coincide con el almacenado, el factor es 1.

El costo de la línea usa esa misma cantidad equivalente y el precio de compra registrado. Se mantienen las conversiones de peso, volumen y unidades; no se permite intercambiar dimensiones. Un importe directo de Jespresso se ajusta por el mismo rendimiento una sola vez. El motor conserva los decimales internos; los movimientos físicos usan la precisión existente de ocho decimales.

La cantidad equivalente del lote se distribuye entre la producción real y se multiplica por las porciones de cada unidad vendida. Las adiciones por porción conservan su tratamiento. Gastos, comisiones e impuestos mantienen el circuito existente.

## Sustitución del mecanismo anterior

Los controles globales de rendimiento de compra y merma adicional de producción se retiran. Sus campos antiguos se conservan neutralizados como compatibilidad de documentos: rendimiento 100 y merma adicional 0. El motor ya no aplica esas pérdidas. No se migran porcentajes antiguos a etapas que no se pueden inferir. La nueva configuración por preparación es el único mecanismo activo.

## Persistencia e inventario

El guardado usa los documentos de costeo existentes y sus revisiones. Cuando cambia la configuración de una receta vinculada, el backend actualiza su lista de consumo equivalente en la misma transacción. Una cuenta abierta con ese producto impide cambiar la configuración: ni el costeo ni su vínculo se confirman parcialmente.

Se reutilizan las reservas, los descuentos al vender o enviar a cartera y las devoluciones al anular. Guardar una merma no descuenta existencias. Las ventas y movimientos históricos mantienen los importes y consumos que ya tenían.

La cola local aplica la misma regla y conserva los cambios sin conexión. Al sincronizar, el backend vuelve a validar, confirma por identificador y conserva los conflictos para revisión. Las confirmaciones perdidas no repiten consumos.

## Verificación

- `tests/ingredient-yield.test.ts`: estados, etapas, porcentajes exactos, unidades y producción real.
- `tests/materials.test.ts`: vínculo GCOBARF, actualización de consumos y protección de cuentas abiertas.
- `tests/browser/ingredient-yield.spec.ts`: cuatro negocios, cancelar/guardar/reabrir, móvil y venta tras sincronizar sin conexión.
- `scripts/test-materials-live.ts --install`: compilación y circuito real en un negocio temporal aislado, con reversión completa ante conflictos.
