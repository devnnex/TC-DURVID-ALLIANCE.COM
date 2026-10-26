import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LocalDatabase } from '../packages/sync/local';
import { SyncEngine } from '../packages/sync/engine';
import { MemoryRepository } from '../apps/api/src/memory';
import { hashPassword,checkPassword } from '../apps/api/src/password';
import { money,pesosToMinor,recommendedPrice, operationSchema, type Principal, type ProductInput, type Ack, type Operation } from '../packages/shared/domain';

const input:ProductInput={name:'Café de prueba',sku:'CF-001',category:'Café',price_minor:'950000',kind:'SIMPLE',unit_id:'u',active:true};
const databases:LocalDatabase[]=[];
afterEach(async()=>{for(const db of databases.splice(0))await db.delete();});
async function environment(){
  const repo=new MemoryRepository();const context=await repo.setup({slug:'test-alliance',business_name:'Test',location_name:'Principal',name:'Owner',username:'owner',password_hash:await hashPassword('a-private-test-password')});
  const principal:Principal={user_id:context.user.id,business_id:context.user.business_id,location_id:context.locations[0].id,permissions:context.permissions[context.locations[0].id]};
  const db=new LocalDatabase({...principal},`-${randomUUID()}`);databases.push(db);await db.install(await repo.bootstrap(principal));await repo.registerDevice(principal,await db.deviceId(),'Equipo');
  const transport={send:(ops:Operation[])=>Promise.all(ops.map(o=>repo.apply(principal,o))),changes:(cursor:number)=>repo.changes(principal,cursor)};
  return {repo,context,principal,db,transport};
}
describe('Dinero y credenciales',()=>{
  it('mantiene COP grande sin floating point y separa markup/margin',()=>{
    expect(pesosToMinor('125500')).toBe('12550000');expect(money('12550000').replace(/\s/g,'')).toBe('$125.500');
    expect(recommendedPrice('1000000',2500,'MARKUP')).toBe('1250000');expect(recommendedPrice('1000000',2500,'MARGIN')).toBe('1333333');
    expect(recommendedPrice('9999999999999999',0,'MARKUP')).toBe('9999999999999999');expect(()=>recommendedPrice('100',10000,'MARGIN')).toThrow();
  });
  it('contraseñas saladas sin texto recuperable',async()=>{const a=await hashPassword('a-long-password'),b=await hashPassword('a-long-password');expect(a).not.toBe(b);expect(await checkPassword('a-long-password',a)).toBe(true);expect(await checkPassword('wrong',a)).toBe(false);});
});
describe('Eventos, persistencia y sincronización de catálogo',()=>{
  it('producto y evento se guardan juntos y sobreviven a otra conexión IndexedDB',async()=>{
    const {db,principal}=await environment();const p=await db.saveProduct(input);const device=await db.deviceId();db.close();
    const reopened=new LocalDatabase({...principal},db.name.slice(`tc-alliance-v1-${principal.business_id}-${principal.location_id}-${principal.user_id}`.length));
    await reopened.open();expect(await reopened.products.get(p.id)).toMatchObject(input);expect(await reopened.events.count()).toBe(1);expect(await reopened.deviceId()).toBe(device);reopened.close();await db.open();
  });
  it('aborta escritura completa si falla el evento local',async()=>{
    const {db}=await environment();await db.queue.hook('creating',()=>{throw new Error('Disco lleno');});await expect(db.saveProduct(input)).rejects.toThrow('Disco lleno');expect(await db.products.count()).toBe(0);expect(await db.events.count()).toBe(0);
  });
  it('OFFLINE → 100 PRODUCTOS → ONLINE confirma una vez cada evento',async()=>{
    const {repo,db,transport}=await environment();for(let i=0;i<100;i++)await db.saveProduct({...input,sku:`CF-${i}`});
    expect(await db.events.count()).toBe(100);await new SyncEngine(db,transport).run();expect(repo.products.size).toBe(100);expect(repo.receipts.size).toBe(100);expect(await db.queue.where('status').equals('SYNCED').count()).toBe(100);
  });
  it('cinco envíos de la misma operación producen un único producto y un único recibo',async()=>{
    const {repo,principal,db}=await environment();await db.saveProduct(input);const op=(await db.events.toArray())[0];const results:Ack[]=[];for(let i=0;i<5;i++)results.push(await repo.apply(principal,op));
    expect(repo.products.size).toBe(1);expect(repo.receipts.size).toBe(1);expect(repo.feed.get(principal.location_id)).toHaveLength(1);expect(results.every(r=>JSON.stringify(r)===JSON.stringify(results[0]))).toBe(true);
  });
  it('ACK perdido → retry conserva idempotencia',async()=>{
    const {repo,db,transport}=await environment();await db.saveProduct(input);let failed=true;
    const engine=new SyncEngine(db,{...transport,send:async ops=>{const result=await transport.send(ops);if(failed){failed=false;throw new Error('Conexión perdida después del commit');}return result;}});
    await expect(engine.run()).rejects.toThrow('Conexión perdida');expect(repo.products.size).toBe(1);const q=(await db.queue.toArray())[0];expect(q.status).toBe('PENDING');await db.queue.update(q.operation_id,{next_attempt:0});await engine.run();expect(repo.products.size).toBe(1);expect((await db.queue.get(q.operation_id))?.status).toBe('SYNCED');
  });
  it('ACK parcial reintenta únicamente lo no confirmado',async()=>{
    const {db,transport}=await environment();await db.saveProduct(input);await db.saveProduct({...input,sku:'CF-002'});
    await new SyncEngine(db,{...transport,send:async ops=>(await transport.send(ops)).slice(0,1)}).run();expect(await db.queue.where('status').equals('SYNCED').count()).toBe(1);expect(await db.queue.where('status').equals('PENDING').count()).toBe(1);
  });
  it('recupera SYNCING abandonado y bloquea claims simultáneos',async()=>{
    const {db}=await environment();await db.saveProduct(input);const [a,b]=await Promise.all([db.claim(),db.claim()]);expect(a.length+b.length).toBe(1);expect(await db.claim(Date.now()+61000)).toHaveLength(1);
  });
  it('dos dispositivos offline editando el mismo producto exigen revisión',async()=>{
    const {repo,principal,db,transport}=await environment();const p=await db.saveProduct(input);await new SyncEngine(db,transport).run();
    const second=new LocalDatabase({...principal},`-second-${randomUUID()}`);databases.push(second);await second.install(await repo.bootstrap(principal));await repo.registerDevice(principal,await second.deviceId(),'Segundo');
    await db.saveProduct({...input,name:'Cambio A'},p.id);await second.saveProduct({...input,name:'Cambio B'},p.id);
    await new SyncEngine(db,transport).run();await new SyncEngine(second,transport).run();
    expect(repo.products.get(p.id)?.name).toBe('Cambio A');expect((await second.queue.toArray())[0].status).toBe('CONFLICT');expect((await second.products.get(p.id))?.name).toBe('Cambio B');
    await second.acceptServer(p.id);expect((await second.products.get(p.id))?.name).toBe('Cambio A');expect((await second.queue.toArray())[0].resolution).toBe('SERVER');expect(await second.events.count()).toBe(1);
  });
  it('cambios locales sucesivos respetan versiones y no se pisan con el ACK anterior',async()=>{
    const {repo,db,transport}=await environment();const p=await db.saveProduct(input);await db.saveProduct({...input,name:'Nombre definitivo'},p.id);await new SyncEngine(db,transport).run();expect(repo.products.get(p.id)?.version).toBe(2);expect((await db.products.get(p.id))?.name).toBe('Nombre definitivo');
  });
  it('el bootstrap mantiene estados locales pendientes sin perder snapshot central',async()=>{
    const {repo,principal,db}=await environment();const p=await db.saveProduct(input);await db.install(await repo.bootstrap(principal));expect(await db.products.get(p.id)).toBeDefined();expect(await db.events.count()).toBe(1);
  });
  it('el pull preserva edición local y avanza cursor de forma atómica',async()=>{
    const {db,transport}=await environment();const p=await db.saveProduct(input);await new SyncEngine(db,transport).run();await db.saveProduct({...input,name:'Local'},p.id);await db.pull({changes:[{cursor:2,product:{...p,name:'Central',version:2}}],cursor:2,has_more:false});expect((await db.products.get(p.id))?.name).toBe('Local');expect((await db.central.get(p.id))?.name).toBe('Central');expect((await db.meta.get('cursor'))?.value).toBe(2);
  });
});
describe('Autorización y validación de eventos',()=>{
  it('rechaza business/location inyectado y dispositivos ajenos',async()=>{
    const {repo,db,principal}=await environment();await db.saveProduct(input);const op=(await db.events.toArray())[0];await expect(repo.apply(principal,{...op,business_id:randomUUID()})).rejects.toMatchObject({code:'FORBIDDEN'});await expect(repo.apply(principal,{...op,device_id:randomUUID()})).rejects.toMatchObject({code:'DEVICE_NOT_REGISTERED'});
  });
  it('revalida permiso también antes de devolver un recibo idempotente',async()=>{
    const {repo,db,principal}=await environment();await db.saveProduct(input);const op=(await db.events.toArray())[0];await repo.apply(principal,op);await expect(repo.apply({...principal,permissions:['products.read']},op)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('misma clave con payload distinto no cambia el producto',async()=>{
    const {repo,db,principal}=await environment();await db.saveProduct(input);const op=(await db.events.toArray())[0];await repo.apply(principal,op);await expect(repo.apply(principal,{...op,payload:{...op.payload,name:'Alterado'}})).rejects.toMatchObject({code:'IDEMPOTENCY_MISMATCH'});expect(repo.products.get(op.entity_id)?.name).toBe(input.name);
  });
  it('esquemas estrictos rechazan dinero flotante y propiedades desconocidas',async()=>{
    const {db}=await environment();await db.saveProduct(input);const op=(await db.events.toArray())[0];expect(()=>operationSchema.parse({...op,unexpected:true})).toThrow();expect(()=>operationSchema.parse({...op,payload:{...input,price_minor:9500.5}})).toThrow();
  });
});
