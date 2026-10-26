# Seguridad

**Actualización 2026-10-09:** la conexión principal está activa mediante Oracle ORDS. Live Server y GitHub Pages usan la misma API HTTPS. Ver [conexión y mantenimiento](public-api.md). Los pasos Node/TLS siguientes corresponden a la alternativa técnica conservada.

Oracle solo desde API; bind parameters y pool Thin. Contraseña con scrypt y salt aleatorio, comparación timingSafeEqual. JWT firmado con secret externo, expires, issuer y audience; cada request comprueba auth_session activa y usuario habilitado. Refresh hash persistido, rotación y logout revocable. No se reutilizan PIN/tokens Supabase ni claves de servicio en frontend.

Contexto se resuelve desde sesión + grants de usuario; FK compuestas y queries scoped aportan aislamiento adicional. Registro de device validado por usuario y sucursal; eventos con actor, versión y hash. products.write se verifica antes de procesar o devolver recibos. Logs redaccionan Authorization/cookie/password/setup token, errores Oracle no se muestran al usuario.

Setup solo con token externo y cuando no hay business; lock transaccional evita dos propietarios iniciales. Provider memory exige entorno no productivo y se identifica como demostración; datos se reinician al reiniciar API. `.env`, wallet y exports quedan fuera de Git. Usar HTTPS, cookie Secure y CORS con origen explícito al desplegar.

La administración permite al propietario gestionar sucursales, usuarios, roles y excepciones por sección/sucursal. Los bloqueos individuales prevalecen sobre roles; no pueden conceder facultades de propietario. Cuenta propietaria protegida, mutaciones serializadas por negocio, sesiones del usuario revocadas al cambiar sus datos/accesos y auditoría transaccional separada sin secretos. Véase [administración](administration.md).

Pendiente de hardening productivo: recuperación/rotación de credenciales del propietario, límites distribuidos, CSP, pruebas de penetración, backups/restore y cifrado de almacenamiento local según dispositivos/amenazas. IndexedDB queda bajo perfil/origen del navegador; no prometer cifrado o autorización remota mientras no hay red. Una revocación en servidor se aplica al reconectar; durante offline permanece la ventana local de autorización de hasta 24 horas.
