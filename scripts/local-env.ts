import { randomBytes } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import dotenv from 'dotenv';

function literal(value:string){
  if(/[\r\n]/.test(value))throw new Error('La configuración debe ocupar una sola línea por valor.');
  for(const quote of ["'",'"','`'])if(!value.includes(quote))return quote+value+quote;
  throw new Error('Ese valor necesita un formato distinto. Usa el asistente para introducir la contraseña.');
}
export async function initializeEnv(root:string){
  const template=await readFile(join(root,'.env.example'),'utf8');
  const text=template.replace(/^JWT_SECRET=.*$/m,`JWT_SECRET=${randomBytes(32).toString('hex')}`).replace(/^SETUP_TOKEN=.*$/m,`SETUP_TOKEN=${randomBytes(32).toString('hex')}`).replace(/^WEB_ORIGIN=.*$/m,'WEB_ORIGIN=http://127.0.0.1:4173');
  try{await writeFile(join(root,'.env'),text,{flag:'wx',mode:0o600});return true;}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return false;throw e;}
}
export async function saveOracleEnv(root:string,input:Record<string,string>){
  await initializeEnv(root);const path=join(root,'.env');const values=dotenv.parse(await readFile(path,'utf8'));
  const allowed=['ORACLE_USER','ORACLE_CONNECT_STRING','ORACLE_CONNECTION_MODE','ORACLE_CONFIG_DIR','ORACLE_WALLET_LOCATION'];
  for(const key of allowed)values[key]=input[key]||'';
  // Encoding preserves arbitrary password punctuation through PowerShell/stdin
  // and dotenv. Base64 is a file format, not encryption.
  for(const key of ['ORACLE_PASSWORD','ORACLE_WALLET_PASSWORD']){values[key]='';values[key+'_BASE64']=Buffer.from(input[key]||'','utf8').toString('base64');}
  for(const key of ['JWT_SECRET','SETUP_TOKEN'])if((values[key]||'').length<32)values[key]=randomBytes(32).toString('hex');
  values.DATA_PROVIDER='oracle';values.NODE_ENV='development';values.API_HOST='127.0.0.1';values.API_PORT='3001';values.WEB_ORIGIN='http://127.0.0.1:4173';
  await writeFile(path,'# Configuración privada del servidor. No compartir ni publicar.\n# Las contraseñas BASE64 están codificadas, no cifradas.\n'+Object.entries(values).map(([k,v])=>`${k}=${literal(v)}`).join('\n')+'\n',{mode:0o600});
}
