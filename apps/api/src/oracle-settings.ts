import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function oracleSettings(env:NodeJS.ProcessEnv=process.env){
  const decode=(key:string)=>env[key]|| (env[key+'_BASE64']?Buffer.from(env[key+'_BASE64']!,'base64').toString('utf8'):'');
  const user=env.ORACLE_USER?.trim(),password=decode('ORACLE_PASSWORD'),connectString=env.ORACLE_CONNECT_STRING?.trim();
  if(!user||!password||!connectString)throw new Error('Faltan los datos de Oracle. Ejecuta scripts/configure-oracle.ps1 para configurarlos localmente.');
  const mode=env.ORACLE_CONNECTION_MODE||(env.ORACLE_WALLET_LOCATION?'MTLS':'TLS');
  if(!['TLS','MTLS'].includes(mode))throw new Error('ORACLE_CONNECTION_MODE debe ser TLS o MTLS.');
  const configDir=env.ORACLE_CONFIG_DIR||undefined,walletLocation=env.ORACLE_WALLET_LOCATION||undefined,walletPassword=decode('ORACLE_WALLET_PASSWORD')||undefined;
  if(mode==='MTLS'&&(!walletLocation||!existsSync(join(walletLocation,'ewallet.pem'))))throw new Error('Para usar wallet, indica la carpeta descomprimida que contiene ewallet.pem.');
  if(configDir&&!existsSync(join(configDir,'tnsnames.ora')))throw new Error('La carpeta de conexiones debe contener tnsnames.ora.');
  if(mode==='TLS'&&!configDir&&!/^tcps:\/\//i.test(connectString)&&!(/\(\s*PROTOCOL\s*=\s*TCPS\s*\)/i.test(connectString)))throw new Error('Copia la cadena TLS de Database Connection en Oracle Cloud; la URL de Database Actions no es una conexión de base de datos.');
  return {user,password,connectString,configDir,walletLocation:mode==='MTLS'?walletLocation:undefined,walletPassword:mode==='MTLS'?walletPassword:undefined,sslServerDNMatch:true};
}

export function oracleErrorMessage(error:unknown):string{
  const message=error instanceof Error?error.message:String(error);
  if(/ORA-01017|NJS-116/.test(message))return 'Oracle rechazó las credenciales o el método de autenticación. Revisa el usuario y la contraseña del esquema donde ejecutaste los SQL.';
  if(/ORA-28000/.test(message))return 'La cuenta Oracle está bloqueada. Desbloquéala en Oracle antes de volver a conectar.';
  if(/ORA-12506|ORA-12529/.test(message))return 'La política de red de Oracle rechazó la conexión. Revisa en la consola el acceso permitido para este equipo.';
  if(/NJS-5(11|18)|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ORA-12170|ORA-125(14|41)/.test(message))return 'No se pudo llegar al servicio Oracle. Revisa la cadena de conexión, el estado de la base y el acceso de red del equipo.';
  if(/NJS-5(10|12)|ORA-28759|wallet|certificate|TLS/i.test(message)&&!/Copia la cadena TLS|ORACLE_CONNECTION_MODE/.test(message))return 'No se pudo validar la conexión segura. Revisa la modalidad TLS o el wallet y su contraseña según la configuración de Oracle.';
  // Never echo a driver error containing a descriptor, password or file contents.
  if(/ORA-|NJS-|DPI-/.test(message))return `Oracle no pudo completar la conexión (${message.match(/(?:ORA|NJS|DPI)-\d+/)?.[0]}). Revisa la configuración local y la consola de Oracle.`;
  return message.startsWith('Faltan los datos')||message.startsWith('Copia la cadena')||message.startsWith('La carpeta')||message.startsWith('Para usar wallet')||message.startsWith('ORACLE_CONNECTION_MODE')?message:'No se pudo comprobar Oracle. Consulta docs/oracle-connection.md para revisar la conexión.';
}
