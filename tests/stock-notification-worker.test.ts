import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import * as webpush from 'web-push';
const mock=vi.hoisted(()=>({sql:vi.fn(),send:vi.fn()}));
vi.mock('../scripts/ords-sql.js',()=>({executeSql:mock.sql}));
vi.mock('web-push',async importOriginal=>{const actual=await importOriginal<typeof import('web-push')>();return {...actual,setVapidDetails:vi.fn(),sendNotification:mock.send};});
import {cycle,deliveryId,createWorkerState,deliverLimited} from '../scripts/stock-notification-worker';
const now=new Date('2026-11-24T12:00:00Z');
const alert={id:'product:coffee',name:'Café',kind:'preparation',available:0,target:10,level:'out',missing:[{id:'milk',name:'Leche',unit:'ml',available:0,needed:1000}]};
let allowed=true,fresh=true;let keys:Set<string>;let loginEvents:any[]=[],dirtyVersion:number|undefined,completed:any[]=[];
beforeEach(()=>{
 const vapid=webpush.generateVAPIDKeys();vi.stubEnv('VAPID_PUBLIC_KEY',vapid.publicKey);vi.stubEnv('VAPID_PRIVATE_KEY',vapid.privateKey);vi.stubEnv('VAPID_SUBJECT','https://example.com');keys=new Set();allowed=true;fresh=true;loginEvents=[];dirtyVersion=undefined;completed=[];mock.send.mockReset();mock.send.mockResolvedValue({statusCode:201});mock.sql.mockReset();
 mock.sql.mockImplementation(async(sql:string)=>{let result:any[]=[];
  if(sql.startsWith('SELECT public_key'))result=[{public_key:vapid.publicKey,enabled:1}];
  else if(sql.startsWith('SELECT business_id,location_id,version'))result=dirtyVersion===undefined?[]:[{business_id:'business',location_id:'location',version:dirtyVersion}];
  else if(sql.startsWith('SELECT id,status FROM alliance_push_deliveries'))result=completed;
  else if(sql.startsWith('SELECT l.business_id'))result=[{business_id:'business',location_id:'location',slug:'cafeteria'}];
  else if(sql.startsWith('SELECT id FROM users'))result=[{id:'boss'}];
  else if(sql.includes('scan_snapshot'))result=[{payload:JSON.stringify({_alertRevision:'oracle-1',model:{ingredients:[{id:'milk',name:'Leche',unit:'ml',quantity:0}],recipes:[{productId:'coffee',managed:true,lines:[{ingredientId:'milk',quantity:100,unit:'ml'}]}]},docs:{menu_items:[{id:'coffee',name:'Café',is_available:true}]}})}];
  else if(sql.startsWith('SELECT a.id'))result=[{...alert,generation:1,opened_at:'2026-11-24T11:45:00Z',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',business_name:'Cafetería',payload:JSON.stringify(alert)}];
  else if(sql.includes(' allowed FROM dual'))result=[{allowed:allowed?1:0}];
  else if(sql.includes('claim_delivery')){const id=sql.match(/claim_delivery\('([^']+)'/)![1];result=[{claimed:keys.has(id)?0:1}];keys.add(id);}
  else if(sql.startsWith('SELECT a.payload'))result=fresh?[{payload:JSON.stringify(alert)}]:[];
  else if(sql.startsWith('SELECT e.id'))result=loginEvents;
  return [{resultSet:{items:result}}];
 });
});
afterEach(()=>vi.unstubAllEnvs());
describe('Remitente con autorización, caducidad y entregas idempotentes',()=>{
 it('entrega un sobrante solo al jefe elegido, con cantidad y acceso a recepción',async()=>{
  const entry={kind:'ingredient-transfer',status:'pending',recipientId:'boss',senderName:'Laura',sourceName:'Coctelería',name:'Pulpa de mango',quantity:500,unit:'g',body:'Sobrante por recibir',at:now.toISOString()};
  loginEvents=[{id:'transfer',business_id:'business',location_id:'location',slug:'cafeteria',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',business_name:'Cafetería',payload:JSON.stringify(entry)}];
  const base=mock.sql.getMockImplementation()!;mock.sql.mockImplementation(async(sql:string)=>sql.startsWith('SELECT payload FROM alliance_notice_events')?[{resultSet:{items:[{payload:JSON.stringify(entry)}]}}]:base(sql));
  await cycle(now);const sent=mock.send.mock.calls.map(c=>JSON.parse(c[1])).find(p=>p.type==='ingredient-transfer');expect(sent).toMatchObject({branch:'cafeteria',title:'Cafetería · Insumo por recibir'});expect(sent.body).toContain('Laura de Coctelería');expect(sent.body).toContain('500 g de Pulpa de mango');expect(mock.sql.mock.calls.some(([sql])=>sql.includes("JSON_VALUE(e.payload,'$.recipientId')=s.user_id"))).toBe(true);
 });
 it('no entrega un sobrante a otro jefe ni avisa de uno ya resuelto',async()=>{
  loginEvents=[{id:'transfer',business_id:'business',location_id:'location',slug:'cafeteria',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',payload:JSON.stringify({kind:'ingredient-transfer',status:'pending',recipientId:'different-boss'})}];
  await cycle(now);expect(mock.send.mock.calls.map(c=>JSON.parse(c[1])).some(p=>p.type==='ingredient-transfer')).toBe(false);
  loginEvents[0].payload=JSON.stringify({kind:'ingredient-transfer',status:'pending',recipientId:'boss'});await cycle(now);expect(mock.send.mock.calls.map(c=>JSON.parse(c[1])).some(p=>p.type==='ingredient-transfer')).toBe(false);
 });
 it('entrega el acceso de un trabajador una vez, sin repetirlo con los recordatorios',async()=>{loginEvents=[{id:'login',business_id:'business',location_id:'location',slug:'cafeteria',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',business_name:'Cafetería',payload:JSON.stringify({name:'Ana',role:'Mesero',body:'Ana inició sesión como mesero.',at:'2026-11-24T12:00:00Z'})}];await cycle(now);const initial=mock.send.mock.calls.map(c=>JSON.parse(c[1]));expect(initial.filter(p=>p.type==='staff-login')).toHaveLength(1);expect(initial.find(p=>p.type==='staff-login').body).toContain('Ana');await cycle(new Date('2026-11-25T23:30:00Z'));expect(mock.send.mock.calls.map(c=>JSON.parse(c[1])).filter(p=>p.type==='staff-login')).toHaveLength(1);});
 it('envía una vez por dispositivo/franja y mantiene el logo y la identidad del negocio',async()=>{expect(await cycle(now)).toMatchObject({sent:1,failed:0});expect(await cycle(now)).toMatchObject({sent:0});expect(mock.send).toHaveBeenCalledTimes(1);const sent=JSON.parse(mock.send.mock.calls[0][1]);expect(sent).toMatchObject({branch:'cafeteria',title:'Cafetería · Café'});expect(sent.body).toContain('1.000 ml');expect(mock.sql.mock.calls.some(([sql])=>sql.includes('claim_delivery')&&sql.startsWith('SELECT'))).toBe(true);});
 it('no envía a un rol revocado ni entrega cantidades que cambiaron después de la revisión',async()=>{allowed=false;await cycle(now);expect(mock.send).not.toHaveBeenCalled();allowed=true;fresh=false;await cycle(now);expect(mock.send).not.toHaveBeenCalled();});
 it('retira una suscripción caducada sin bloquear las otras entregas',async()=>{mock.send.mockRejectedValue({statusCode:410});expect(await cycle(now)).toMatchObject({sent:0,failed:1});expect(mock.sql.mock.calls.some(([sql])=>sql.includes('UPDATE alliance_push_subscriptions SET active=0'))).toBe(true);});
 it('separa episodios, usuarios/dispositivos y negocios; no cambia la clave al reintentar',()=>{const a={businessId:'b',locationId:'l',id:'coffee',generation:1,openedAt:'2026-11-24T11:45:00Z'};const first=deliveryId(a,'device',now);expect(deliveryId(a,'device',now)).toBe(first);expect(deliveryId({...a,generation:2},'device',now)).not.toBe(first);expect(deliveryId(a,'other',now)).not.toBe(first);expect(deliveryId({...a,businessId:'another'},'device',now)).not.toBe(first);});
 it('sondea cambios sin bloquear ni volver a escanear inventario en cada intervalo',async()=>{
  const state=createWorkerState();await cycle(now,state);await cycle(new Date(+now+5000),state);await cycle(new Date(+now+30000),state);
  expect(mock.sql.mock.calls.filter(([sql])=>sql.includes('scan_snapshot'))).toHaveLength(1);
  expect(mock.sql.mock.calls.filter(([sql])=>sql.includes('DELETE FROM alliance_notice_events'))).toHaveLength(1);
  expect(mock.sql.mock.calls.filter(([sql])=>sql.includes('claim_delivery'))).toHaveLength(1);
  await cycle(new Date(+now+60000),state);expect(mock.sql.mock.calls.filter(([sql])=>sql.includes('scan_snapshot'))).toHaveLength(2);
 });
 it('una versión nueva invalida inmediatamente la revisión del negocio',async()=>{
  const state=createWorkerState();dirtyVersion=1;await cycle(now,state);dirtyVersion=2;await cycle(new Date(+now+5000),state);
  expect(mock.sql.mock.calls.filter(([sql])=>sql.includes('scan_snapshot'))).toHaveLength(2);
  expect(mock.sql.mock.calls.some(([sql])=>sql.includes('processed_version=GREATEST(processed_version,2)'))).toBe(true);
 });
 it('los avisos de acceso se entregan antes de revisar un inventario lento o averiado',async()=>{
  loginEvents=[{id:'login',business_id:'business',location_id:'location',slug:'cafeteria',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',business_name:'Cafetería',payload:JSON.stringify({name:'Ana',role:'Mesero',body:'Ana inició sesión.',at:now.toISOString()})}];
  const base=mock.sql.getMockImplementation()!;mock.sql.mockImplementation(async(sql:string)=>{if(sql.includes('scan_snapshot'))throw Error('Inventario temporalmente ocupado');return base(sql);});
  expect(await cycle(now)).toEqual({sent:1,failed:1});expect(JSON.parse(mock.send.mock.calls[0][1]).type).toBe('staff-login');
 });
 it('no confirma una revisión que cambió antes de la entrega',async()=>{dirtyVersion=3;fresh=false;await cycle(now);expect(mock.sql.mock.calls.some(([sql])=>sql.includes('processed_version=GREATEST'))).toBe(false);});
 it('filtra entregas terminadas por lote antes de consultar permisos y reservar dispositivos',async()=>{
  completed=[{id:deliveryId({businessId:'business',locationId:'location',id:alert.id,generation:1,openedAt:'2026-11-24T11:45:00Z'},'device',now),status:'sent'}];
  await cycle(now);expect(mock.send).not.toHaveBeenCalled();expect(mock.sql.mock.calls.some(([sql])=>sql.includes('claim_delivery'))).toBe(false);
 });
 it('cuatro conexiones como máximo y un dispositivo lento no detiene los demás',async()=>{
  let release!:()=>void,active=0,peak=0;const gate=new Promise<void>(resolve=>release=resolve),done:number[]=[],failures:number[]=[];
  const pending=deliverLimited(Array.from({length:12},(_,i)=>i),async id=>{active++;peak=Math.max(active,peak);try{if(id===0)await gate;else await Promise.resolve();if(id===3)throw Error('Dispositivo desconectado');done.push(id);}finally{active--; }},id=>failures.push(id));
  await vi.waitFor(()=>expect(done).toContain(11));expect(peak).toBeLessThanOrEqual(4);expect(done).not.toContain(0);release();await pending;expect(done).toHaveLength(11);expect(failures).toEqual([3]);
 });
});
