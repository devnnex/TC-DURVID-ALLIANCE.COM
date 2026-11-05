import {writeFile,mkdir} from 'node:fs/promises';
import {executeSql} from './ords-sql.js';
const rows=(result:any)=>result.flatMap((r:any)=>r.resultSet?.items||[]),literal=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const scopes=rows(await executeSql(`SELECT l.business_id,l.id location_id,MIN(r.user_id) actor FROM locations l JOIN user_location_roles r ON r.business_id=l.business_id AND r.location_id=l.id AND r.role_code='OWNER' WHERE l.slug='gcobarf' AND l.active=1 GROUP BY l.business_id,l.id`));
for(const scope of scopes){
  const b=literal(scope.business_id),l=literal(scope.location_id);
  const before=rows(await executeSql(`SELECT entity,id,data_json FROM alliance_pos_documents WHERE business_id=${b} AND location_id=${l} AND entity IN('table_sessions','session_items','op_deliveryholds')`));
  const stock=rows(await executeSql(`SELECT product_id,stock FROM alliance_pos_stock WHERE business_id=${b} AND location_id=${l}`));
  console.log(JSON.stringify({location:scope.location_id,apply:process.argv.includes('--apply'),openDeliveries:before.filter((d:any)=>d.entity==='table_sessions'&&JSON.parse(d.data_json).status==='open'&&JSON.parse(d.data_json).delivery_date).length},null,2));
  if(!process.argv.includes('--apply'))continue;
  await mkdir('.tools',{recursive:true});await writeFile('.tools/gcobarf-reservations-before-'+scope.location_id+'.json',JSON.stringify({before,stock},null,2));
  await executeSql(`BEGIN alliance_pos_store.lock_scope(${b},${l});alliance_production.reconcile(${literal(scope.actor)},${b},${l});COMMIT;EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;END;`);
  console.log(JSON.stringify({stockAfter:rows(await executeSql(`SELECT product_id,stock FROM alliance_pos_stock WHERE business_id=${b} AND location_id=${l}`))},null,2));
}
