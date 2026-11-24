import {randomUUID} from 'node:crypto';
import {executeSql} from './ords-sql.js';
import {literal,cycle} from './stock-notification-worker.js';
import '../operational/stock-alerts-engine.js';

const rows=async(sql:string)=>(await executeSql(sql)).flatMap(x=>x.resultSet?.items||[]) as any[];
const E=(globalThis as any).AllianceStockAlerts;
const scopes=await rows('SELECT id,business_id,slug FROM locations WHERE active=1');
for(const scope of scopes){
 const b=literal(scope.business_id),l=literal(scope.id);
 const result=await rows(`SELECT alliance_stock_notifications.scan_snapshot(${b},${l}) payload FROM dual`);
 const raw=result[0]?.payload,snapshot=typeof raw==='string'?JSON.parse(raw):raw;
 if(!snapshot?._alertRevision||!Array.isArray(snapshot?.model?.ingredients))throw Error('Snapshot incompleto.');
 const alerts=E.analyse(snapshot);
 // Publish only real stock alerts. No inventory, sales or users are changed.
 const payload=JSON.stringify(alerts).replace(/'/g,"''");
 await executeSql(`BEGIN alliance_stock_notifications.sync_scope(${b},${l},TO_CLOB('${payload}'),${literal(snapshot._alertRevision)});COMMIT;END;`);
 const invalid=await rows(`SELECT alliance_stock_notifications.boss_allowed('invalid-user',${b},${l}) allowed FROM dual`);
 if(invalid[0]?.allowed!==0)throw Error('Se permitió un destinatario inexistente.');
 console.log(JSON.stringify({branch:scope.slug,ingredients:snapshot.model.ingredients.length,products:snapshot.docs.menu_items.length,alerts:alerts.length}));
}
// Isolated delivery metadata proves the SQL lease can run through ORDS SELECT.
const id='selfcheck-'+randomUUID(),claim=()=>rows(`SELECT alliance_stock_notifications.claim_delivery(${literal(id)},'selfcheck') claimed FROM dual`);
try{
 if((await claim())[0]?.claimed!==1||(await claim())[0]?.claimed!==0)throw Error('La reserva duplicó una entrega.');
 await executeSql(`BEGIN UPDATE alliance_push_deliveries SET lease_until=SYSTIMESTAMP-INTERVAL '1' MINUTE WHERE id=${literal(id)};COMMIT;END;`);
 if((await claim())[0]?.claimed!==1)throw Error('La reserva vencida no se recuperó.');
 await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='sent',lease_until=SYSTIMESTAMP-INTERVAL '1' MINUTE WHERE id=${literal(id)};COMMIT;END;`);
 if((await claim())[0]?.claimed!==0)throw Error('Se repitió una entrega confirmada.');
}finally{await executeSql(`BEGIN DELETE FROM alliance_push_deliveries WHERE id=${literal(id)};COMMIT;END;`);}
const errors=await rows("SELECT name,line,text FROM user_errors WHERE name LIKE 'ALLIANCE_%'");
if(errors.length)throw Error(JSON.stringify(errors));
console.log(JSON.stringify({compilationErrors:0,leaseChecks:4,sender:await cycle()}));
