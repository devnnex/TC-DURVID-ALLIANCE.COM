import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import * as webpush from 'web-push';
const mock=vi.hoisted(()=>({sql:vi.fn(),send:vi.fn()}));
vi.mock('../scripts/ords-sql.js',()=>({executeSql:mock.sql}));
vi.mock('web-push',async importOriginal=>{const actual=await importOriginal<typeof import('web-push')>();return {...actual,setVapidDetails:vi.fn(),sendNotification:mock.send};});
import {cycle,deliveryId} from '../scripts/stock-notification-worker';
const now=new Date('2026-11-24T12:00:00Z');
const alert={id:'product:coffee',name:'Café',kind:'preparation',available:0,target:10,level:'out',missing:[{id:'milk',name:'Leche',unit:'ml',available:0,needed:1000}]};
let allowed=true,fresh=true;let keys:Set<string>;
beforeEach(()=>{
 const vapid=webpush.generateVAPIDKeys();vi.stubEnv('VAPID_PUBLIC_KEY',vapid.publicKey);vi.stubEnv('VAPID_PRIVATE_KEY',vapid.privateKey);vi.stubEnv('VAPID_SUBJECT','https://example.com');keys=new Set();allowed=true;fresh=true;mock.send.mockReset();mock.send.mockResolvedValue({statusCode:201});mock.sql.mockReset();
 mock.sql.mockImplementation(async(sql:string)=>{let result:any[]=[];
  if(sql.startsWith('SELECT public_key'))result=[{public_key:vapid.publicKey,enabled:1}];
  else if(sql.startsWith('SELECT l.business_id'))result=[{business_id:'business',location_id:'location',slug:'cafeteria'}];
  else if(sql.startsWith('SELECT id FROM users'))result=[{id:'boss'}];
  else if(sql.includes('scan_snapshot'))result=[{payload:JSON.stringify({_alertRevision:'oracle-1',model:{ingredients:[{id:'milk',name:'Leche',unit:'ml',quantity:0}],recipes:[{productId:'coffee',managed:true,lines:[{ingredientId:'milk',quantity:100,unit:'ml'}]}]},docs:{menu_items:[{id:'coffee',name:'Café',is_available:true}]}})}];
  else if(sql.startsWith('SELECT a.id'))result=[{...alert,generation:1,opened_at:'2026-11-24T11:45:00Z',subscription_id:'device',user_id:'boss',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',business_name:'Cafetería',payload:JSON.stringify(alert)}];
  else if(sql.includes(' allowed FROM dual'))result=[{allowed:allowed?1:0}];
  else if(sql.includes('claim_delivery')){const id=sql.match(/claim_delivery\('([^']+)'/)![1];result=[{claimed:keys.has(id)?0:1}];keys.add(id);}
  else if(sql.startsWith('SELECT a.payload'))result=fresh?[{payload:JSON.stringify(alert)}]:[];
  return [{resultSet:{items:result}}];
 });
});
afterEach(()=>vi.unstubAllEnvs());
describe('Remitente con autorización, caducidad y entregas idempotentes',()=>{
 it('envía una vez por dispositivo/franja y mantiene el logo y la identidad del negocio',async()=>{expect(await cycle(now)).toMatchObject({sent:1,failed:0});expect(await cycle(now)).toMatchObject({sent:0});expect(mock.send).toHaveBeenCalledTimes(1);const sent=JSON.parse(mock.send.mock.calls[0][1]);expect(sent).toMatchObject({branch:'cafeteria',title:'Cafetería · Café'});expect(sent.body).toContain('1.000 ml');expect(mock.sql.mock.calls.some(([sql])=>sql.includes('claim_delivery')&&sql.startsWith('SELECT'))).toBe(true);});
 it('no envía a un rol revocado ni entrega cantidades que cambiaron después de la revisión',async()=>{allowed=false;await cycle(now);expect(mock.send).not.toHaveBeenCalled();allowed=true;fresh=false;await cycle(now);expect(mock.send).not.toHaveBeenCalled();});
 it('retira una suscripción caducada sin bloquear las otras entregas',async()=>{mock.send.mockRejectedValue({statusCode:410});expect(await cycle(now)).toMatchObject({sent:0,failed:1});expect(mock.sql.mock.calls.some(([sql])=>sql.includes('UPDATE alliance_push_subscriptions SET active=0'))).toBe(true);});
 it('separa episodios, usuarios/dispositivos y negocios; no cambia la clave al reintentar',()=>{const a={businessId:'b',locationId:'l',id:'coffee',generation:1,openedAt:'2026-11-24T11:45:00Z'};const first=deliveryId(a,'device',now);expect(deliveryId(a,'device',now)).toBe(first);expect(deliveryId({...a,generation:2},'device',now)).not.toBe(first);expect(deliveryId(a,'other',now)).not.toBe(first);expect(deliveryId({...a,businessId:'another'},'device',now)).not.toBe(first);});
});
