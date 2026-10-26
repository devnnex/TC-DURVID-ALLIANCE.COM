import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { executeSql } from './ords-sql.js';
const files=['008_ords_schema.sql','009_operational_schema.sql','010_activity_schema.sql','011_operations_schema.sql','012_offline_review_schema.sql','013_fast_auth_schema.sql','014_team_roles.sql','015_flexible_usernames.sql','security.sql','auth_proof.sql','activity.sql','ingredient_yield.sql','materials_spec.sql','pos_store.sql','operations.sql','orders.sql','customer_schedule.sql','operations_commands.sql','operations_sales.sql','customer_payments.sql','pos_sales.sql','jespresso.sql','costing.sql','materials.sql','pos_api.sql','pos_batch.sql','administration.sql','catalog.sql','api.sql','publish.sql'];
const root=new URL('../database/ords/',import.meta.url);
const pieces:string[]=[],publishPieces:string[]=[];
for(const name of files){
  const sql=await readFile(new URL(name,root),'utf8');
  for(const statement of sql.split(/^\/\s*$/m).filter(s=>s.trim())){
    if(Buffer.byteLength(statement)>32700||statement.includes("!'"))throw new Error('Revisa el tamaño o delimitador del bloque '+name);
    (name==='publish.sql'?publishPieces:pieces).push(`  EXECUTE IMMEDIATE q'!${statement.trim()}!';`);
  }
}
const source=`-- API ORDS: copiar TODO y pulsar el boton verde una sola vez.\n-- Conserva las tablas y datos de 001-007. Reejecutable para actualizar la API.\nDECLARE\n  invalid_count NUMBER;\nBEGIN\n${pieces.join('\n')}\n  SELECT COUNT(*) INTO invalid_count FROM user_errors WHERE name LIKE 'ALLIANCE_%';\n  IF invalid_count>0 THEN RAISE_APPLICATION_ERROR(-20002,'Hay errores de compilacion: consultar USER_ERRORS para ALLIANCE_%');END IF;\n${publishPieces.join('\n')}\n  COMMIT;\nEXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;\nEND;\n`;
await writeFile(new URL('install.sql',root),source);
if(process.argv.includes('--apply')){
  // Compile first; publish only after every package is valid.
  for(const name of files.filter(n=>n!=='publish.sql')){
    console.log('Compilando '+name);
    const sql=await readFile(new URL(name,root),'utf8');
    for(const statement of sql.split(/^\/\s*$/m).filter(s=>s.trim())){
      await executeSql(statement.trim());
    }
  }
  const checks=await executeSql("SELECT name,line,position,text FROM user_errors WHERE name LIKE 'ALLIANCE_%' ORDER BY name,sequence");
  const errors=checks.flatMap(x=>x.resultSet?.items||[]);if(errors.length)throw new Error(JSON.stringify(errors));
  const token=process.env.SETUP_TOKEN||'';if(token.length<32)throw new Error('Falta SETUP_TOKEN privado de 32+ caracteres.');
  const hash=createHash('sha256').update(token).digest('hex');
  await executeSql(`BEGIN MERGE INTO alliance_api_settings t USING(SELECT 1 id FROM dual) s ON(t.id=s.id) WHEN NOT MATCHED THEN INSERT(id,setup_hash) VALUES(1,'${hash}');COMMIT;END;`);
  await executeSql(await readFile(new URL('publish.sql',root),'utf8'));
  console.log('API ORDS instalada y publicada. No se crearon negocios ni usuarios.');
}else console.log('database/ords/install.sql generado. Para instalar desde esta estación: npm run ords:install.');
