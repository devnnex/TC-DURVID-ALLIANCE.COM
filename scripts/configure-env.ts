import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { initializeEnv,saveOracleEnv } from './local-env.js';
import { oracleSettings } from '../apps/api/src/oracle-settings.js';
import { z } from 'zod';
const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2];
if(mode==='--initialize')console.log(await initializeEnv(root)?'Archivo .env creado con secretos propios; falta completar los datos de Oracle.':'El archivo .env ya existe y se conserva.');
else if(mode==='--status'){
  try{const env=dotenv.parse(await readFile(new URL('../.env',import.meta.url),'utf8'));if(env.DATA_PROVIDER!=='oracle'||(env.JWT_SECRET||'').length<32||(env.SETUP_TOKEN||'').length<32)throw new Error('Configuration incomplete');oracleSettings(env);process.exitCode=0;}catch{process.exitCode=1;}
}else{
  const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
  const input=z.record(z.string()).parse(JSON.parse(Buffer.from(Buffer.concat(chunks).toString().trim(),'base64').toString('utf8')));
  await saveOracleEnv(root,input);console.log('Conexión guardada localmente en .env. Las contraseñas no se muestran.');
}
