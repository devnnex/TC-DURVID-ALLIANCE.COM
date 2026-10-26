import { config } from '../apps/api/src/config.js';
import { oracleSettings,oracleErrorMessage } from '../apps/api/src/oracle-settings.js';
try{
  const cfg=config();if(cfg.provider!=='oracle')throw new Error('Este arranque requiere DATA_PROVIDER=oracle. Ejecuta scripts/configure-oracle.ps1 para preparar la conexión real.');
  oracleSettings();console.log('Entorno de prueba seleccionado: Oracle real.');
}catch(e){console.error(e instanceof Error&&(/Este arranque requiere|Configura JWT_SECRET/.test(e.message))?e.message:oracleErrorMessage(e));process.exitCode=1;}
