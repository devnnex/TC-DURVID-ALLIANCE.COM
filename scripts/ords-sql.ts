import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
dotenv.config({quiet:true} as dotenv.DotenvConfigOptions);
const root=new URL('../',import.meta.url);
export const ordsRoot='https://gbd1bb1fefc484d-jolivia.adb.sa-bogota-1.oraclecloudapps.com/ords/admin/';
export async function executeSql(sql:string){
  const user=process.env.ORACLE_USER||'ADMIN';
  const password=process.env.ORACLE_PASSWORD||Buffer.from(process.env.ORACLE_PASSWORD_BASE64||'','base64').toString('utf8');
  if(!password)throw new Error('Falta la contraseña en .env privado.');
  const response=await fetch(ordsRoot+'_/sql',{method:'POST',headers:{'Content-Type':'application/sql',Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')},body:sql,signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Oracle HTTPS respondió ${response.status}. No se modificó la configuración del navegador.`);
  const data=await response.json() as {items?:Array<{errorDetails?:string;resultSet?:{items:unknown[]};response?:unknown[]}>};
  const errors=data.items?.filter(item=>item.errorDetails);
  if(errors?.length)throw new Error(errors.map(item=>item.errorDetails).join('\n'));
  return data.items||[];
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/ords-sql.ts')){
  const file=process.argv[2];
  if(!file)throw new Error('Indica un archivo SQL del proyecto. Las credenciales nunca son argumentos.');
  const items=await executeSql(await readFile(new URL(file,root),'utf8'));
  console.log(JSON.stringify(items.map(item=>({rows:item.resultSet?.items,response:item.response})),null,2));
}
