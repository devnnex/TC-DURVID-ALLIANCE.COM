/* Run continuously on the private server, or --once from an unattended runner. */
import * as webpush from 'web-push';
import {createHash,createECDH} from 'node:crypto';
import {executeSql} from './ords-sql.js';
import '../operational/stock-alerts-engine.js';

type Alert={id:string;name:string;level:'out'|'low';[key:string]:unknown};
const E=(globalThis as any).AllianceStockAlerts;
export const createWorkerState=()=>({scans:new Map<string,{version?:number;at:number;deliveryAt:number;slot:string}>(),delivered:new Set<string>(),maintenanceAt:undefined as number|undefined});
export async function deliverLimited<T>(jobs:T[],deliver:(job:T)=>Promise<void>,failure:(job:T)=>void){let next=0;await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];try{await deliver(job);}catch{failure(job);}}}));}
export const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
function clob(value:string){const chunks:string[]=[];let part='';for(const ch of value){if(Buffer.byteLength(part+ch)>12000){chunks.push('TO_CLOB('+literal(part)+')');part='';}part+=ch;}chunks.push('TO_CLOB('+literal(part)+')');return chunks.join('||');}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function rows(sql:string):Promise<any[]>{return (await executeSql(sql)).flatMap(r=>r.resultSet?.items||[]);}
function decode(row:any){const value=row.payload??row.PAYLOAD??Object.values(row)[0];return typeof value==='string'?JSON.parse(value):value;}
const shorten=(text:string,max:number)=>{let out='';for(const ch of text){if(Buffer.byteLength(out+ch)>max)return out+'…';out+=ch;}return out;};
const retrySeconds=(error:any)=>Math.min(3600,Math.max(30,Number(error?.headers?.['retry-after'])||30));
export function deliveryId(alert:{businessId:string;locationId:string;id:string;generation:number;openedAt:string},subscriptionId:string,now=new Date()){
 return hash(JSON.stringify([alert.businessId,alert.locationId,alert.id,alert.generation,subscriptionId,E.slot(alert.openedAt,now)]));
}
export async function cycle(now=new Date(),state=createWorkerState()){
 const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
 if(!publicKey||!privateKey||!subject||!/^mailto:|^https:\/\//.test(subject))throw Error('Configura las claves VAPID y VAPID_SUBJECT en el servidor privado.');
 const pair=createECDH('prime256v1');pair.setPrivateKey(Buffer.from(privateKey,'base64url'));if(pair.getPublicKey().toString('base64url')!==publicKey)throw Error('Las claves VAPID no corresponden al mismo par.');
 webpush.setVapidDetails(subject,publicKey,privateKey);
 if(state.maintenanceAt===undefined||now.getTime()-state.maintenanceAt>=3600000){await executeSql("BEGIN DELETE FROM alliance_notice_events WHERE created_at<SYSTIMESTAMP-INTERVAL '30' DAY;DELETE FROM alliance_notice_scopes d WHERE NOT EXISTS(SELECT 1 FROM locations l WHERE l.business_id=d.business_id AND l.id=d.location_id);COMMIT;END;");state.maintenanceAt=now.getTime();}
 const config=await rows('SELECT public_key,enabled FROM alliance_push_config WHERE id=1');
 if(config[0]?.enabled!==1||config[0]?.public_key!==publicKey)throw Error('La clave pública o la activación de Oracle no coincide con el remitente.');
 const scopes=await rows(`SELECT l.business_id,l.id location_id,l.slug FROM locations l WHERE l.active=1 AND EXISTS(SELECT 1 FROM alliance_push_subscriptions s WHERE s.business_id=l.business_id AND s.location_id=l.id AND s.active=1)`);
 let sent=0,failed=0;
 const dirty=await rows('SELECT business_id,location_id,version FROM alliance_notice_scopes WHERE version>processed_version');
 const scopeKey=(row:any)=>JSON.stringify([row.business_id,row.location_id]),versions=new Map(dirty.map(row=>[scopeKey(row),Number(row.version)])),failedScopes=new Set<string>();
 const activeScopes=new Set(scopes.map(scopeKey));for(const key of state.scans.keys())if(!activeScopes.has(key))state.scans.delete(key);
 const remember=(id:string)=>{if(state.delivered.size>=10000)state.delivered.clear();state.delivered.add(id);};
 // Login events have their own immutable identity; they are never repeated at reminder times.
 const events=await rows(`SELECT e.id,e.business_id,e.location_id,e.payload,l.slug,s.id subscription_id,s.user_id,s.endpoint,s.p256dh,s.auth_key,JSON_VALUE(v.data_json,'$.business_name') business_name,JSON_VALUE(v.data_json,'$.logo_url' RETURNING VARCHAR2(2048) NULL ON ERROR) logo FROM alliance_notice_events e JOIN locations l ON l.business_id=e.business_id AND l.id=e.location_id AND l.active=1 JOIN alliance_push_subscriptions s ON s.business_id=e.business_id AND s.location_id=e.location_id AND s.active=1 LEFT JOIN alliance_pos_documents v ON v.business_id=e.business_id AND v.location_id=e.location_id AND v.entity='business_settings' AND v.id='primary' WHERE e.created_at>SYSTIMESTAMP-INTERVAL '30' MINUTE AND l.slug IN('cafeteria','cocteleria') AND NOT EXISTS(SELECT 1 FROM alliance_push_deliveries d WHERE d.id=LOWER(RAWTOHEX(STANDARD_HASH('event:'||e.id||':'||s.id,'SHA256'))) AND (d.status='sent' OR d.lease_until>SYSTIMESTAMP)) ORDER BY e.created_at,e.id,s.id FETCH FIRST 200 ROWS ONLY`);
 await deliverLimited(events,async event=>{
  const b=literal(event.business_id),l=literal(event.location_id),identifier=hash('event:'+event.id+':'+event.subscription_id);
  if(state.delivered.has(identifier))return;
  const valid=await rows(`SELECT alliance_stock_notifications.boss_allowed(${literal(event.user_id)},${b},${l}) allowed FROM dual`);if(valid[0]?.allowed!==1)return;
  const claimed=await rows(`SELECT alliance_stock_notifications.claim_delivery(${literal(identifier)},${literal(event.subscription_id)}) claimed FROM dual`);if(claimed[0]?.claimed!==1)return;
  try{const entry=decode(event),time=new Date(entry.at).toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'}),payload={type:'staff-login',id:hash(event.business_id+':'+event.location_id+':'+event.id),branch:event.slug,title:shorten((event.business_name||event.slug)+' · Tu equipo',400),body:shorten(entry.body+' '+time,1600),logo:typeof event.logo==='string'&&/^https:\/\//.test(event.logo)&&event.logo.length<800?event.logo:undefined};
   const result=await webpush.sendNotification({endpoint:event.endpoint,keys:{p256dh:event.p256dh,auth:event.auth_key}},JSON.stringify(payload),{TTL:900,urgency:'high',topic:identifier.slice(0,32),timeout:8000});if(result.statusCode<200||result.statusCode>=300)throw Error('Entrega no confirmada.');
   await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='sent',updated_at=SYSTIMESTAMP WHERE id=${literal(identifier)};COMMIT;END;`);remember(identifier);sent++;
  }catch(error){failed++;failedScopes.add(scopeKey(event));const status=(error as {statusCode?:number}).statusCode;await executeSql(`BEGIN ${status===404||status===410?`UPDATE alliance_push_subscriptions SET active=0 WHERE id=${literal(event.subscription_id)};`:''} UPDATE alliance_push_deliveries SET status='retry',lease_until=SYSTIMESTAMP+NUMTODSINTERVAL(${retrySeconds(error)},'SECOND'),updated_at=SYSTIMESTAMP WHERE id=${literal(identifier)};COMMIT;END;`);}
 },event=>{failed++;failedScopes.add(scopeKey(event));});
 for(const scope of scopes){
  const key=scopeKey(scope),version=versions.get(key),previous=state.scans.get(key),stamp=now.getTime(),slot=E.slot('1970-01-01T00:00:00Z',now),needsScan=!previous||stamp-previous.at>=60000||version!==undefined&&version!==previous.version;
  if(!needsScan&&stamp-previous.deliveryAt<30000&&slot===previous.slot)continue;
  const failuresBefore=failed;
  try{
  const b=literal(scope.business_id),l=literal(scope.location_id);
  // A valid boss is checked again on every cycle, including ownership and revocation.
  const actors=await rows(`SELECT id FROM users u WHERE u.business_id=${b} AND u.active=1 AND u.deleted_at IS NULL AND alliance_stock_notifications.boss_allowed(u.id,${b},${l})=1 FETCH FIRST 1 ROW ONLY`);
  if(!actors.length)continue;
  if(needsScan){const data=await rows(`SELECT alliance_stock_notifications.scan_snapshot(${b},${l}) payload FROM dual`);
  const snapshot=decode(data[0]);if(!snapshot?.model?.ingredients||!snapshot?.docs?.menu_items)throw Error('La consulta de insumos devolvió un respaldo incompleto.');
  const alerts:Alert[]=E.analyse(snapshot);
  try{await executeSql(`BEGIN alliance_stock_notifications.sync_scope(${b},${l},${clob(JSON.stringify(alerts))},${literal(snapshot._alertRevision)});COMMIT;END;`);}catch(error){if(String((error as Error).message).includes('STOCK_CHANGED')){state.scans.delete(key);continue;}throw error;}}
  const jobs=await rows(`SELECT a.id,a.generation,TO_CHAR(a.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') opened_at,a.payload,s.id subscription_id,s.user_id,s.endpoint,s.p256dh,s.auth_key,JSON_VALUE(v.data_json,'$.business_name') business_name,JSON_VALUE(v.data_json,'$.logo_url' RETURNING VARCHAR2(2048) NULL ON ERROR) logo FROM alliance_stock_alerts a JOIN alliance_push_subscriptions s ON s.business_id=a.business_id AND s.location_id=a.location_id AND s.active=1 LEFT JOIN alliance_pos_documents v ON v.business_id=a.business_id AND v.location_id=a.location_id AND v.entity='business_settings' AND v.id='primary' WHERE a.business_id=${b} AND a.location_id=${l} AND a.active=1 ORDER BY a.id,s.id`);
  const pending=jobs.map(job=>({...job,deliveryId:deliveryId({businessId:scope.business_id,locationId:scope.location_id,id:job.id,generation:job.generation,openedAt:job.opened_at},job.subscription_id,now)})).filter(job=>!state.delivered.has(job.deliveryId)),blocked=new Set<string>();
  // Indexed batches avoid one authorization/claim request per already completed device after a restart.
  for(let offset=0;offset<pending.length;offset+=500){const completed=await rows(`SELECT id,status FROM alliance_push_deliveries WHERE id IN(${pending.slice(offset,offset+500).map(job=>literal(job.deliveryId)).join(',')}) AND (status='sent' OR lease_until>SYSTIMESTAMP)`);for(const row of completed){blocked.add(row.id);if(row.status==='sent')remember(row.id);}}
  const deliver=async(job:any)=>{
   const id=deliveryId({businessId:scope.business_id,locationId:scope.location_id,id:job.id,generation:job.generation,openedAt:job.opened_at},job.subscription_id,now);
   if(state.delivered.has(id))return;
   const valid=await rows(`SELECT alliance_stock_notifications.boss_allowed(${literal(job.user_id)},${b},${l}) allowed FROM dual`);
   if(valid[0]?.allowed!==1)return;
   const claim=await rows(`SELECT alliance_stock_notifications.claim_delivery(${literal(id)},${literal(job.subscription_id)}) claimed FROM dual`);
   if(claim[0]?.claimed!==1)return;
   try {
    const fresh=await rows(`SELECT a.payload FROM alliance_stock_alerts a JOIN alliance_push_subscriptions s ON s.business_id=a.business_id AND s.location_id=a.location_id AND s.id=${literal(job.subscription_id)} AND s.active=1 WHERE a.business_id=${b} AND a.location_id=${l} AND a.id=${literal(job.id)} AND a.generation=${Number(job.generation)} AND a.active=1 AND a.stock_revision=alliance_pos_store.report_revision(a.business_id,a.location_id) AND alliance_stock_notifications.boss_allowed(s.user_id,a.business_id,a.location_id)=1`);
    if(!fresh.length){await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='retry',lease_until=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);failedScopes.add(key);return;}
    const alert=decode(fresh[0]);
    const payload={type:'stock-alert',id:hash(scope.business_id+':'+scope.location_id+':'+job.id),branch:scope.slug,title:shorten((job.business_name||scope.slug)+' · '+alert.name,400),body:shorten(E.message(alert),1600),logo:typeof job.logo==='string'&&/^https:\/\//.test(job.logo)&&job.logo.length<800?job.logo:undefined};
    const result=await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth_key}},JSON.stringify(payload),{TTL:900,urgency:'high',topic:hash(id).slice(0,32),timeout:8000});
    if(result.statusCode<200||result.statusCode>=300)throw Error('Entrega no confirmada.');
    await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='sent',updated_at=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);remember(id);sent++;
   } catch(error){
    failed++;const status=(error as {statusCode?:number}).statusCode;
    await executeSql(`BEGIN ${status===404||status===410?`UPDATE alliance_push_subscriptions SET active=0 WHERE id=${literal(job.subscription_id)};`:''} UPDATE alliance_push_deliveries SET status='retry',lease_until=SYSTIMESTAMP+NUMTODSINTERVAL(${retrySeconds(error)},'SECOND'),updated_at=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);
   }
  };
  await deliverLimited(pending.filter(job=>!blocked.has(job.deliveryId)),deliver,()=>{failed++;});
  if(failed>failuresBefore)failedScopes.add(key);
  if(!failedScopes.has(key)){state.scans.set(key,{version:version??previous?.version,at:needsScan?stamp:previous!.at,deliveryAt:stamp,slot});if(version!==undefined)await executeSql(`BEGIN UPDATE alliance_notice_scopes SET processed_version=GREATEST(processed_version,${version}) WHERE business_id=${b} AND location_id=${l};COMMIT;END;`);}else state.scans.delete(key);
  }catch{failed++;failedScopes.add(key);state.scans.delete(key);}
 }
 return {sent,failed};
}
async function main(){
 let stopped=false,runs=0,errors=0;const burst=process.argv.includes('--burst'),state=createWorkerState();process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
 do{try{const result=await cycle(new Date(),state);errors=0;console.log(JSON.stringify({at:new Date().toISOString(),...result}));}catch(error){errors=Math.min(errors+1,4);console.error('No se pudo ejecutar el envío: '+(error instanceof Error?error.message:'Error del servicio'));if(process.argv.includes('--once'))process.exitCode=1;}
  runs++;if(stopped||(burst?runs>=8:process.argv.includes('--once')))break;await new Promise(r=>setTimeout(r,Math.min(60000,5000*2**errors)));
 }while(!stopped);
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/stock-notification-worker.ts'))void main();
