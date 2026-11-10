import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {executeSql} from './ords-sql.js';

// Deploy only the new public package and the single API routing change.
// Existing operational packages and branch data are left in place.
const sql=readFileSync('database/ords/gcobarf_orders.sql','utf8');
const api=readFileSync('database/ords/api.sql','utf8').split(/^\/\s*$/m).find(text=>text.trim().startsWith('CREATE OR REPLACE PACKAGE BODY'))!.trim();
const deployed=(await executeSql("SELECT text FROM user_source WHERE name='ALLIANCE_API' AND type='PACKAGE BODY' ORDER BY line")).flatMap((row:any)=>row.resultSet?.items||[]).map((row:any)=>row.text).join('');
const previous='CREATE OR REPLACE '+deployed;
const baseline=api.replace("    ELSIF method_value='POST' AND path_value='/gcobarf/public' THEN data:=alliance_gcobarf_orders.dispatch(body);\n",'');
const normalize=(text:string)=>text.replace(/\r/g,'').trim();
if(normalize(previous)!==normalize(baseline)&&normalize(previous)!==normalize(api))throw new Error('La API publicada cambió. Revisa sus diferencias antes de desplegar.');
console.log('API verificada. El despliegue agrega únicamente pedidos públicos de GCOBARF.');
if(process.argv.includes('--apply')){
  const git=process.platform==='win32'?'.tools/git/cmd/git.exe':'git';
  const revision=execFileSync(git,['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();
  writeFileSync('.tools/before-online-orders-api-'+revision+'.sql',previous);
  try{
    for(const statement of sql.split(/^\/\s*$/m).filter(text=>text.trim()))await executeSql(statement.trim());
    const errors=async()=>(await executeSql("SELECT name,line,position,text FROM user_errors WHERE name IN('ALLIANCE_GCOBARF_ORDERS','ALLIANCE_API') ORDER BY name,sequence")).flatMap((row:any)=>row.resultSet?.items||[]);
    let found=await errors();if(found.length)throw new Error(JSON.stringify(found));
    await executeSql(api);found=await errors();if(found.length)throw new Error(JSON.stringify(found));
    console.log('Pedidos públicos de GCOBARF desplegados. Sin errores de compilación.');
  }catch(error){await executeSql(previous);throw error;}
}
