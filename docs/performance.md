# Rendimiento de acceso y navegación

## Acceso · 24 de noviembre de 2026

El login usa el logo existente de 192 píxeles (24.618 bytes) en lugar del original de 2.184.031 bytes. El módulo pequeño de fotos carga con `defer` y el catálogo visual se dibuja únicamente al abrir el modal.

Al entrar al campo de contraseña se anticipa el desafío SCRAM de un solo uso, sin contraseña ni claves derivadas. El envío consume ese desafío una sola vez; si han pasado 45 segundos, cambió el usuario o se limpió la preparación, obtiene otro. Se mantienen las 600.000 iteraciones, la validación de firma, la autorización y los rechazos del servidor. La conexión al origen de la API también se prepara al cargar el formulario. Estas mejoras reducen trabajo en la ruta del clic; la latencia o un arranque lento de Oracle siguen dependiendo del servidor y de la red.

## Actualización · 16 de noviembre de 2026

Los textos secundarios de Estadísticas usan un gris compartido más oscuro (#536258), incluidos ejes, leyendas, notas, tarjetas y diálogos. El contraste se comprueba en navegador sobre las superficies claras de las cinco vistas; las pruebas exigen al menos 4,5:1. Se conserva la distribución y el contenido.

Cambiar de vista actualiza el contenido y la selección en el mismo evento del clic: se retiró la espera artificial de 140 ms y el escalonamiento que ocultaba tarjetas. La transición de entrada dura 120 ms y solo mueve dos píxeles; el contenido aparece desde el primer momento. Se mantiene la preferencia de movimiento reducido.

Los botones, enlaces, desplegables de detalles y controles de selección del portal y las páginas operativas comparten touch-action: manipulation, evitando la espera del doble toque sin impedir desplazamiento o zoom con dos dedos ([referencia de MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)). Centro operativo ya utiliza esta política en sus botones y enlaces.

En el alojamiento publicado, los scripts y estilos cuyo parámetro v coincide con la versión instalada se sirven desde la caché. Las páginas siguen consultando la red para detectar entregas nuevas; las versiones diferentes se descargan y se guardan con claves separadas. Una prueba de actualización verifica que una versión futura no reciba código de la anterior ni sobrescriba sus archivos. La API y los datos de cuenta conservan su exclusión de la caché pública.

La regresión de navegación cubre los cuatro negocios con respuestas API retenidas: la mediana de las transiciones debe ser menor de 100 ms y cada transición menor de 300 ms, sin esperar a Oracle. Los cambios entre vistas de Estadísticas deben completar su actualización local en menos de 100 ms. Son límites de prueba en el equipo utilizado, no tiempos garantizados para cualquier dispositivo o conexión. El acceso nuevo y las confirmaciones mantienen las validaciones del servidor; no se omiten controles de seguridad ni se añaden consultas periódicas.

Validación: compilación completa, 384 pruebas automatizadas y 37 escenarios de navegador (Estadísticas en escritorio/móvil, navegación, caché PWA, inicio y cierre de sesión). Acceso real con negocio temporal: 27 comprobaciones aprobadas; muestra de Chrome: login 1694 ms, recarga 594 ms y salida 301 ms. El negocio temporal se elimina al finalizar.

## Historial · 21 de octubre de 2026

Cambios compartidos por las cuatro sucursales, el acceso del mesero y Centro operativo. No cambian el diseño, las fórmulas, los permisos ni los contratos de sincronización.

## Mediciones

Muestras con cuentas temporales aisladas, sobre el backend real de esta instalación:

| Recorrido | Resultado |
| --- | --- |
| Autenticación anterior, 3 muestras | 4.782, 4.905 y 4.796 ms; mediana 4.796 ms |
| Autenticación mediante prueba, 3 muestras | 698, 4.628 y 378 ms; mediana 698 ms |
| Formulario real en Chrome, tres ejecuciones posteriores | 1.543, 1.050 y 3.331 ms desde clic hasta panel |
| Recarga autenticada en esas ejecuciones | 800, 988 y 781 ms |
| Cierre de sesión en esas ejecuciones | 231, 286 y 276 ms |

Son mediciones locales, sin emular dispositivos lentos ni una prueba de carga. La red y el servidor pueden introducir variaciones, como muestra la segunda muestra de autenticación. El tiempo del formulario incluye validación, transporte y dibujo; no equivale al tiempo aislado del protocolo.

## Acceso

El cuello de botella era PBKDF2 implementado mediante 600.000 HMAC en un bucle PL/SQL. Se conservan SHA-256, la sal aleatoria de 16 bytes y las 600.000 iteraciones. El navegador calcula PBKDF2 con WebCrypto fuera del hilo de interfaz y envía una prueba de un solo uso. La base valida con HMAC y SHA-256 sin repetir el bucle.

Se usan las ecuaciones StoredKey, ClientProof y ServerSignature de [SCRAM-SHA-256](https://www.rfc-editor.org/rfc/rfc7677), descritas en [RFC 5802](https://www.rfc-editor.org/rfc/rfc5802), sobre el transporte JSON HTTPS de la aplicación; no es una implementación del intercambio SASL de esas RFC. El mensaje vincula negocio, usuario, sucursal, identificador y ambos nonces. El desafío vence en 90 segundos, se consume incluso tras una prueba incorrecta y conserva el límite de intentos. La respuesta también se verifica en el cliente antes de aceptar la sesión.

La base conserva StoredKey y ServerKey, nunca SaltedPassword para las cuentas convertidas. Las cuentas PBKDF2 anteriores siguen entrando por la ruta clásica y se convierten después de verificar su contraseña. No se usa su verificador anterior como credencial de acceso rápido. Sin WebCrypto o con un servidor anterior se conserva la ruta clásica; un error de prueba no se reintenta con la contraseña. Los tokens, la revocación, la autorización y la auditoría siguen siendo responsabilidad del servidor.

`scripts/migrate-auth-verifiers.ts` permite revisar cuentas pendientes; `--apply` convierte únicamente el negocio seleccionado con `BUSINESS_SLUG` (por defecto `tc-alliance`). Crea antes una copia AES-256-GCM en `../.tools/private-backups`, cifrada con una clave derivada de la configuración privada de mantenimiento. Esa copia debe mantenerse fuera del repositorio y del alojamiento público. La conversión conserva contraseñas y accesos. En esta instalación se convirtió una cuenta existente. La instalación reproducible incorpora `013_fast_auth_schema.sql` y `auth_proof.sql`.

Al recargar se puede mostrar la sesión activa ya autorizada en este equipo, usando el perfil y el token del almacén cifrado existente, con sus límites de vigencia y cierre. La renovación se confirma en segundo plano. Las llamadas privadas de red esperan esa confirmación y el rechazo o la revocación cierran la sesión. Un acceso nuevo sigue esperando una validación válida. Las respuestas que llegan después de cerrar sesión no vuelven a abrirla.

## Interacción y recursos

- Se muestra la sección seleccionada antes de iniciar sus consultas y su renderizado complementario. Se elimina un renderizado duplicado de operaciones.
- Los SVG ya dibujados se conservan; Lucide procesa los nuevos iconos.
- El guardado de borradores agrupa la escritura durante el tipeo. Navegar, enviar, salir del campo, ocultar la página o cerrar sesión fuerza el guardado pendiente; los cálculos y el formato monetario siguen actualizándose al escribir.
- La gestión de usuarios y la herramienta PDF se ejecutan cuando se abren. Siguen incluidas en la precarga PWA para utilizarlas sin conexión.
- En alojamiento publicado, las páginas y los archivos públicos ya cacheados se sirven desde el caché versionado de la aplicación. La API y los datos privados no entran allí. El desarrollo local conserva la consulta de recursos a la red para ver las ediciones.

## Repetir las comprobaciones

```powershell
npm run build
npm test
npx playwright test tests/browser/login-speed.spec.ts tests/browser/interaction-performance.spec.ts tests/browser/pages-performance.spec.ts tests/browser/operational-offline.spec.ts tests/browser/credit-lifecycle.spec.ts tests/browser/costing-inventory.spec.ts tests/browser/team-and-purchases.spec.ts --reporter=line
npx tsx scripts/test-auth-proof-live.ts --browser
```

El último comando requiere la configuración privada de mantenimiento. Crea y retira un negocio de prueba; comprueba contraseña errónea, desafío vencido y repetido, cuenta suspendida, conversión de formato, sucursal vinculada, acceso sin sucursal desde Centro operativo, formulario real, recarga y salida. No utiliza la contraseña ni los datos de la cuenta del usuario.

Resultado final: compilación y tipos aprobados, 119 pruebas automáticas, 41 escenarios de navegador comprobados en tandas y 15 comprobaciones contra el backend real. Incluye PDF cargado bajo demanda sin conexión, 100 ventas offline, respuesta perdida, conflictos, permisos, cierre revocado, costeo a inventario y cartera en las cuatro sucursales. La distribución contiene los mismos 17 archivos compartidos y páginas de acceso revisados en las fuentes.
