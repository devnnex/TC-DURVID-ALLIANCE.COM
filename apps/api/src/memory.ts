import { randomUUID } from 'node:crypto';
import { assertScope, DomainError, requirePermission, units } from '../../../packages/shared/domain.js';
import type { Ack, Context, Operation, Principal, Product, Change, Location } from '../../../packages/shared/domain.js';
import type { Repository, Session, Setup, UserRecord } from './repository.js';
import { digest } from './password.js';
import { effectivePermissions, roleTemplates, sections, requireOwner, assertUserGrant } from '../../../packages/shared/administration.js';
import type { Administration, LocationInput, ManagedUser, UserWrite } from '../../../packages/shared/administration.js';

// Explicit development adapter. Never selected implicitly or used in production.
export class MemoryRepository implements Repository {
  async health(){return true;}
  async setupRequired(){return this.users.size===0;}
  users = new Map<string,UserRecord>(); contexts = new Map<string,Context>(); sessions = new Map<string,Session>();
  products = new Map<string,Product>(); devices = new Map<string,Principal>();
  receipts = new Map<string,{ hash: string; actor: string; ack: Ack }>(); keys = new Map<string,string>();
  feed = new Map<string,Change[]>(); locations = new Map<string,Location>();
  managed = new Map<string,ManagedUser>();
  adminAudit: {actor:string;action:string;entity:string}[] = [];
  async findUser(slug: string, username: string) { return [...this.users.values()].find(u => u.business_slug === slug && u.username === username && this.managed.get(u.id)?.active); }
  async context(id: string):Promise<Context> {
    const u=this.users.get(id),m=this.managed.get(id);
    if(!u||!m?.active)throw new DomainError('UNAUTHORIZED','La sesión ya no está disponible.',401);
    const {password_hash:_,...identity}=u;
    const locations=[...this.locations.values()].filter(l=>l.business_id===u.business_id&&l.active&&(m.protected||m.access.some(a=>a.location_id===l.id)));
    return {user:identity,locations:structuredClone(locations),is_owner:m.protected,roles:Object.fromEntries(locations.map(l=>[l.id,m.protected?['OWNER']:m.access.find(a=>a.location_id===l.id)?.roles||[]])),permissions:Object.fromEntries(locations.map(l=>{const a=m.access.find(a=>a.location_id===l.id);return [l.id,effectivePermissions(m.protected?['OWNER']:a?.roles||[],a?.overrides||{})];}))};
  }
  async setup(s: Setup) {
    if (this.users.size) throw new DomainError('SETUP_COMPLETE','La configuración inicial ya fue realizada.',409);
    const b = randomUUID(), u = randomUUID();
    const user: UserRecord = { id:u,business_id:b,business_slug:s.slug,name:s.name,username:s.username,password_hash:s.password_hash };
    const locations=s.locations||[{name:s.location_name!,slug:'principal',color:'#a47a47',active:true}];
    for(const input of locations){const l=randomUUID();this.locations.set(l,{...input,id:l,business_id:b});}
    this.users.set(u,user);this.managed.set(u,{id:u,name:s.name,username:s.username,active:true,protected:true,access:[...this.locations.values()].map(l=>({location_id:l.id,roles:['OWNER'],overrides:{}}))});
    const context=await this.context(u);this.contexts.set(u,context);return context;
  }
  private async owner(id:string){const c=await this.context(id);requireOwner(!!c.is_owner);return c;}
  private async teamManager(id:string){const c=await this.context(id);if(!c.is_owner&&!Object.values(c.permissions).some(p=>p.includes('administration.manage')))throw new DomainError('FORBIDDEN','No tienes permiso para gestionar usuarios.',403);return c;}
  async administration(actorId:string):Promise<Administration>{const c=await this.teamManager(actorId),managed=Object.entries(c.permissions).filter(([,p])=>p.includes('administration.manage')).map(([id])=>id);return structuredClone({locations:[...this.locations.values()].filter(l=>l.business_id===c.user.business_id&&(c.is_owner||managed.includes(l.id))),users:[...this.managed.values()].filter(u=>this.users.get(u.id)?.business_id===c.user.business_id&&(c.is_owner||u.access.some(a=>managed.includes(a.location_id)))),roles:roleTemplates,sections});}
  async saveLocation(actorId:string,id:string|undefined,input:LocationInput){
    const c=await this.owner(actorId),b=c.user.business_id;
    if(id&&this.locations.get(id)?.business_id!==b)throw new DomainError('NOT_FOUND','Sucursal no disponible.',404);
    if([...this.locations.values()].some(l=>l.business_id===b&&l.slug===input.slug&&l.id!==id))throw new DomainError('SLUG_EXISTS','Ya existe una sucursal con ese identificador.',409);
    if(!input.active&&![...this.locations.values()].some(l=>l.business_id===b&&l.active&&l.id!==id))throw new DomainError('LAST_LOCATION','Conserva al menos una sucursal habilitada.',409);
    const entity=id||randomUUID();this.locations.set(entity,{...input,id:entity,business_id:b});this.adminAudit.push({actor:actorId,action:'LOCATION_SAVE',entity});
  }
  async saveUser(actorId:string,id:string|undefined,input:UserWrite,locationId?:string){
    const c=await this.teamManager(actorId),b=c.user.business_id,existing=id?this.users.get(id):undefined;
    assertUserGrant(c,id?this.managed.get(id):undefined,input,locationId);
    if(id&&existing?.business_id!==b)throw new DomainError('NOT_FOUND','Usuario no disponible.',404);
    if(id&&this.managed.get(id)?.protected)throw new DomainError('PROTECTED_OWNER','La cuenta del propietario está protegida.',409);
    if(!id&&!input.password_hash)throw new DomainError('PASSWORD_REQUIRED','Define la contraseña del nuevo usuario.');
    if(input.access.some(a=>this.locations.get(a.location_id)?.business_id!==b))throw new DomainError('FORBIDDEN','Una sucursal pertenece a otro negocio.',403);
    if(input.access.some(a=>(a.roles as string[]).includes('OWNER')))throw new DomainError('FORBIDDEN','El rol propietario está protegido.',403);
    if([...this.users.values()].some(u=>u.business_id===b&&u.username===input.username&&u.id!==id))throw new DomainError('USERNAME_EXISTS','Ya existe un usuario con ese nombre.',409);
    const entity=id||randomUUID();this.users.set(entity,{id:entity,business_id:b,business_slug:c.user.business_slug,name:input.name,username:input.username,password_hash:input.password_hash||existing!.password_hash});
    const previous=this.managed.get(entity),now=new Date().toISOString();this.managed.set(entity,{...previous,id:entity,name:input.name,username:input.username,active:input.active,protected:false,access:structuredClone([...(locationId?previous?.access.filter(a=>a.location_id!==locationId)||[]:[]),...input.access]),...(!previous?{createdBy:actorId,createdByName:c.user.name,createdAt:now}:{}),updatedBy:actorId,updatedByName:c.user.name,updatedAt:now});
    for(const s of this.sessions.values())if(s.user_id===entity)s.revoked=true;
    this.adminAudit.push({actor:actorId,action:'USER_ACCESS_SAVE',entity});
  }
  async saveSession(s: Session) { this.sessions.set(s.id,structuredClone(s)); }
  async getSession(id: string) { return this.sessions.get(id); }
  async rotateSession(oldHash: string,newHash: string) { const s = [...this.sessions.values()].find(s => s.refresh_hash === oldHash && !s.revoked && s.expires_at > Date.now()); if (s) s.refresh_hash = newHash; return s; }
  async revokeSession(id: string) { const s = this.sessions.get(id); if(s) s.revoked = true; }
  async registerDevice(p: Principal,id: string,_name: string) {
    const existing = this.devices.get(id);
    if(existing && (existing.business_id !== p.business_id || existing.location_id !== p.location_id || existing.user_id !== p.user_id)) throw new DomainError('DEVICE_SCOPE','Este dispositivo ya está registrado en otro contexto.',409);
    this.devices.set(id,{...p});
  }
  async bootstrap(p: Principal) {
    requirePermission(p,'products.read');const location = this.locations.get(p.location_id)!;
    return { location, products:structuredClone([...this.products.values()].filter(x=>x.business_id===p.business_id)),ingredients:[],units,cursor:(this.feed.get(p.location_id)||[]).length };
  }
  async apply(p: Principal,op: Operation): Promise<Ack> {
    requirePermission(p,'products.write');assertScope(p,op);
    const d = this.devices.get(op.device_id);
    if(!d || d.user_id !== p.user_id || d.location_id !== p.location_id || d.business_id !== p.business_id) throw new DomainError('DEVICE_NOT_REGISTERED','Registra este dispositivo antes de sincronizar.',403);
    const key = `${p.business_id}:${op.operation_id}`, idem = `${p.business_id}:${op.idempotency_key}`;
    const hash = digest(JSON.stringify(op));const priorKey = this.keys.get(idem);const previous = this.receipts.get(key) || (priorKey ? this.receipts.get(priorKey) : undefined);
    if(previous) {
      if(previous.hash !== hash || previous.actor !== p.user_id) throw new DomainError('IDEMPOTENCY_MISMATCH','La clave ya existe con otro contenido.',409);
      return structuredClone(previous.ack);
    }
    const current = this.products.get(op.entity_id);
    if(current && current.business_id !== p.business_id) throw new DomainError('FORBIDDEN','El identificador pertenece a otro negocio.',403);
    let ack: Ack;
    if((current?.version || 0) !== op.base_version) ack = { operation_id:op.operation_id,status:'CONFLICT',code:'VERSION_CONFLICT',message:'El producto cambió en otro dispositivo.',product:current };
    else if([...this.products.values()].some(x=>x.business_id===p.business_id&&x.sku===op.payload.sku&&x.id!==op.entity_id)) ack = { operation_id:op.operation_id,status:'REQUIRES_REVIEW',code:'SKU_EXISTS',message:'Ya existe un producto con esa referencia.' };
    else if(!units.some(u=>u.id===op.payload.unit_id)) ack = { operation_id:op.operation_id,status:'REQUIRES_REVIEW',code:'INVALID_UNIT',message:'La unidad no existe.' };
    else {
      const product = {...op.payload,id:op.entity_id,business_id:p.business_id,version:op.base_version+1,updated_at:new Date().toISOString()};
      this.products.set(product.id,product);ack = { operation_id:op.operation_id,status:'SYNCED',product };
      for(const l of this.locations.values()) if(l.business_id===p.business_id) { const feed = this.feed.get(l.id)||[];feed.push({cursor:feed.length+1,product:structuredClone(product)});this.feed.set(l.id,feed); }
    }
    this.receipts.set(key,{hash,actor:p.user_id,ack:structuredClone(ack)});this.keys.set(idem,key);return structuredClone(ack);
  }
  async changes(p: Principal,cursor: number) {
    requirePermission(p,'products.read');const list = (this.feed.get(p.location_id)||[]).filter(x=>x.cursor>cursor);const changes = structuredClone(list.slice(0,100));
    return { changes,cursor:changes.at(-1)?.cursor||cursor,has_more:list.length>100 };
  }
  async close() {}
}
