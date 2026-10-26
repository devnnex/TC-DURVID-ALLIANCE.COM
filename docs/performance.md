# Rendimiento de acceso y navegación · 21 de octubre de 2026

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
