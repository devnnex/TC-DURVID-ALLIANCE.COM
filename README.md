# TC-DURVID Alliance

Portal y centro operativo conectado a **Oracle JOlivia mediante ORDS**. Oracle ejecuta la API instalada; Live Server y GitHub Pages llaman a la misma URL HTTPS. Este flujo no requiere Render, wallet ni una API Node local.

## Empezar a usarlo

Existe una cuenta temporal de revisión **admin** en **tc-alliance**, creada a petición del usuario. Se mantiene hasta que solicite retirarla. Los accesos de las sucursales incluyen **Volver a negocios** y **Abrir demostración local**. La demostración usa el mismo panel y guarda sus ejemplos en el navegador.

1. Abre index.html con Live Server, o por doble clic, y entra en **Centro operativo**.
2. Comprueba **Conectado a Oracle** y entra en **Configurar por primera vez**.
3. Elige las sucursales y las credenciales del propietario. Ejecuta scripts/copy-setup-token.ps1 para copiar el token privado y pégalo en **Token de instalación**.
4. Dentro de cualquier negocio, abre **Usuarios** para crear empleados y asignar roles, sucursales y permisos sin salir del panel. También puedes acceder desde Centro operativo.
5. Regresa al portal y abre una sucursal: todas usan el panel operativo de Nápoles, conectado a Oracle. El mismo propietario entra en todas.

La configuración inicial guarda negocio, propietario y sucursales en una transacción. Después queda deshabilitada. La contraseña Oracle pertenece al mantenimiento; las credenciales del propietario se eligen en el formulario.

La primera línea de [api-config.js](api-config.js) contiene la URL pública real. Las credenciales Oracle y el token de instalación quedan fuera de Git y del frontend. No repetir las migraciones 001–007 ni ejecutar seed sobre JOlivia.

## Desarrollo y publicación

Node 22.12+ y npm; esta estación dispone del runtime portátil detectado por los scripts PowerShell.

~~~powershell
npm ci
npm run build
~~~

El build prepara admin/ para Live Server y dist/ para publicar. Para GitHub Pages, elegir **Settings → Pages → Source → GitHub Actions** una vez. Después, cada actualización de `main` ejecuta **Publicar frontend en GitHub Pages**, que construye y publica únicamente dist/. También admite ejecución manual desde Actions. La URL ORDS ya está configurada; no hacen falta secretos Oracle en GitHub ni configurar la API por dispositivo. El repositorio todavía no se ha publicado.

El doble clic abre el panel compilado sin servidor local. Para instalar la PWA y validar el funcionamiento offline completo, usar Live Server o GitHub Pages sobre HTTPS; los service workers requieren HTTP local o HTTPS.

El código Fastify permanece en apps/api como alternativa técnica y para pruebas aisladas. La implementación desplegada está en database/ords/. No alternar escritores de contraseñas entre implementaciones: ORDS usa verificadores SCRAM con PBKDF2 y la alternativa Node conserva su formato scrypt. Ver [API pública](docs/public-api.md).

La optimización del acceso, la recarga y la navegación está documentada en [Rendimiento](docs/performance.md), con mediciones y comprobaciones reproducibles.

## Verificación

~~~powershell
npm run typecheck
npm test
npm run test:browser
npm run ords:test
npm run ords:test:pos
~~~

Vitest y Playwright usan entornos aislados/simulados. ords:test comprueba Oracle real con negocios temporales identificados por UUID, los elimina al terminar y conserva las filas anteriores. ords:install actualiza paquetes y módulos mediante .env privado. La API ya está instalada: no es necesario reinstalarla para empezar.

Validación actual: 87 casos unitarios, 38 pruebas de navegador y 157 comprobaciones contra Oracle real (45 de operación complementaria, 39 POS, 29 de seguimiento y 44 de costeo). Se comprobó acceso HTTP y file://; las pruebas solo retiraron sus negocios temporales. [Evidencia y límites](docs/validation.md).

## Alcance pendiente

El panel conserva la presentación y los formularios de Nápoles. Mesas, cuentas, catálogo, existencias, movimientos y cobros ya usan Oracle por sucursal; el centro operativo se concentra en usuarios y accesos. Ver [operación por sucursal](docs/branch-operation.md).

Quedan los requisitos adicionales de caja compartida, recetas y costeo avanzado, migración de datos, certificación de ventas offline y ensayos productivos. El alcance corresponde a [requirements.md](docs/requirements.md), copia del Pasted text.txt original; el orden de trabajo está en [roadmap.md](docs/roadmap.md).

### Costeo de productos

Cada sucursal incluye **Costo de productos**, con ingredientes, recetas, gastos, canales, rentabilidad, versiones y descarga Excel. [Uso, fórmulas y validación](docs/product-costing.md). Funciona con Oracle y con la demostración local. El identificador del negocio está fijo en los accesos.

## Operación de sucursales y propuesta comercial

Todos los paneles incluyen Insumos y compras, Cocina y comandas, Clientes y cartera y Caja. Las recetas existentes del costeo se reutilizan para consumir ingredientes al vender, manteniendo el costo original. Las compras, pagos y cierres registran quién los confirmó.

Para trabajar el turno sin internet, prepara una vez el equipo y la cuenta con conexión. El panel guarda las operaciones localmente y al reconectar las confirma sin duplicarlas y descarga los cambios centrales. Consulta [Trabajar sin internet](docs/offline.md) y [Comparación con la propuesta](docs/proposal-comparison.md).

Pruebas de estos recorridos: `npm run ords:test:operations` contra Oracle con datos aislados, y `npx playwright test tests/browser/proposal-operations.spec.ts tests/browser/operational-offline.spec.ts`.


El portal también permite elegir **Mesero · Tomar pedidos** antes del negocio. Las comandas llegan a Inicio de esa sucursal; aceptar agrega los consumos a su mesa y rechazar conserva el seguimiento sin agregar productos. El turno y la base se registran desde Ventas. Cocina y Caja no añaden enlaces al menú, y el Asistente IA queda comentado. [Comandas y turnos](docs/orders.md).
