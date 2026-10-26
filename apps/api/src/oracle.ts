import oracledb from 'oracledb';
import { randomUUID } from 'node:crypto';
import { assertScope, DomainError, requirePermission } from '../../../packages/shared/domain.js';
import type { Ack, Context, Operation, Principal, Product, Location } from '../../../packages/shared/domain.js';
import type { Repository, Session, Setup } from './repository.js';
import { digest } from './password.js';
import { effectivePermissions, roleTemplates } from '../../../packages/shared/administration.js';
import type { LocationInput, UserWrite } from '../../../packages/shared/administration.js';
import { OracleAdministration } from './oracle-administration.js';
import { oracleSettings } from './oracle-settings.js';
type Row = Record<string, any>;
export async function createOraclePool() {
  oracledb.fetchAsString = [oracledb.CLOB];
  const settings=oracleSettings();
  // Bound connection retries so ACL/authentication failures reach the user
  // instead of remaining in background pool creation behind a queue timeout.
  settings.connectString=settings.connectString.replace(/\(\s*retry_count\s*=\s*\d+\s*\)/gi,'(retry_count=1)').replace(/\(\s*retry_delay\s*=\s*\d+\s*\)/gi,'(retry_delay=1)');
  return oracledb.createPool({ ...settings,connectTimeout:10,transportConnectTimeout:5,retryCount:1,retryDelay:1,
    poolMin:0,poolMax:10,poolIncrement:1,queueTimeout:15000 });
}
export async function rows(c: oracledb.Connection,sql: string,binds: oracledb.BindParameters = {}): Promise<Row[]> {
  return (await c.execute<Row>(sql,binds,{outFormat:oracledb.OUT_FORMAT_OBJECT})).rows || [];
}
const location = (r: Row): Location => ({id:r.ID,business_id:r.BUSINESS_ID,name:r.NAME,slug:r.SLUG,color:r.COLOR,active:r.ACTIVE===1});
const product = (r: Row): Product => ({id:r.ID,business_id:r.BUSINESS_ID,name:r.NAME,sku:r.SKU,category:r.CATEGORY,price_minor:r.PRICE_MINOR,kind:r.KIND,unit_id:r.UNIT_ID,active:r.ACTIVE===1,version:r.VERSION,updated_at:new Date(r.UPDATED_AT).toISOString()});
const productSelect = "SELECT p.id,p.business_id,p.name,p.sku,c.name category,TO_CHAR(p.price_minor,'FM999999999999999999') price_minor,p.kind,p.unit_id,p.active,p.version,p.updated_at FROM products p JOIN product_categories c ON c.id=p.category_id AND c.business_id=p.business_id";
const toSession = (r?: Row): Session|undefined => r ? {id:r.ID,business_id:r.BUSINESS_ID,user_id:r.USER_ID,refresh_hash:r.REFRESH_HASH,expires_at:new Date(r.EXPIRES_AT).getTime(),revoked:r.REVOKED===1} : undefined;
export class OracleRepository implements Repository {
  constructor(public pool: oracledb.Pool) {}
  async health(){try{return await this.using(async c=>{await c.execute('SELECT 1 FROM dual');return true;});}catch{return false;}}
  async setupRequired(){return this.using(async c=>{const [r]=await rows(c,'SELECT COUNT(*) n FROM businesses');return r.N===0;});}
  administration(actor:string){return new OracleAdministration(this.pool).load(actor);}
  saveLocation(actor:string,id:string|undefined,input:LocationInput){return new OracleAdministration(this.pool).location(actor,id,input);}
  saveUser(actor:string,id:string|undefined,input:UserWrite,locationId?:string){return new OracleAdministration(this.pool).user(actor,id,input,locationId);}
  async using<T>(fn: (c: oracledb.Connection)=>Promise<T>): Promise<T> {
    const c = await this.pool.getConnection();try {return await fn(c);} finally {await c.close();}
  }
  async findUser(slug: string,username: string) {return this.using(async c=>{
    const [r] = await rows(c,'SELECT u.*, b.slug FROM users u JOIN businesses b ON b.id=u.business_id WHERE b.slug=:slug AND u.username=:username AND u.active=1',{slug,username});
    return r ? {id:r.ID,business_id:r.BUSINESS_ID,business_slug:r.SLUG,name:r.FULL_NAME,username:r.USERNAME,password_hash:r.PASSWORD_HASH} : undefined;
  });}
  async context(userId: string): Promise<Context> {return this.using(async c=>{
    await c.execute('SET TRANSACTION READ ONLY');
    const [u] = await rows(c,'SELECT u.*,b.slug FROM users u JOIN businesses b ON b.id=u.business_id WHERE u.id=:id AND u.active=1',{id:userId});
    if(!u) throw new DomainError('UNAUTHORIZED','Usuario no disponible.',401);
    const grants=await rows(c,'SELECT location_id,role_code FROM user_location_roles WHERE user_id=:id AND business_id=:b',{id:userId,b:u.BUSINESS_ID});
    const is_owner=grants.some(g=>g.ROLE_CODE==='OWNER');
    const lr=await rows(c,'SELECT * FROM locations WHERE business_id=:b AND active=1 ORDER BY name',{b:u.BUSINESS_ID});
    const allowed=lr.filter(l=>is_owner||grants.some(g=>g.LOCATION_ID===l.ID));
    const overrides=await rows(c,'SELECT location_id,permission_code,effect FROM user_location_permissions WHERE user_id=:id AND business_id=:b',{id:userId,b:u.BUSINESS_ID});
    const rp=await rows(c,'SELECT * FROM role_permissions');
    const templates=roleTemplates.map(r=>({...r,permissions:rp.filter(p=>p.ROLE_CODE===r.code).map(p=>p.PERMISSION_CODE)}));
    const permissions=Object.fromEntries(allowed.map(l=>[l.ID,effectivePermissions(is_owner?['OWNER']:grants.filter(g=>g.LOCATION_ID===l.ID).map(g=>g.ROLE_CODE),Object.fromEntries(overrides.filter(o=>o.LOCATION_ID===l.ID).map(o=>[o.PERMISSION_CODE,o.EFFECT])),templates)]));
    return {user:{id:u.ID,business_id:u.BUSINESS_ID,business_slug:u.SLUG,name:u.FULL_NAME,username:u.USERNAME},locations:allowed.map(location),permissions,is_owner,roles:Object.fromEntries(allowed.map(l=>[l.ID,is_owner?['OWNER']:grants.filter(g=>g.LOCATION_ID===l.ID).map(g=>g.ROLE_CODE)]))};
  });}
  async setup(input: Setup) {
    const id = await this.using(async c=>{try {
      const lock=await rows(c,'SELECT id FROM setup_lock WHERE id=1 FOR UPDATE');
      if(!lock.length)throw new DomainError('SETUP_NOT_READY','Falta el registro de instalación de la migración 001.',409);
      const [count] = await rows(c,'SELECT COUNT(*) n FROM businesses');
      if(count.N) throw new DomainError('SETUP_COMPLETE','La configuración inicial ya fue realizada.',409);
      const b = randomUUID(), u = randomUUID();
      await c.execute('INSERT INTO businesses(id,slug,name,settings) VALUES (:id,:slug,:name,:settings)',{id:b,slug:input.slug,name:input.business_name,settings:JSON.stringify({currency:'COP',locale:'es-CO',allow_negative_stock:false})});
      await c.execute('INSERT INTO users(id,business_id,username,full_name,password_hash) VALUES (:id,:b,:username,:name,:hash)',{id:u,b,username:input.username,name:input.name,hash:input.password_hash});
      const locations=input.locations||[{name:input.location_name!,slug:'principal',color:'#a47a47',active:true}];
      for(const x of locations){const l=randomUUID();
        await c.execute('INSERT INTO locations(id,business_id,slug,name,color,active) VALUES (:id,:b,:slug,:name,:color,:active)',{id:l,b,slug:x.slug,name:x.name,color:x.color,active:x.active?1:0});
        await c.execute("INSERT INTO user_location_roles VALUES (:b,:u,:l,'OWNER')",{b,u,l});
      }
      await c.commit();return u;
    } catch(e) {await c.rollback();throw e;}});
    return this.context(id);
  }
  async saveSession(s: Session) {await this.using(async c=>{await c.execute('INSERT INTO auth_sessions(id,business_id,user_id,refresh_hash,expires_at) VALUES (:id,:b,:u,:h,:expires)',{id:s.id,b:s.business_id,u:s.user_id,h:s.refresh_hash,expires:new Date(s.expires_at)});await c.commit();});}
  async getSession(id: string) {return this.using(async c=>toSession((await rows(c,'SELECT * FROM auth_sessions WHERE id=:id',{id}))[0]));}
  async rotateSession(oldHash: string,newHash: string) {return this.using(async c=>{
    const [r] = await rows(c,'SELECT * FROM auth_sessions WHERE refresh_hash=:h AND revoked=0 AND expires_at>SYSTIMESTAMP FOR UPDATE',{h:oldHash});
    if(!r)return undefined;
    await c.execute('UPDATE auth_sessions SET refresh_hash=:n WHERE id=:id',{n:newHash,id:r.ID});await c.commit();return toSession({...r,REFRESH_HASH:newHash});
  });}
  async revokeSession(id: string) {await this.using(async c=>{await c.execute('UPDATE auth_sessions SET revoked=1 WHERE id=:id',{id});await c.commit();});}
  async registerDevice(p: Principal,id: string,name: string) {await this.using(async c=>{try {
    const [d] = await rows(c,'SELECT * FROM devices WHERE id=:id FOR UPDATE',{id});
    if(d && (d.BUSINESS_ID!==p.business_id || d.LOCATION_ID!==p.location_id || d.USER_ID!==p.user_id)) throw new DomainError('DEVICE_SCOPE','Este dispositivo pertenece a otro contexto.',409);
    if(d)await c.execute('UPDATE devices SET name=:name,last_seen=SYSTIMESTAMP WHERE id=:id',{name,id});
    else await c.execute("INSERT INTO devices(id,business_id,location_id,user_id,name,app_version) VALUES (:id,:b,:l,:u,:name,'0.1.0')",{id,b:p.business_id,l:p.location_id,u:p.user_id,name});
    await c.commit();
  } catch(e){await c.rollback();throw e;}});}
  async bootstrap(p: Principal) {requirePermission(p,'products.read');return this.using(async c=>{
    await c.execute('SET TRANSACTION READ ONLY');
    const [l] = await rows(c,'SELECT * FROM locations WHERE id=:l AND business_id=:b',{l:p.location_id,b:p.business_id});
    if(!l)throw new DomainError('FORBIDDEN','Sucursal no disponible.',403);
    const products = (await rows(c,productSelect+' WHERE p.business_id=:b ORDER BY p.name',{b:p.business_id})).map(product);
    const ingredients = p.permissions.includes('inventory.read')?(await rows(c,"SELECT id,name,unit_id,TO_CHAR(cost_minor,'FM999999999999999999') cost_minor FROM ingredients WHERE business_id=:b",{b:p.business_id})).map(r=>({id:r.ID,name:r.NAME,unit_id:r.UNIT_ID,cost_minor:r.COST_MINOR})):[];
    const units = (await rows(c,'SELECT id,name,dimension,TO_CHAR(factor,\'TM9\',\'NLS_NUMERIC_CHARACTERS=\'\'.,\'\'\') factor FROM units_of_measure')).map(r=>({id:r.ID,name:r.NAME,dimension:r.DIMENSION,factor:r.FACTOR}));
    return {location:location(l),products,ingredients,units,cursor:l.CHANGE_CURSOR};
  });}
  async apply(p: Principal,op: Operation): Promise<Ack> {
    requirePermission(p,'products.write');assertScope(p,op);
    return this.using(async c=>{try {
      // All catalog writes lock locations in stable order: commit-ordered feed and cross-device serialization.
      const scopes = await rows(c,'SELECT id,change_cursor FROM locations WHERE business_id=:b ORDER BY id FOR UPDATE',{b:p.business_id});
      const [d] = await rows(c,'SELECT id FROM devices WHERE id=:id AND business_id=:b AND location_id=:l AND user_id=:u',{id:op.device_id,b:p.business_id,l:p.location_id,u:p.user_id});
      if(!d)throw new DomainError('DEVICE_NOT_REGISTERED','Registra este dispositivo antes de sincronizar.',403);
      const hash = digest(JSON.stringify(op));
      const [receipt] = await rows(c,'SELECT * FROM sync_operations WHERE business_id=:b AND (operation_id=:id OR idempotency_key=:key)',{b:p.business_id,id:op.operation_id,key:op.idempotency_key});
      if(receipt) {
        if(receipt.PAYLOAD_HASH!==hash || receipt.USER_ID!==p.user_id)throw new DomainError('IDEMPOTENCY_MISMATCH','La clave ya existe con otro contenido.',409);
        return JSON.parse(receipt.RESULT) as Ack;
      }
      const [r] = await rows(c,productSelect+' WHERE p.id=:id',{id:op.entity_id});const current = r ? product(r) : undefined;
      if(current && current.business_id!==p.business_id)throw new DomainError('FORBIDDEN','El identificador pertenece a otro negocio.',403);
      let ack: Ack;
      if((current?.version||0)!==op.base_version)ack={operation_id:op.operation_id,status:'CONFLICT',code:'VERSION_CONFLICT',message:'El producto cambió en otro dispositivo.',product:current};
      else {
        const [sku] = await rows(c,'SELECT id FROM products WHERE business_id=:b AND sku=:sku AND id<>:id',{b:p.business_id,sku:op.payload.sku,id:op.entity_id});
        const [unit] = await rows(c,'SELECT id FROM units_of_measure WHERE id=:id',{id:op.payload.unit_id});
        if(sku)ack={operation_id:op.operation_id,status:'REQUIRES_REVIEW',code:'SKU_EXISTS',message:'Ya existe un producto con esa referencia.'};
        else if(!unit)ack={operation_id:op.operation_id,status:'REQUIRES_REVIEW',code:'INVALID_UNIT',message:'La unidad no existe.'};
        else {
          const x=op.payload;const [category]=await rows(c,'SELECT id FROM product_categories WHERE business_id=:b AND name=:name',{b:p.business_id,name:x.category});
          const categoryId=category?.ID||randomUUID();
          if(!category)await c.execute('INSERT INTO product_categories(id,business_id,name) VALUES (:id,:b,:name)',{id:categoryId,b:p.business_id,name:x.category});
          const bind={id:op.entity_id,b:p.business_id,name:x.name,sku:x.sku,category:categoryId,price:x.price_minor,kind:x.kind,unit:x.unit_id,active:x.active?1:0,v:op.base_version+1};
          if(current) await c.execute('UPDATE products SET name=:name,sku=:sku,category_id=:category,price_minor=TO_NUMBER(:price),kind=:kind,unit_id=:unit,active=:active,version=:v,updated_at=SYSTIMESTAMP WHERE id=:id AND business_id=:b',bind);
          else await c.execute('INSERT INTO products(id,business_id,name,sku,category_id,price_minor,kind,unit_id,active,version) VALUES (:id,:b,:name,:sku,:category,TO_NUMBER(:price),:kind,:unit,:active,:v)',bind);
          const updated = product((await rows(c,productSelect+' WHERE p.id=:id AND p.business_id=:b',{id:op.entity_id,b:p.business_id}))[0]);
          ack={operation_id:op.operation_id,status:'SYNCED',product:updated};
          for(const scope of scopes) {
            await c.execute('UPDATE locations SET change_cursor=change_cursor+1 WHERE id=:id AND business_id=:b',{id:scope.ID,b:p.business_id});
            await c.execute('INSERT INTO change_feed(business_id,location_id,cursor_value,product_json) VALUES (:b,:l,:cursor,:json)',{b:p.business_id,l:scope.ID,cursor:scope.CHANGE_CURSOR+1,json:JSON.stringify(updated)});
          }
        }
      }
      await c.execute('INSERT INTO sync_operations(business_id,operation_id,idempotency_key,location_id,device_id,user_id,payload_hash,entity_id,operation_type,client_created_at,status,payload,result) VALUES (:b,:id,:key,:l,:d,:u,:hash,:entity,:type,:created,:status,:payload,:result)',{b:p.business_id,id:op.operation_id,key:op.idempotency_key,l:p.location_id,d:op.device_id,u:p.user_id,hash,entity:op.entity_id,type:op.operation_type,created:new Date(op.client_created_at),status:ack.status,payload:JSON.stringify(op),result:JSON.stringify(ack)});
      await c.execute('INSERT INTO audit_log(id,business_id,location_id,user_id,device_id,operation_id,action,entity_id,before_json,after_json) VALUES (:id,:b,:l,:u,:d,:op,:action,:entity,:before,:after)',{id:randomUUID(),b:p.business_id,l:p.location_id,u:p.user_id,d:op.device_id,op:op.operation_id,action:ack.status==='SYNCED'?'PRODUCT_UPSERT':'SYNC_REVIEW',entity:op.entity_id,before:current?JSON.stringify(current):null,after:JSON.stringify(ack)});
      await c.execute('UPDATE devices SET last_seen=SYSTIMESTAMP WHERE id=:id',{id:op.device_id});
      await c.commit();return ack;
    }catch(e){await c.rollback();throw e;}});
  }
  async changes(p: Principal,cursor: number) {requirePermission(p,'products.read');return this.using(async c=>{
    const found = await rows(c,'SELECT cursor_value,product_json FROM change_feed WHERE business_id=:b AND location_id=:l AND cursor_value>:cursor ORDER BY cursor_value FETCH FIRST 101 ROWS ONLY',{b:p.business_id,l:p.location_id,cursor});
    const changes=found.slice(0,100).map(r=>({cursor:r.CURSOR_VALUE,product:JSON.parse(r.PRODUCT_JSON) as Product}));
    return {changes,cursor:changes.at(-1)?.cursor||cursor,has_more:found.length>100};
  });}
  async close(){await this.pool.close(5);}
}
