import type { Ack, Changes, Operation } from '../shared/domain.js';
import { LocalDatabase } from './local.js';
export interface SyncTransport { send(operations:Operation[]):Promise<Ack[]>; changes(cursor:number):Promise<Changes>; }
export class SyncEngine {
  private running=false;
  constructor(private db:LocalDatabase,private transport:SyncTransport) {}
  async run() {
    if(this.running)return;this.running=true;
    const work=async()=>{
      const ops=await this.db.claim();
      if(ops.length){try{
        const acks=await this.transport.send(ops);const received=new Set(acks.map(a=>a.operation_id));
        for(const ack of acks)if(ops.some(o=>o.operation_id===ack.operation_id))await this.db.acknowledge(ack);
        await this.db.release(ops.filter(o=>!received.has(o.operation_id)).map(o=>o.operation_id),'El servidor no confirmó este cambio.');
      }catch(e){await this.db.release(ops.map(o=>o.operation_id),e instanceof Error?e.message:'No se pudo conectar.');throw e;}}
      let cursor=(await this.db.meta.get('cursor'))?.value||0;
      for(let i=0;i<100;i++){
        const page=await this.transport.changes(cursor);await this.db.pull(page);
        if(!page.has_more)break;
        if(page.cursor<=cursor)throw new Error('El servidor no avanzó el cursor.');cursor=page.cursor;
      }
    };
    try{
      if(typeof navigator!=='undefined'&&navigator.locks)await navigator.locks.request(this.db.name,{ifAvailable:true},async lock=>{if(lock)await work();});else await work();
    }finally{this.running=false;}
  }
}
