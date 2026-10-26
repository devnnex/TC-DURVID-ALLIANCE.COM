PROMPT MAESTRO PARA CODEX
Actúa como un Staff/Principal Software Architect especializado en:

- Oracle Database / Oracle Autonomous AI Transaction Processing
- sistemas POS
- inventarios
- restaurantes y retail
- arquitectura offline-first
- sincronización distribuida
- aplicaciones PWA
- IndexedDB
- TypeScript
- Node.js
- APIs de alto rendimiento
- seguridad
- UX/UI premium
- sistemas multi-sucursal
- impresión de recibos/facturas
- sistemas transaccionales de alta concurrencia

Tu trabajo no es solamente escribir código.

Debes diseñar y construir una plataforma POS/inventario profesional,
robusta, rápida, mantenible y preparada para producción.

El sistema existente actualmente utiliza Supabase + Google Apps Script.
El objetivo es migrar progresivamente el backend a:

ORACLE AUTONOMOUS AI TRANSACTION PROCESSING

manteniendo la funcionalidad existente y mejorando la arquitectura.

============================================================
1. OBJETIVO GENERAL
============================================================

Construir una plataforma centralizada para administrar varios negocios
y/o varias sucursales pertenecientes al mismo propietario.

Inicialmente existirán 4 sistemas/sucursales.

NO crear una base de datos independiente para cada sistema.

Debe existir una única base Oracle central.

La estructura debe soportar:

BUSINESS
    └── LOCATIONS
            ├── POS TERMINALS
            ├── CASH REGISTERS
            ├── TABLES
            ├── INVENTORY
            ├── ORDERS
            ├── SALES
            └── PAYMENTS

Cada operación debe estar correctamente aislada por:

business_id
location_id

El sistema debe poder crecer posteriormente a:

- más negocios
- más sucursales
- más cajas
- más dispositivos
- más usuarios
- más productos
- más transacciones

sin rediseñar la arquitectura principal.

============================================================
2. PRINCIPIO FUNDAMENTAL: OFFLINE FIRST
============================================================

Este sistema debe poder funcionar SIN INTERNET.

Esto NO es opcional.

El negocio puede perder internet durante varias horas o durante todo
el día y los empleados deben poder:

- abrir cajas
- consultar productos
- consultar precios
- consultar mesas
- crear pedidos
- modificar pedidos
- cerrar pedidos
- registrar ventas
- recibir pagos
- imprimir recibos
- descontar inventario localmente
- registrar movimientos de caja
- hacer ajustes permitidos
- continuar utilizando el POS

sin depender de una conexión permanente con Oracle.

Cuando vuelva internet:

1. detectar automáticamente la conexión
2. procesar las operaciones pendientes
3. sincronizar con el backend
4. registrar las operaciones en Oracle
5. confirmar cada operación
6. marcarla como sincronizada
7. descargar cambios provenientes del servidor
8. actualizar IndexedDB
9. mostrar claramente el estado de sincronización

El usuario NO debe tener que entender qué es sincronización.

La experiencia debe ser:

"trabajo normalmente y el sistema se encarga".

============================================================
3. STACK TECNOLÓGICO
============================================================

Usar tecnologías modernas, estables y de alto rendimiento.

Frontend:

- TypeScript
- React
- Vite
- PWA
- Service Worker
- IndexedDB
- Dexie.js
- React Router
- arquitectura modular
- componentes reutilizables

Backend:

- Node.js
- TypeScript
- Fastify
- node-oracledb
- API REST
- WebSocket o Server-Sent Events cuando sea útil
- validación estricta de schemas
- logging estructurado
- manejo de errores profesional

Database:

- Oracle Autonomous AI Transaction Processing
- SQL relacional normalizado
- constraints
- foreign keys
- indexes
- unique constraints
- transactions
- triggers solamente cuando realmente aporten valor
- procedimientos PL/SQL cuando sea apropiado
- views para consultas complejas
- materialized views únicamente cuando exista una necesidad real
- auditabilidad

NO utilizar Supabase como backend final.

NO utilizar Google Apps Script como backend final.

============================================================
4. ESTRUCTURA DEL PROYECTO
============================================================

Crear una arquitectura organizada similar a:

/apps
    /web
    /api

/packages
    /shared
    /types
    /validation
    /sync
    /ui

/database
    /migrations
    /seeds
    /functions
    /procedures
    /views
    /indexes

/infrastructure
    /oracle
    /deployment

/docs
    architecture.md
    database.md
    api.md
    sync.md
    offline.md
    security.md
    printing.md

scripts/

El proyecto debe poder ejecutarse inicialmente de manera sencilla.

Debe existir:

index.html

como punto de entrada del frontend.

Debe existir una interfaz administrativa inicial, por ejemplo:

/admin

o

admin.html

que permita realizar las primeras configuraciones.

No construir una aplicación monolítica desordenada.

============================================================
5. BASE DE DATOS ORACLE
============================================================

Antes de escribir las tablas definitivas:

1. analizar el sistema existente
2. identificar entidades existentes
3. identificar relaciones
4. identificar funcionalidades
5. identificar datos que deben migrarse
6. identificar reglas de negocio
7. proponer modelo Oracle
8. generar migraciones SQL

NO hacer una traducción mecánica de:

Supabase table → Oracle table.

Rediseñar correctamente el modelo para un sistema transaccional
profesional.

============================================================
6. ENTIDADES PRINCIPALES
============================================================

Como mínimo evaluar estas entidades:

BUSINESSES
BUSINESS_SETTINGS

LOCATIONS
LOCATION_SETTINGS

USERS
ROLES
PERMISSIONS
USER_ROLES

DEVICES
POS_TERMINALS

CASH_REGISTERS
CASH_REGISTER_SESSIONS
CASH_MOVEMENTS

TABLES
TABLE_SECTIONS

PRODUCTS
PRODUCT_VARIANTS
PRODUCT_CATEGORIES
PRODUCT_MODIFIERS
PRODUCT_MODIFIER_OPTIONS

INGREDIENTS
UNITS_OF_MEASURE
UNIT_CONVERSIONS

SUPPLIERS
PURCHASES
PURCHASE_ITEMS

RECIPES
RECIPE_ITEMS

PRODUCT_COSTS
COST_HISTORY
PRICING_RULES

INVENTORIES
INVENTORY_ITEMS
INVENTORY_MOVEMENTS
INVENTORY_TRANSFERS

ORDERS
ORDER_ITEMS
ORDER_ITEM_MODIFIERS
ORDER_STATUS_HISTORY

SALES
SALE_ITEMS
PAYMENTS
PAYMENT_METHODS
REFUNDS
REFUND_ITEMS

TAXES
DISCOUNTS
PROMOTIONS

CASH_MOVEMENTS

AUDIT_LOG

SYNC_OPERATIONS
SYNC_BATCHES
SYNC_CONFLICTS

NOTIFICATIONS

PRINTERS
PRINT_JOBS

============================================================
7. MULTI-BUSINESS / MULTI-LOCATION
============================================================

Diseñar para:

business_id
location_id

Los usuarios pueden tener acceso:

- a todo el negocio
- a determinadas sucursales
- a determinadas cajas
- a determinadas funciones

Ejemplo:

OWNER
    acceso total

ADMIN
    acceso administrativo

MANAGER
    acceso a una o varias sucursales

CASHIER
    acceso a caja/POS

WAITER
    acceso a mesas/pedidos

KITCHEN
    acceso a cocina

INVENTORY_MANAGER
    acceso a inventario

ACCOUNTING
    acceso financiero/reportes

Los permisos deben estar centralizados.

============================================================
8. PRODUCTOS E INGREDIENTES
============================================================

Los productos pueden ser:

- producto terminado
- producto preparado mediante receta
- producto simple
- producto con variantes
- producto con modificadores
- producto vendido por unidad
- producto vendido por peso
- producto vendido por volumen

Ejemplos:

Hamburguesa
Pizza
Café
Carne por libra
Ingrediente por kilogramo
Bebida por unidad

============================================================
9. UNIDADES DE MEDIDA
============================================================

Soportar como mínimo:

gramos
kilogramos
libras
onzas
mililitros
litros
unidades

Crear un sistema formal de conversiones.

Ejemplo:

1 kg = 1000 g

1 lb = 453.59237 g

No guardar conversiones arbitrariamente en el frontend.

Las conversiones deben estar centralizadas.

Permitir que el negocio configure unidades de compra y unidades
de consumo.

============================================================
10. SISTEMA DE RECETAS
============================================================

Un producto puede tener una receta.

Ejemplo:

HAMBURGUESA

Carne:
250 g

Pan:
1 unidad

Queso:
2 unidades

Tomate:
50 g

Salsa:
30 g

La receta debe permitir:

ingredient_id
quantity
unit_id
waste_percentage
optional/required

Al vender el producto:

SALE
    ↓
SALE_ITEM
    ↓
PRODUCT
    ↓
RECIPE
    ↓
RECIPE_ITEMS
    ↓
INVENTORY_MOVEMENTS

El inventario debe descontarse automáticamente según la receta.

============================================================
11. COSTEO DE PRODUCTOS
============================================================

El sistema debe calcular el costo real del producto.

Ejemplo:

Carne:
250 g × costo por gramo

Pan:
1 × costo unitario

Queso:
2 × costo unitario

Tomate:
50 g × costo por gramo

Salsa:
30 g × costo por gramo

Resultado:

ingredient_cost

Luego permitir agregar:

waste_cost
packaging_cost
labor_cost
overhead_cost
other_cost

Resultado:

total_product_cost

Después permitir reglas configurables:

markup_percentage
margin_percentage
tax_percentage
commission_percentage
discount_percentage

Calcular:

cost
recommended_price
selling_price
gross_profit
gross_margin
net_return

IMPORTANTE:

Diferenciar correctamente:

MARKUP

de:

MARGIN

No asumir que son iguales.

El usuario debe poder escoger qué modelo utiliza.

============================================================
12. HISTORIAL DE COSTOS
============================================================

No sobrescribir destructivamente los costos históricos.

Guardar historial.

Si la carne costaba:

$20.000/kg

y después:

$25.000/kg

debe ser posible saber:

- costo actual
- costo histórico
- fecha de cambio
- proveedor
- compra asociada

Las ventas históricas deben conservar su costo calculado correspondiente
al momento de la venta.

============================================================
13. INVENTARIO
============================================================

NO depender solamente de:

stock_quantity

Crear un verdadero ledger de inventario.

Cada movimiento debe registrar:

movement_id
business_id
location_id
inventory_id
product_or_ingredient_id
quantity
unit
movement_type
reference_type
reference_id
created_at
device_id
operation_id

Tipos mínimos:

INITIAL_STOCK
PURCHASE
SALE
WASTE
ADJUSTMENT
TRANSFER_IN
TRANSFER_OUT
RETURN
PRODUCTION
CONSUMPTION

El balance actual puede mantenerse para velocidad, pero debe ser
reconstruible desde los movimientos.

============================================================
14. INVENTARIO OFFLINE
============================================================

Cuando no exista internet:

IndexedDB debe mantener:

- productos
- precios
- recetas necesarias
- inventario relevante
- mesas
- configuración
- métodos de pago
- información necesaria para operar

Las ventas offline deben crear inmediatamente:

- order
- sale
- payment
- inventory movement
- cash movement

en IndexedDB.

No esperar al servidor.

La interfaz debe reaccionar inmediatamente.

============================================================
15. SYNC ENGINE
============================================================

Crear un Sync Engine independiente.

Debe existir:

sync_queue

Cada operación debe tener:

operation_id
device_id
business_id
location_id
entity_type
entity_id
operation_type
payload
client_created_at
server_received_at
status
retry_count
last_error
idempotency_key

Estados:

PENDING
SYNCING
SYNCED
FAILED
CONFLICT
REQUIRES_REVIEW

============================================================
16. IDEMPOTENCIA
============================================================

Esto es obligatorio.

Nunca duplicar:

- ventas
- pagos
- movimientos de inventario
- movimientos de caja
- pedidos

por un retry de red.

Cada operación debe tener un identificador único.

Oracle debe impedir duplicados mediante constraints apropiadas.

Si el cliente envía dos veces:

operation_id = ABC123

el backend debe reconocer que:

ABC123

ya fue procesado.

Debe devolver el resultado original y NO volver a ejecutar la operación.

============================================================
17. SINCRONIZACIÓN
============================================================

Flujo:

LOCAL OPERATION
    ↓
IndexedDB
    ↓
sync_queue
    ↓
internet available
    ↓
POST /sync
    ↓
backend
    ↓
Oracle transaction
    ↓
ACK
    ↓
IndexedDB marks SYNCED

Después:

server changes
    ↓
client
    ↓
IndexedDB
    ↓
UI refresh

La sincronización debe poder continuar si se interrumpe a mitad.

Ejemplo:

100 operaciones pendientes.

Se sincronizan 47.

Se pierde internet.

Al volver:

continuar desde 48.

NO comenzar desde cero.

============================================================
18. CONFLICTOS
============================================================

Diseñar explícitamente la estrategia de conflictos.

Casos importantes:

Dos dispositivos offline venden el mismo inventario.

Dos usuarios modifican un producto.

Dos dispositivos modifican el mismo pedido.

Una operación fue cancelada localmente mientras otra fue sincronizada.

El sistema debe distinguir:

- conflictos de datos maestros
- conflictos de inventario
- conflictos de pedidos
- conflictos financieros

Para inventario:

El servidor debe considerar los movimientos como eventos
transaccionales y reconstruir el balance.

NO confiar ciegamente en un stock local.

Configurar una política:

allow_negative_stock

true/false

Si se permite vender offline aunque el stock central pueda quedar
temporalmente negativo, registrar el evento y mostrarlo como alerta.

============================================================
19. DISPOSITIVOS
============================================================

Cada instalación debe tener:

device_id

persistente.

Registrar:

device_name
location_id
terminal_id
last_seen
app_version
last_sync_at

Esto permitirá saber:

Caja 1
Caja 2
Tablet mesero
Administrador
etc.

============================================================
20. CAJAS POS
============================================================

El sistema debe permitir:

ABRIR CAJA

Registrar:

cash_register_id
user_id
opening_amount
opened_at
device_id

Durante la jornada:

- ventas
- pagos
- entradas
- retiros
- ajustes
- devoluciones

Al finalizar:

CERRAR CAJA

Calcular:

opening_cash
cash_sales
cash_in
cash_out
expected_cash
actual_cash
difference

Registrar diferencias.

============================================================
21. MÉTODOS DE PAGO
============================================================

Como mínimo:

EFECTIVO
TARJETA
TRANSFERENCIA
OTRO

Permitir configurar métodos adicionales.

Las ventas pueden utilizar múltiples pagos.

Ejemplo:

Venta:

$100.000

Pago:

$50.000 efectivo
$50.000 tarjeta

Soportar pagos parciales cuando corresponda.

============================================================
22. MESAS
============================================================

Cada location puede tener:

secciones
mesas
estado

Estados:

AVAILABLE
OCCUPIED
RESERVED
CLEANING
DISABLED

Una mesa puede tener un pedido abierto.

Debe ser extremadamente rápido:

mesa → productos → cantidad → enviar → cobrar

============================================================
23. PEDIDOS
============================================================

Separar:

ORDER

de:

SALE

Una orden puede estar abierta.

Estados:

OPEN
CONFIRMED
PREPARING
READY
SERVED
PAID
CANCELLED

Una venta representa la transacción económica.

============================================================
24. VENTA
============================================================

Cuando se confirma una venta, realizar de manera transaccional:

1. SALE
2. SALE_ITEMS
3. PAYMENT
4. INVENTORY_MOVEMENTS
5. CASH_MOVEMENTS
6. COST SNAPSHOT
7. AUDIT_LOG

Cuando corresponda.

La operación debe ser atómica.

Si falla una parte crítica:

rollback.

============================================================
25. DEVOLUCIONES Y ANULACIONES
============================================================

Nunca eliminar una venta de producción.

Usar:

VOID
REFUND
RETURN

Mantener trazabilidad.

Toda modificación financiera debe quedar auditada.

============================================================
26. FACTURACIÓN / RECIBOS
============================================================

El POS debe permitir imprimir inmediatamente el consumo del cliente
cuando se realiza el cobro.

Soportar:

- impresoras térmicas 58 mm
- impresoras térmicas 80 mm
- impresión A4
- PDF cuando corresponda
- navegador/print dialog como fallback

Crear una capa:

PrintingService

No acoplar la lógica de ventas directamente a la impresora.

Crear:

PrintJob

con:

print_job_id
document_type
sale_id
printer_id
status
created_at
printed_at
retry_count

Tipos:

SALE_RECEIPT
ORDER_RECEIPT
KITCHEN_TICKET
CASH_REGISTER_REPORT
INVENTORY_REPORT

El sistema debe poder reimprimir.

============================================================
27. FACTURACIÓN ELECTRÓNICA
============================================================

NO asumir que un recibo POS es automáticamente una factura electrónica
válida ante DIAN.

Diseñar una abstracción:

ElectronicInvoicingProvider

para permitir integrar posteriormente el proveedor de facturación
electrónica y los requisitos DIAN.

El POS debe poder trabajar independientemente de esta integración.

El documento impreso debe distinguir claramente entre:

RECIBO DE VENTA

y:

FACTURA ELECTRÓNICA

cuando corresponda.

============================================================
28. MONEDA
============================================================

TODO el sistema debe trabajar inicialmente en:

COP

Peso colombiano.

Locale:

es-CO

Los valores monetarios deben mostrarse como pesos colombianos.

Ejemplo:

$25.000

$125.500

$1.250.000

No mostrar:

USD
$
25,000.00

salvo que exista una configuración explícita para otra moneda.

Crear un Money/Decimal strategy.

NO utilizar floating point JavaScript para cálculos monetarios críticos.

En Oracle utilizar tipos numéricos adecuados.

Los cálculos financieros deben ser determinísticos.

============================================================
29. INTERFAZ
============================================================

La interfaz debe ser PREMIUM.

Inspiración:

Apple
iOS
macOS
Apple POS-style simplicity

Pero NO copiar interfaces propietarias literalmente.

Principios:

- minimalista
- limpia
- elegante
- espacios amplios
- jerarquía visual clara
- tipografía moderna
- iconografía consistente
- microanimaciones
- feedback inmediato
- botones grandes
- estados claros
- navegación sencilla

============================================================
30. COLORES DE CADA NEGOCIO
============================================================

Cada BUSINESS debe poder definir:

primary_color
secondary_color
accent_color
background_color
logo

La interfaz debe adaptar:

- botones
- highlights
- navegación
- badges
- estados
- componentes POS

al branding del negocio.

No crear cuatro aplicaciones diferentes.

Crear un sistema de temas.

Ejemplo:

ThemeProvider

business branding
    ↓
CSS variables
    ↓
UI

============================================================
31. UX PARA PERSONAS NO TÉCNICAS
============================================================

Los usuarios NO son programadores.

La aplicación debe ser extremadamente sencilla.

No utilizar lenguaje técnico.

Evitar:

"commit"
"transaction"
"sync queue"
"API error"

Mostrar:

"Guardado"
"Sin conexión"
"Sincronizando..."
"Todo actualizado"
"No se pudo sincronizar. Lo intentaremos nuevamente."

Si ocurre un error:

explicar:

qué ocurrió
qué puede hacer el usuario

sin mostrar stack traces.

============================================================
32. VELOCIDAD
============================================================

El sistema debe sentirse instantáneo.

La acción:

CLICK

debe producir feedback visual prácticamente inmediato.

No esperar innecesariamente al servidor para actualizar la UI.

Usar:

optimistic UI

cuando sea seguro.

Ejemplo:

Agregar producto al pedido:

CLICK
↓
UI actualiza inmediatamente
↓
IndexedDB guarda
↓
sync posteriormente

No:

CLICK
↓
esperar internet
↓
esperar backend
↓
esperar Oracle
↓
actualizar pantalla

============================================================
33. PERFORMANCE
============================================================

Optimizar:

- lazy loading
- code splitting
- caching
- IndexedDB
- memoization donde corresponda
- virtualización de listas grandes
- índices Oracle
- connection pooling
- prepared statements
- consultas eficientes
- paginación
- evitar N+1 queries

No realizar consultas innecesarias.

No cargar todo el inventario si la pantalla solamente necesita
los productos de una categoría.

============================================================
34. MOBILE
============================================================

Mobile-first.

Debe funcionar perfectamente en:

- teléfonos
- tablets
- laptops
- desktop POS

No asumir que el usuario utilizará mouse.

Todos los controles importantes deben ser táctiles.

Targets táctiles cómodos.

============================================================
35. NO ZOOM EN INPUTS
============================================================

Especialmente en iPhone/iPad:

Los inputs deben utilizar un tamaño de fuente mínimo apropiado
para evitar el zoom automático del navegador.

No permitir que el usuario tenga que hacer zoom para trabajar.

Los formularios deben ser cómodos para touch.

============================================================
36. POS UI
============================================================

Diseñar una interfaz POS especializada.

Ejemplo:

┌─────────────────────────────────────────────┐
│ LOGO        Caja 1       Usuario     🟢    │
├───────────────────┬─────────────────────────┤
│ Categorías        │ Pedido                  │
│                   │                         │
│ Hamburguesas      │ Hamburguesa x2          │
│ Bebidas           │ Coca-Cola x1            │
│ Combos            │                         │
│ Postres           │                         │
│                   │                         │
├───────────────────┤                         │
│ Productos         │ TOTAL                   │
│                   │ $85.000                 │
│ [Producto]        │                         │
│ [Producto]        │ [COBRAR]                │
│ [Producto]        │                         │
└───────────────────┴─────────────────────────┘

El POS debe poder utilizarse rápidamente sin entrenamiento técnico.

============================================================
37. DASHBOARD ADMINISTRATIVO
============================================================

Crear dashboard para propietarios/administradores.

Mostrar:

ventas del día
ventas por sucursal
ventas por producto
ventas por categoría
métodos de pago
cajas abiertas
cajas cerradas
inventario
productos bajos en stock
costos
márgenes
utilidad
pedidos
mesas
sincronización
dispositivos

El propietario debe poder desde otro dispositivo consultar lo que
ocurrió en las sucursales después de sincronizar.

============================================================
38. ESTADO DE CONECTIVIDAD
============================================================

Siempre mostrar discretamente:

ONLINE

o:

OFFLINE

Cuando offline:

"Trabajando sin conexión"

No bloquear el POS.

Cuando vuelve internet:

"Conexión restaurada"

"Sincronizando 18 operaciones..."

"Sincronización completa"

No interrumpir al usuario.

============================================================
39. SEGURIDAD
============================================================

Implementar:

authentication
authorization
role-based access control
business isolation
location isolation
audit logging
secure password handling
session management
token expiration
refresh strategy

Nunca confiar en:

business_id
location_id
user_id

enviados por el frontend sin validación.

El backend debe determinar y validar el contexto del usuario.

============================================================
40. AUDITORÍA
============================================================

Registrar operaciones críticas:

LOGIN
LOGOUT

SALE
REFUND
VOID

INVENTORY_ADJUSTMENT
INVENTORY_TRANSFER

PRODUCT_CREATE
PRODUCT_UPDATE

RECIPE_CREATE
RECIPE_UPDATE

PRICE_CHANGE
COST_CHANGE

CASH_OPEN
CASH_CLOSE
CASH_IN
CASH_OUT

USER_CREATE
USER_UPDATE
ROLE_CHANGE

Cada audit record debe incluir:

user_id
device_id
business_id
location_id
action
entity_type
entity_id
before
after
timestamp

============================================================
41. API
============================================================

Diseñar API versionada:

/api/v1

Ejemplos:

GET    /api/v1/products
GET    /api/v1/products/:id

POST   /api/v1/orders
GET    /api/v1/orders/:id
PATCH  /api/v1/orders/:id

POST   /api/v1/sales
POST   /api/v1/sales/:id/refund

POST   /api/v1/cash/registers/:id/open
POST   /api/v1/cash/registers/:id/close

GET    /api/v1/inventory
POST   /api/v1/inventory/adjustments
POST   /api/v1/inventory/transfers

POST   /api/v1/sync
GET    /api/v1/sync/changes

GET    /api/v1/dashboard

etc.

No exponer CRUD indiscriminado.

Los endpoints deben representar acciones y reglas de negocio.

============================================================
42. VALIDACIÓN
============================================================

Usar schemas estrictos.

Validar:

frontend
backend
database

cuando corresponda.

Utilizar una estrategia consistente de validación.

Nunca confiar exclusivamente en validación frontend.

============================================================
43. ERROR HANDLING
============================================================

Crear errores tipados.

Ejemplo:

INSUFFICIENT_STOCK
INVALID_PAYMENT
REGISTER_NOT_OPEN
ORDER_ALREADY_PAID
SALE_ALREADY_REFUNDED
SYNC_CONFLICT
DUPLICATE_OPERATION
UNAUTHORIZED
FORBIDDEN

El frontend debe convertir estos errores en mensajes comprensibles.

============================================================
44. MIGRACIÓN DESDE SUPABASE
============================================================

Antes de modificar funcionalidad:

analizar completamente el sistema actual.

Identificar:

- tablas
- columnas
- foreign keys
- indexes
- triggers
- RPC
- funciones
- policies
- edge functions
- consultas
- workflows
- Apps Script
- lógica de costos
- lógica de inventario
- lógica de ventas
- usuarios
- roles

Crear:

/docs/migration-map.md

con:

OLD SUPABASE
      ↓
NEW ORACLE

No perder información.

Crear scripts de migración.

============================================================
45. SEEDS
============================================================

Crear seeds de desarrollo.

Debe ser posible levantar un ambiente de prueba con:

1 business
4 locations
usuarios
roles
productos
ingredientes
recetas
inventario
mesas
cajas
métodos de pago

para probar inmediatamente el sistema.

============================================================
46. MIGRACIONES ORACLE
============================================================

Generar archivos SQL ordenados:

001_extensions.sql
002_businesses.sql
003_users.sql
004_locations.sql
005_products.sql
006_ingredients.sql
007_units.sql
008_recipes.sql
009_costing.sql
010_inventory.sql
011_orders.sql
012_sales.sql
013_payments.sql
014_cash_registers.sql
015_audit.sql
016_sync.sql
...

Debe existir un script de instalación.

Por ejemplo:

npm run db:migrate

o equivalente.

No obligar al usuario a copiar SQL manualmente uno por uno.

============================================================
47. CONFIGURACIÓN
============================================================

Nunca hardcodear:

passwords
tokens
Oracle credentials
API keys

Usar:

.env

y documentación:

.env.example

Ejemplo:

ORACLE_USER=
ORACLE_PASSWORD=
ORACLE_CONNECT_STRING=

API_PORT=
JWT_SECRET=

etc.

============================================================
48. TESTING
============================================================

Crear tests para:

- costos
- conversiones
- recetas
- inventario
- ventas
- pagos
- caja
- sincronización
- idempotencia
- conflictos
- permisos

Especialmente probar:

OFFLINE → SALE → ONLINE → SYNC

y:

OFFLINE → 100 SALES → ONLINE → SYNC

y:

SYNC → INTERNET LOST → RETRY

y:

DUPLICATE OPERATION

y:

TWO DEVICES SELLING OFFLINE

============================================================
49. TEST CRÍTICO DE IDEMPOTENCIA
============================================================

Simular:

device A:

sale operation_id = ABC

enviar 5 veces.

Resultado esperado:

1 sola venta.

1 solo pago.

1 solo descuento de inventario.

1 solo movimiento de caja.

1 solo registro financiero.

============================================================
50. TEST CRÍTICO OFFLINE
============================================================

Desconectar internet.

Realizar:

20 pedidos
20 ventas
20 pagos
100 movimientos de inventario

Cerrar navegador.

Abrir nuevamente.

Los datos deben continuar disponibles localmente.

Conectar internet.

Todo debe sincronizarse.

============================================================
51. DOCUMENTACIÓN
============================================================

Crear documentación profesional:

README.md

docs/architecture.md
docs/database.md
docs/api.md
docs/offline.md
docs/sync.md
docs/security.md
docs/printing.md
docs/deployment.md
docs/migration.md

Explicar cómo:

1. configurar Oracle
2. ejecutar migraciones
3. crear usuario inicial
4. levantar backend
5. levantar frontend
6. registrar device
7. probar offline
8. sincronizar
9. imprimir
10. desplegar

============================================================
52. ADMIN INITIALIZATION
============================================================

Crear un flujo inicial:

/admin/setup

para:

- conectar/configurar entorno
- crear business inicial
- crear location
- crear usuario owner
- configurar moneda COP
- cargar logo
- configurar colores
- crear primera caja
- crear primer device
- configurar impresora

Una vez inicializado:

deshabilitar o proteger el setup.

============================================================
53. NO ROMPER EL FRONTEND EXISTENTE
============================================================

La migración debe ser progresiva.

Primero:

Oracle schema
+
API
+
sync architecture

Después:

conectar módulo por módulo.

No eliminar la implementación existente hasta comprobar que
la nueva implementación funciona.

============================================================
54. PRIORIDAD DE IMPLEMENTACIÓN
============================================================

FASE 1

Arquitectura
Database
Migrations
Backend
Authentication
Business
Locations
Users
Products
Ingredients
Units

FASE 2

Recipes
Costing
Inventory
Inventory movements

FASE 3

POS
Tables
Orders
Payments
Cash registers
Sales

FASE 4

Offline IndexedDB
Sync engine
Idempotency
Conflict handling

FASE 5

Printing
Receipts
Cash reports

FASE 6

Dashboard
Reports
Analytics

FASE 7

Hardening
Security
Performance
Testing
Deployment

============================================================
55. REGLA FUNDAMENTAL DE IMPLEMENTACIÓN
============================================================

NO empieces escribiendo cientos de archivos.

Primero analiza.

Luego produce:

A. arquitectura
B. ERD
C. modelo de datos
D. API contract
E. offline/sync design
F. migration plan

Después de eso comienza la implementación.

Cada fase debe dejar el proyecto ejecutable.

============================================================
56. CRITERIOS DE CALIDAD
============================================================

El resultado debe sentirse como software comercial profesional.

No debe parecer:

- proyecto experimental
- CRUD genérico
- dashboard template
- sistema académico
- aplicación administrativa vieja

Debe sentirse:

rápido
limpio
premium
confiable
simple
moderno

El usuario debe poder operar el POS sin conocer tecnología.

============================================================
57. PRINCIPIO FINAL
============================================================

La aplicación debe tratar Oracle como fuente central de verdad,
pero IndexedDB como fuente operacional local mientras el dispositivo
está offline.

La arquitectura final debe ser:

                    INTERNET
                       │
                       ▼
              ┌────────────────┐
              │   ORACLE ATP   │
              │ CENTRAL DATA   │
              └───────┬────────┘
                      │
                   BACKEND
                      │
             ┌────────┴────────┐
             │                 │
          ONLINE            OFFLINE
             │                 │
             ▼                 ▼
        IndexedDB          IndexedDB
             │                 │
             └────────┬────────┘
                      │
                  SYNC ENGINE
                      │
                      ▼
                  ORACLE ATP

La experiencia del usuario debe ser independiente de la calidad
de internet.

============================================================
58. PRIMERA TAREA
============================================================

NO empieces todavía creando el POS completo.

Primero inspecciona el repositorio actual.

Identifica:

- frontend
- backend
- Supabase
- Apps Script
- database schema
- funciones
- workflows
- autenticación
- inventario
- ventas
- costos
- recetas
- impresión

Después crea:

/docs/architecture.md
/docs/database.md
/docs/migration-map.md
/docs/sync.md

y un ERD inicial.

Luego crea las migraciones Oracle.

Después crea el backend.

Después crea el sistema de sincronización.

Después conecta progresivamente el frontend.

Antes de realizar cambios destructivos,
explica qué será cambiado y por qué.

No eliminar funcionalidades existentes.

No inventar reglas de negocio que no existan en el sistema actual.

Cuando encuentres una ambigüedad importante,
documentarla y utilizar una decisión técnicamente segura,
manteniendo la arquitectura extensible.

OBJETIVO FINAL:

Un sistema POS multi-sucursal profesional,
offline-first, rápido, seguro, con inventario,
recetas, costos, ventas, mesas, cajas, pagos,
impresión y sincronización con Oracle ATP,
usable por personas no técnicas desde teléfonos,
tablets y computadoras.
Una cosa que añadiría a ese prompt
Hay una decisión que para tu caso particular es muy importante: IndexedDB debe guardar eventos, no solamente estados.

Por ejemplo, no quiero que offline tengas solamente:

inventario_carne = 8.5 kg
Quiero que tengas también:

SALE #1001
-250 g

SALE #1002
-500 g

WASTE #1003
-100 g
Eso hace que la sincronización sea mucho más segura.

La arquitectura sería:

                  DISPOSITIVO
                      │
              ┌───────▼────────┐
              │   IndexedDB     │
              │                 │
              │ Products        │
              │ Orders          │
              │ Sales           │
              │ Inventory       │
              │ Cash            │
              │ Sync Queue      │
              └───────┬─────────┘
                      │
                cuando hay red
                      │
                      ▼
                 BACKEND API
                      │
              idempotency check
                      │
                      ▼
                ORACLE ATP
                      │
              ┌───────┴────────┐
              │                │
          Ledger             Balance
              │                │
              └───────┬────────┘
                      ▼
                 Dashboard
Así, cuando el dueño abra el sistema desde otro dispositivo, puede ver:

Sucursal 2 — sincronizada hace 3 minutos
y:

Ventas: $2.845.000 Productos vendidos: 183 Efectivo: $1.120.000 Tarjeta: $985.000 Transferencias: $740.000 Caja abierta: Sí Inventario: actualizado
Y si una sucursal lleva 7 horas offline:

Sucursal 3 — trabajando sin conexión Última sincronización: 8:42 AM Operaciones pendientes en dispositivo: 146
Cuando conecten internet:

Sincronizando… 146/146
y el administrador verá los datos centrales.

Y para el frontend
Yo no permitiría que Codex construya un sistema donde cada click haga:

click
→ API
→ Oracle
→ esperar
→ render
Para un POS eso se siente lento.

Quiero:

CLICK
  ↓
UI responde inmediatamente
  ↓
IndexedDB
  ↓
Sync en background
  ↓
Oracle
Ese detalle es el que hará que el sistema se sienta realmente rápido, incluso cuando internet esté malo.

Finalmente, para Colombia, dejaría desde el primer día el sistema configurado como es-CO + COP, pero separaría técnicamente recibo POS de factura electrónica DIAN. Así puedes imprimir el comprobante inmediatamente sin acoplar todo el POS al proveedor de facturación electrónica, y posteriormente conectar el componente fiscal correspondiente sin rehacer ventas, caja e inventario.