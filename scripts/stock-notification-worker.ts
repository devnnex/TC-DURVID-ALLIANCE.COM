/* Run continuously on the private server, or --once from an unattended runner. */
import * as webpush from 'web-push';
import {createHash,createECDH} from 'node:crypto';
import {executeSql} from './ords-sql.js';
import '../operational/stock-alerts-engine.js';

type Alert={id:string;name:string;level:'out'|'low';[key:string]:unknown};
const E=(globalThis as any).AllianceStockAlerts;
export const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
function clob(value:string){const chunks:string[]=[];let part='';for(const ch of value){if(Buffer.byteLength(part+ch)>12000){chunks.push('TO_CLOB('+literal(part)+')');part='';}part+=ch;}chunks.push('TO_CLOB('+literal(part)+')');return chunks.join('||');}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function rows(sql:string):Promise<any[]>{return (await executeSql(sql)).flatMap(r=>r.resultSet?.items||[]);}
function decode(row:any){const value=row.payload??row.PAYLOAD??Object.values(row)[0];return typeof value==='string'?JSON.parse(value):value;}
const shorten=(text:string,max:number)=>{let out='';for(const ch of text){if(Buffer.byteLength(out+ch)>max)return out+'…';out+=ch;}return out;};
export function deliveryId(alert:{businessId:string;locationId:string;id:string;generation:number;openedAt:string},subscriptionId:string,now=new Date()){
 return hash(JSON.stringify([alert.businessId,alert.locationId,alert.id,alert.generation,subscriptionId,E.slot(alert.openedAt,now)]));
}
export async function cycle(now=new Date()){
 const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
 if(!publicKey||!privateKey||!subject||!/^mailto:|^https:\/\//.test(subject))throw Error('Configura las claves VAPID y VAPID_SUBJECT en el servidor privado.');
 const pair=createECDH('prime256v1');pair.setPrivateKey(Buffer.from(privateKey,'base64url'));if(pair.getPublicKey().toString('base64url')!==publicKey)throw Error('Las claves VAPID no corresponden al mismo par.');
 webpush.setVapidDetails(subject,publicKey,privateKey);
 const config=await rows('SELECT public_key,enabled FROM alliance_push_config WHERE id=1');
 if(config[0]?.enabled!==1||config[0]?.public_key!==publicKey)throw Error('La clave pública o la activación de Oracle no coincide con el remitente.');
 const scopes=await rows(`SELECT l.business_id,l.id location_id,l.slug FROM locations l WHERE l.active=1 AND EXISTS(SELECT 1 FROM alliance_push_subscriptions s WHERE s.business_id=l.business_id AND s.location_id=l.id AND s.active=1)`);
 let sent=0,failed=0;
 for(const scope of scopes){
  const b=literal(scope.business_id),l=literal(scope.location_id);
  // A valid boss is checked again on every cycle, including ownership and revocation.
  const actors=await rows(`SELECT id FROM users u WHERE u.business_id=${b} AND u.active=1 AND u.deleted_at IS NULL AND alliance_stock_notifications.boss_allowed(u.id,${b},${l})=1 FETCH FIRST 1 ROW ONLY`);
  if(!actors.length)continue;
  const data=await rows(`SELECT alliance_stock_notifications.scan_snapshot(${b},${l}) payload FROM dual`);
  const snapshot=decode(data[0]);if(!snapshot?.model?.ingredients||!snapshot?.docs?.menu_items)throw Error('La consulta de insumos devolvió un respaldo incompleto.');
  const alerts:Alert[]=E.analyse(snapshot);
  try{await executeSql(`BEGIN alliance_stock_notifications.sync_scope(${b},${l},${clob(JSON.stringify(alerts))},${literal(snapshot._alertRevision)});COMMIT;END;`);}catch(error){if(String((error as Error).message).includes('STOCK_CHANGED'))continue;throw error;}
  const jobs=await rows(`SELECT a.id,a.generation,TO_CHAR(a.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') opened_at,a.payload,s.id subscription_id,s.user_id,s.endpoint,s.p256dh,s.auth_key,JSON_VALUE(v.data_json,'$.business_name') business_name,JSON_VALUE(v.data_json,'$.logo_url' RETURNING VARCHAR2(2048) NULL ON ERROR) logo FROM alliance_stock_alerts a JOIN alliance_push_subscriptions s ON s.business_id=a.business_id AND s.location_id=a.location_id AND s.active=1 LEFT JOIN alliance_pos_documents v ON v.business_id=a.business_id AND v.location_id=a.location_id AND v.entity='business_settings' AND v.id='primary' WHERE a.business_id=${b} AND a.location_id=${l} AND a.active=1 ORDER BY a.id,s.id`);
  const deliver=async(job:any)=>{
   const id=deliveryId({businessId:scope.business_id,locationId:scope.location_id,id:job.id,generation:job.generation,openedAt:job.opened_at},job.subscription_id,now);
   const valid=await rows(`SELECT alliance_stock_notifications.boss_allowed(${literal(job.user_id)},${b},${l}) allowed FROM dual`);
   if(valid[0]?.allowed!==1)return;
   const claim=await rows(`SELECT alliance_stock_notifications.claim_delivery(${literal(id)},${literal(job.subscription_id)}) claimed FROM dual`);
   if(claim[0]?.claimed!==1)return;
   try {
    const fresh=await rows(`SELECT a.payload FROM alliance_stock_alerts a JOIN alliance_push_subscriptions s ON s.business_id=a.business_id AND s.location_id=a.location_id AND s.id=${literal(job.subscription_id)} AND s.active=1 WHERE a.business_id=${b} AND a.location_id=${l} AND a.id=${literal(job.id)} AND a.generation=${Number(job.generation)} AND a.active=1 AND a.stock_revision=alliance_pos_store.report_revision(a.business_id,a.location_id) AND alliance_stock_notifications.boss_allowed(s.user_id,a.business_id,a.location_id)=1`);
    if(!fresh.length){await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='retry',lease_until=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);return;}
    const alert=decode(fresh[0]);
    const payload={type:'stock-alert',id:hash(scope.business_id+':'+scope.location_id+':'+job.id),branch:scope.slug,title:shorten((job.business_name||scope.slug)+' · '+alert.name,400),body:shorten(E.message(alert),1600),logo:typeof job.logo==='string'&&/^https:\/\//.test(job.logo)&&job.logo.length<800?job.logo:undefined};
    const result=await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth_key}},JSON.stringify(payload),{TTL:900,urgency:alert.level==='out'?'high':'normal',topic:hash(id).slice(0,32),timeout:15000});
    if(result.statusCode<200||result.statusCode>=300)throw Error('Entrega no confirmada.');
    await executeSql(`BEGIN UPDATE alliance_push_deliveries SET status='sent',updated_at=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);sent++;
   } catch(error){
    failed++;const status=(error as {statusCode?:number}).statusCode;
    await executeSql(`BEGIN ${status===404||status===410?`UPDATE alliance_push_subscriptions SET active=0 WHERE id=${literal(job.subscription_id)};`:''} UPDATE alliance_push_deliveries SET status='retry',lease_until=SYSTIMESTAMP+INTERVAL '5' MINUTE,updated_at=SYSTIMESTAMP WHERE id=${literal(id)};COMMIT;END;`);
   }
  };
  for(let offset=0;offset<jobs.length;offset+=4){const results=await Promise.allSettled(jobs.slice(offset,offset+4).map(deliver));failed+=results.filter(r=>r.status==='rejected').length;}
 }
 return {sent,failed};
}
async function main(){let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});do{try{console.log(JSON.stringify({at:new Date().toISOString(),...await cycle()}));}catch(error){console.error('No se pudo ejecutar el envío: '+(error instanceof Error?error.message:'Error del servicio'));if(process.argv.includes('--once'))process.exitCode=1;}if(process.argv.includes('--once')||stopped)break;await new Promise(r=>setTimeout(r,30000));}while(!stopped);}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/stock-notification-worker.ts'))void main();
