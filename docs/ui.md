# UI y progresión funcional

Portal y accesos se conservan. El panel usa Nápoles como referencia: lateral, métricas, paneles, catálogo, sucursales y actividad. Una aplicación con temas CSS variables; escritorio, lateral compacta en tablet, navegación inferior móvil, inputs de 16 px y acciones táctiles. Tipografías empaquetadas localmente.

Home muestra datos de catálogo/cola, no ventas ficticias. Catálogo busca/filtra, guarda primero en Dexie y presenta estado local/confirmado/revisión. Actividad exporta pendientes. «Conservar versión central» resuelve una cadena de cambios y conserva eventos; para reaplicar, editar sobre la nueva versión. Actualizaciones PWA se ofrecen sin recargar un formulario activo.

El portal muestra tres marcas activas. El espacio para un negocio futuro permanece comentado en index.html hasta que se habilite. Los logos originales del portal siguen en assets/.

## Portada adaptable · 17 de noviembre de 2026

El encabezado y el selector de modo ocupan una altura compacta y las tres tarjetas aprovechan el resto de la pantalla. Se conserva la identidad oscura y dorada, las ilustraciones y los enlaces de administrador y mesero. En móvil las tarjetas se apilan; en horizontal vuelven a tres columnas y el logo acompaña al título en una franja corta. Los accesos asignados conservan una única tarjeta centrada.

Las reglas anteriores de scroll y altura se sustituyeron por una cuadrícula que usa la altura visible del dispositivo. No se bloquea el scroll vertical para esconder desbordamientos; la distribución se comprueba sin recortes ni solapamientos en 14 tamaños entre 320 × 480 y 1920 × 900, incluidos 568 × 320 y 844 × 390 en horizontal, para ambos modos de acceso. En alturas reducidas se omiten adornos e indicaciones repetidas, conservando los negocios, el selector y las acciones. Los efectos de enfoque y movimiento reducido siguen disponibles. No se añaden scripts ni consultas de red.
