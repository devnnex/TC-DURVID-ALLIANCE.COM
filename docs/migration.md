# Estado de migración

Ver [mapa](migration-map.md), [modelo](database.md), [arquitectura](architecture.md) y [sync](sync.md). La primera entrega es aditiva: portal, login y módulos legacy siguen presentes. El nuevo panel permite validar catálogo y sincronización, no reemplaza caja. No se han leído ni modificado bases remotas.

Antes de migrar datos reales hace falta confirmar la relación business/location de las marcas, disponer de exports de TC/Supabase/Sheets, inventariar dispositivos/pendientes y acordar un corte sin doble escritura. Las migraciones Oracle se ejecutan con credenciales aportadas mediante `.env`. Las pruebas con proveedor memory/IndexedDB no sustituyen pruebas contra ATP.
