import '../apps/api/src/config.js';
import { createOraclePool } from '../apps/api/src/oracle.js';
import { checkOracle, SchemaNotReady } from '../apps/api/src/oracle-check.js';
import { oracleErrorMessage } from '../apps/api/src/oracle-settings.js';
let pool:Awaited<ReturnType<typeof createOraclePool>>|undefined;
try{
  pool=await createOraclePool();const status=await checkOracle(pool);
  console.log(`Oracle conectado. Esquema: ${status.schema}. ${status.tables} tablas y permisos iniciales comprobados.`);
  console.log(status.setup_required?'Siguiente paso: configurar sucursales y propietario desde el frontend.':'La configuración inicial ya existe. Inicia sesión con un usuario del sistema.');
}catch(e){console.error(e instanceof SchemaNotReady?e.message:oracleErrorMessage(e));process.exitCode=1;}finally{if(pool)await pool.close(0);}
