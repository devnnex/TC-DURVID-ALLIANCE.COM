import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {executeSql} from './ords-sql.js';

// Only package bodies change. Preserve their signatures, other branches and all data.
const files=['pos_store.sql','gcobarf_orders.sql'];
const bodies=new Map<string,string>(),backups=new Map<string,string>();
const normalize=(value:string)=>value.replace(/\r/g,'').trim();
const body=(value:string)=>value.split(/^\/\s*$/m).find(part=>part.trim().startsWith('CREATE OR REPLACE PACKAGE BODY'))!.trim();
const git=process.platform==='win32'?'.tools/git/cmd/git.exe':'git';
for(const file of files){
  const next=body(readFileSync('database/ords/'+file,'utf8')),name=next.match(/PACKAGE BODY (\w+)/i)![1].toUpperCase();
  const current='CREATE OR REPLACE '+(await executeSql("SELECT text FROM user_source WHERE name='"+name+"' AND type='PACKAGE BODY' ORDER BY line")).flatMap((row:any)=>row.resultSet?.items||[]).map((row:any)=>row.text).join('');
  const baseline=body(execFileSync(git,['show','HEAD:database/ords/'+file],{encoding:'utf8'}));
  if(normalize(current)!==normalize(baseline)&&normalize(current)!==normalize(next))throw Error(file+': el paquete publicado cambió. Revisa sus diferencias.');
  bodies.set(file,next);backups.set(file,current);
}
console.log('Reglas de entrega verificadas con los paquetes publicados.');
if(process.argv.includes('--apply')){
  mkdirSync('.tools',{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(const [file,value] of backups)writeFileSync('.tools/before-delivery-rules-'+stamp+'-'+file,value);
  try{
    for(const [file,value] of bodies){
      await executeSql(value);
      const name=value.match(/PACKAGE BODY (\w+)/i)![1].toUpperCase();
      const errors=(await executeSql("SELECT name,line,position,text FROM user_errors WHERE name='"+name+"' ORDER BY sequence")).flatMap((row:any)=>row.resultSet?.items||[]);
      if(errors.length)throw Error(JSON.stringify(errors));console.log(file+' compilado.');
    }
    console.log('Reglas de dirección y fechas desplegadas sin errores.');
  }catch(error){for(const value of backups.values())await executeSql(value);console.log('Se restauraron ambos paquetes anteriores.');throw error;}
}
