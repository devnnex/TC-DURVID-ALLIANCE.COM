import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {executeSql} from './ords-sql.js';

const files=['customer_crm.sql','orders.sql','operations_commands.sql','operations_sales.sql'];
const normalize=(s:string)=>s.replace(/\r/g,'').trim(),hash=(s:string)=>createHash('sha256').update(normalize(s)).digest('hex');
const apply=process.argv.includes('--apply'),reviewPath='.tools/crm-deploy-review.json';
mkdirSync('.tools',{recursive:true});
const review:Record<string,{before:string;after:string}>=apply?JSON.parse(readFileSync(reviewPath,'utf8')):{};
const changes:Array<{name:string;kind:string;source:string;previous:string}>=[];
for(const file of files){
  const statements=readFileSync('database/ords/'+file,'utf8').split(/^\/\s*$/m).map(s=>s.trim()).filter(Boolean);
  for(const source of statements){
    const match=source.match(/^CREATE OR REPLACE PACKAGE (BODY )?(\w+)/i);if(!match)throw Error('Unexpected SQL statement');
    if(file!=='customer_crm.sql'&&!match[1])continue;
    const name=match[2].toUpperCase(),kind=match[1]?'PACKAGE BODY':'PACKAGE',key=name+':'+kind;
    const rows=await executeSql(`SELECT text FROM user_source WHERE name='${name}' AND type='${kind}' ORDER BY line`);
    const text=rows.flatMap((r:any)=>r.resultSet?.items||[]).map((r:any)=>r.text).join(''),previous=text?'CREATE OR REPLACE '+text:'';
    if(apply&&(!review[key]||review[key].before!==hash(previous)||review[key].after!==hash(source)))throw Error('SQL changed after review: '+key);
    if(!apply){review[key]={before:hash(previous),after:hash(source)};if(previous)writeFileSync('.tools/crm-before-'+name+'-'+kind.replace(' ','-')+'.sql',previous);}
    changes.push({name,kind,source,previous});
  }
}
if(!apply){writeFileSync(reviewPath,JSON.stringify(review,null,2));console.log('CRM deployment prepared: reviewed package versions saved. Run with --apply to install.');}
else{
  try{
    for(const change of changes)await executeSql(change.source);
    const errors=(await executeSql("SELECT name,line,position,text FROM user_errors WHERE name IN('ALLIANCE_CUSTOMER_CRM','ALLIANCE_ORDERS','ALLIANCE_OPERATIONS_COMMANDS','ALLIANCE_OPERATIONS_SALES') ORDER BY name,sequence")).flatMap((r:any)=>r.resultSet?.items||[]);
    if(errors.length)throw Error(JSON.stringify(errors));
    console.log('CRM packages installed without compilation errors. Customer records were not modified.');
  }catch(error){
    for(const change of changes.filter(c=>c.name!=='ALLIANCE_CUSTOMER_CRM'&&c.previous))await executeSql(change.previous);
    for(const change of changes.filter(c=>c.name==='ALLIANCE_CUSTOMER_CRM'&&c.previous))await executeSql(change.previous);
    if(changes.some(c=>c.name==='ALLIANCE_CUSTOMER_CRM'&&!c.previous))await executeSql('DROP PACKAGE alliance_customer_crm');
    throw error;
  }
}
