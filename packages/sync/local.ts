import Dexie, { type EntityTable } from 'dexie';
import { operationSchema, productInput, DomainError } from '../shared/domain.js';
import type { Ack, Bootstrap, Changes, Operation, Product, ProductInput, QueueStatus, Unit, Ingredient } from '../shared/domain.js';
export type QueueEntry = { operation_id:string;entity_id:string;status:QueueStatus;retry_count:number;next_attempt:number;lease_until:number;last_error?:string;ack?:Ack;resolution?:'SERVER' };
type Meta = { key:string;value:any };
export class LocalDatabase extends Dexie {
  products!: EntityTable<Product,'id'>; central!: EntityTable<Product,'id'>;
  units!: EntityTable<Unit,'id'>; ingredients!: EntityTable<Ingredient,'id'>;
  events!: EntityTable<Operation,'operation_id'>; queue!: EntityTable<QueueEntry,'operation_id'>;meta!: EntityTable<Meta,'key'>;
  constructor(public scope:{business_id:string;location_id:string;user_id:string}, suffix='') {
    super(`tc-alliance-v1-${scope.business_id}-${scope.location_id}-${scope.user_id}${suffix}`);
    this.version(1).stores({products:'id,sku,category',central:'id',units:'id',ingredients:'id',events:'operation_id,entity_id,client_created_at',queue:'operation_id,entity_id,status,next_attempt',meta:'key'});
  }
  async deviceId() {
    return this.transaction('rw',this.meta,async()=>{
      const existing=await this.meta.get('device_id');if(existing)return existing.value as string;
      const id=crypto.randomUUID();await this.meta.put({key:'device_id',value:id});return id;
    });
  }
  async install(bootstrap: Bootstrap) {
    if(bootstrap.location.id!==this.scope.location_id||bootstrap.location.business_id!==this.scope.business_id)throw new DomainError('INVALID_SCOPE','El catálogo pertenece a otra sucursal.');
    await this.transaction('rw',[this.products,this.central,this.units,this.ingredients,this.meta,this.queue],async()=>{
      const pending=new Set((await this.queue.toArray()).filter(q=>q.status!=='SYNCED'&&!q.resolution).map(q=>q.entity_id));
      // Central snapshot replaces the previous snapshot; pending local edits stay visible.
      await this.central.clear();await this.central.bulkPut(bootstrap.products);
      for(const p of await this.products.toArray())if(!pending.has(p.id))await this.products.delete(p.id);
      await this.products.bulkPut(bootstrap.products.filter(p=>!pending.has(p.id)));
      await this.units.clear();await this.units.bulkPut(bootstrap.units);await this.ingredients.clear();await this.ingredients.bulkPut(bootstrap.ingredients);
      await this.meta.bulkPut([{key:'cursor',value:bootstrap.cursor},{key:'location',value:bootstrap.location},{key:'last_download',value:new Date().toISOString()}]);
    });
  }
  async saveProduct(input: ProductInput,id:string=crypto.randomUUID()) {
    const payload=productInput.parse(input);const device_id=await this.deviceId();const operation_id=crypto.randomUUID();const created=new Date().toISOString();
    return this.transaction('rw',[this.products,this.events,this.queue],async()=>{
      const blockers=(await this.queue.where('entity_id').equals(id).toArray()).some(q=>!q.resolution&&['CONFLICT','REQUIRES_REVIEW','FAILED'].includes(q.status));
      if(blockers)throw new DomainError('SYNC_CONFLICT','Revisa el cambio pendiente antes de editar de nuevo.');
      const current=await this.products.get(id);
      const op=operationSchema.parse({operation_id,idempotency_key:operation_id,device_id,business_id:this.scope.business_id,location_id:this.scope.location_id,entity_type:'PRODUCT',entity_id:id,operation_type:'PRODUCT_UPSERT',payload,base_version:current?.version||0,client_created_at:created});
      const product={...payload,id,business_id:this.scope.business_id,version:op.base_version+1,updated_at:created};
      await this.products.put(product);await this.events.add(op);await this.queue.add({operation_id,entity_id:id,status:'PENDING',retry_count:0,next_attempt:0,lease_until:0});return product;
    });
  }
  async claim(now=Date.now()):Promise<Operation[]> {
    return this.transaction('rw',[this.queue,this.events],async()=>{
      const abandoned=await this.queue.where('status').equals('SYNCING').toArray();
      for(const q of abandoned)if(q.lease_until<=now)await this.queue.update(q.operation_id,{status:'PENDING',lease_until:0});
      const queue=(await this.queue.toArray()).filter(q=>q.status==='PENDING'&&!q.resolution&&q.next_attempt<=now);
      const ops:Operation[]=[];
      for(const q of queue){const e=await this.events.get(q.operation_id);if(e)ops.push(e);}
      ops.sort((a,b)=>a.client_created_at.localeCompare(b.client_created_at)||a.base_version-b.base_version);
      const batch=ops.slice(0,100);
      for(const op of batch)await this.queue.update(op.operation_id,{status:'SYNCING',lease_until:now+60000});return batch;
    });
  }
  async acknowledge(ack: Ack) {
    await this.transaction('rw',[this.queue,this.products,this.central],async()=>{
      const q=await this.queue.get(ack.operation_id);if(!q)return;
      await this.queue.update(ack.operation_id,{status:ack.status,lease_until:0,last_error:ack.message,ack});
      if(ack.product) {
        await this.central.put(ack.product);
        const others=(await this.queue.where('entity_id').equals(q.entity_id).toArray()).filter(x=>x.operation_id!==q.operation_id&&x.status!=='SYNCED'&&!x.resolution);
        if(ack.status==='SYNCED'&&!others.length)await this.products.put(ack.product);
      }
      if(ack.status!=='SYNCED')for(const dependent of await this.queue.where('entity_id').equals(q.entity_id).toArray()) {
        if(dependent.operation_id!==q.operation_id&&['PENDING','SYNCING'].includes(dependent.status))await this.queue.update(dependent.operation_id,{status:'REQUIRES_REVIEW',lease_until:0,last_error:'Un cambio anterior de este producto requiere revisión.'});
      }
    });
  }
  async release(ids:string[],error:string,now=Date.now()) {
    await this.transaction('rw',this.queue,async()=>{
      for(const id of ids){const q=await this.queue.get(id);if(q?.status==='SYNCING')await this.queue.update(id,{status:'PENDING',lease_until:0,retry_count:q.retry_count+1,next_attempt:now+Math.min(300000,1000*2**Math.min(q.retry_count,8)),last_error:error});}
    });
  }
  async pull(page:Changes) {
    await this.transaction('rw',[this.products,this.central,this.queue,this.meta],async()=>{
      const cursor=(await this.meta.get('cursor'))?.value||0;
      if(page.cursor<cursor)return;
      for(const change of page.changes){
        const p=change.product;await this.central.put(p);
        const pending=(await this.queue.where('entity_id').equals(p.id).toArray()).some(q=>q.status!=='SYNCED'&&!q.resolution);
        if(!pending)await this.products.put(p);
      }
      await this.meta.bulkPut([{key:'cursor',value:page.cursor},{key:'last_sync',value:new Date().toISOString()}]);
    });
  }
  async acceptServer(entityId:string) {
    await this.transaction('rw',[this.products,this.central,this.queue],async()=>{
      const jobs=await this.queue.where('entity_id').equals(entityId).toArray();
      if(jobs.some(q=>q.status==='SYNCING'))throw new DomainError('SYNC_BUSY','Espera a que termine el envío de este cambio.');
      const p=await this.central.get(entityId);if(p)await this.products.put(p);else await this.products.delete(entityId);
      for(const q of jobs)if(q.status!=='SYNCED')await this.queue.update(q.operation_id,{resolution:'SERVER',status:'REQUIRES_REVIEW',last_error:'Resuelto: se conservó la versión central.'});
    });
  }
  async exportPending() {
    const unresolved=(await this.queue.toArray()).filter(q=>q.status!=='SYNCED'&&!q.resolution);
    return {scope:this.scope,exported_at:new Date().toISOString(),queue:unresolved,events:await this.events.bulkGet(unresolved.map(q=>q.operation_id))};
  }
}
