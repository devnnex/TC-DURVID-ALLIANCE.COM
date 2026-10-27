import type oracledb from 'oracledb';
import { randomUUID } from 'node:crypto';
import { DomainError, type Context } from '../../../packages/shared/domain.js';
import { roleTemplates, sections, effectivePermissions, assertUserGrant } from '../../../packages/shared/administration.js';
import type { Administration, LocationInput, ManagedUser, ProfileWrite, UserWrite } from '../../../packages/shared/administration.js';
import { rows } from './oracle.js';

// Administration is online and transactional. Every mutation serializes on
// the business, checks the owner again, and writes a separate audit event.
export class OracleAdministration {
  constructor(private pool:oracledb.Pool){}
  async profile(actor:string):Promise<ManagedUser>{
    const c=await this.pool.getConnection();try{
      const [u]=await rows(c,'SELECT id,business_id,full_name,username,active FROM users WHERE id=:id AND active=1',{id:actor});
      if(!u)throw new DomainError('UNAUTHORIZED','Usuario no disponible.',401);
      const grants=await rows(c,'SELECT * FROM user_location_roles WHERE business_id=:b AND user_id=:id',{b:u.BUSINESS_ID,id:actor}),overrides=await rows(c,'SELECT * FROM user_location_permissions WHERE business_id=:b AND user_id=:id',{b:u.BUSINESS_ID,id:actor});
      return {id:actor,name:u.FULL_NAME,username:u.USERNAME,active:true,protected:grants.some(g=>g.ROLE_CODE==='OWNER'),access:[...new Set(grants.map(g=>g.LOCATION_ID))].map(location_id=>({location_id,roles:grants.filter(g=>g.LOCATION_ID===location_id).map(g=>g.ROLE_CODE),overrides:Object.fromEntries(overrides.filter(o=>o.LOCATION_ID===location_id).map(o=>[o.PERMISSION_CODE,o.EFFECT]))}))};
    }finally{await c.close();}
  }
  async saveProfile(actor:string,input:ProfileWrite,sessionId:string){
    const c=await this.pool.getConnection();try{
      const [u]=await rows(c,'SELECT id,business_id FROM users WHERE id=:id AND active=1',{id:actor});if(!u)throw new DomainError('UNAUTHORIZED','Usuario no disponible.',401);
      await rows(c,'SELECT id FROM businesses WHERE id=:b FOR UPDATE',{b:u.BUSINESS_ID});
      const [before]=await rows(c,'SELECT id,full_name,username FROM users WHERE id=:id AND business_id=:b AND active=1 FOR UPDATE',{id:actor,b:u.BUSINESS_ID});if(!before)throw new DomainError('UNAUTHORIZED','Usuario no disponible.',401);
      await c.execute('UPDATE users SET full_name=:name,username=:username WHERE id=:id AND business_id=:b',{id:actor,b:u.BUSINESS_ID,name:input.name,username:input.username});
      if(input.password_hash){await c.execute('UPDATE users SET password_hash=:hash WHERE id=:id AND business_id=:b',{id:actor,b:u.BUSINESS_ID,hash:input.password_hash});await c.execute('UPDATE auth_sessions SET revoked=1 WHERE business_id=:b AND user_id=:id AND id<>:sid',{b:u.BUSINESS_ID,id:actor,sid:sessionId});}
      await this.audit(c,actor,u.BUSINESS_ID,'USER_PROFILE_SAVE',actor,before,{name:input.name,username:input.username,password_changed:!!input.password_hash});await c.commit();
    }catch(e){await c.rollback();if((e as {errorNum?:number}).errorNum===1)throw new DomainError('USERNAME_EXISTS','Ya existe un usuario con ese nombre.',409);throw e;}finally{await c.close();}
  }
  private async owner(c:oracledb.Connection,id:string){
    const [u]=await rows(c,'SELECT u.* FROM users u WHERE u.id=:id AND u.active=1',{id});if(!u)throw new DomainError('FORBIDDEN','Usuario no disponible.',403);
    const b=u.BUSINESS_ID,grants=await rows(c,'SELECT * FROM user_location_roles WHERE business_id=:b AND user_id=:id',{b,id}),overrides=await rows(c,'SELECT * FROM user_location_permissions WHERE business_id=:b AND user_id=:id',{b,id}),locations=await rows(c,'SELECT * FROM locations WHERE business_id=:b',{b});
    const is_owner=grants.some(g=>g.ROLE_CODE==='OWNER'),permissions:Record<string,string[]>=Object.fromEntries(locations.filter(l=>is_owner||grants.some(g=>g.LOCATION_ID===l.ID)).map(l=>[l.ID,effectivePermissions(is_owner?['OWNER']:grants.filter(g=>g.LOCATION_ID===l.ID).map(g=>g.ROLE_CODE),Object.fromEntries(overrides.filter(o=>o.LOCATION_ID===l.ID).map(o=>[o.PERMISSION_CODE,o.EFFECT])))]));
    const context:Context={user:{id:u.ID,business_id:b,business_slug:'',name:u.FULL_NAME,username:u.USERNAME},locations:[],is_owner,permissions};if(!Object.values(permissions).some(p=>p.includes('administration.manage')))throw new DomainError('FORBIDDEN','No tienes permiso para gestionar usuarios.',403);return {...u,BUSINESS_ID:b,TEAM_CONTEXT:context};
  }
  private async transaction(actor:string,fn:(c:oracledb.Connection,b:string,context:Context)=>Promise<void>){
    const c=await this.pool.getConnection();try{
      const u=await this.owner(c,actor);
      await rows(c,'SELECT id FROM businesses WHERE id=:b FOR UPDATE',{b:u.BUSINESS_ID});
      const current=await this.owner(c,actor);await fn(c,u.BUSINESS_ID,current.TEAM_CONTEXT);await c.commit();
    }catch(e){await c.rollback();if((e as {errorNum?:number}).errorNum===1)throw new DomainError('DUPLICATE','El identificador o usuario ya existe.',409);throw e;}finally{await c.close();}
  }
  private async audit(c:oracledb.Connection,actor:string,b:string,action:string,entity:string,before:unknown,after:unknown){
    await c.execute('INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES (:id,:b,:actor,:action,:entity,:before,:after)',{id:randomUUID(),b,actor,action,entity,before:JSON.stringify(before),after:JSON.stringify(after)});
  }
  async load(actor:string):Promise<Administration>{
    const c=await this.pool.getConnection();try{
      await c.execute('SET TRANSACTION READ ONLY');const u=await this.owner(c,actor),b=u.BUSINESS_ID;
      const locations=(await rows(c,'SELECT * FROM locations WHERE business_id=:b ORDER BY name',{b})).filter(l=>u.TEAM_CONTEXT.permissions[l.ID]?.includes('administration.manage')).map(r=>({id:r.ID,business_id:b,name:r.NAME,slug:r.SLUG,color:r.COLOR,active:r.ACTIVE===1}));
      let users:ManagedUser[]=(await rows(c,'SELECT id,full_name,username,active FROM users WHERE business_id=:b ORDER BY full_name',{b})).map(r=>({id:r.ID,name:r.FULL_NAME,username:r.USERNAME,active:r.ACTIVE===1,protected:false,access:[]}));
      const grants=await rows(c,'SELECT * FROM user_location_roles WHERE business_id=:b',{b});
      const overrides=await rows(c,'SELECT * FROM user_location_permissions WHERE business_id=:b',{b});
      for(const user of users){
        user.protected=grants.some(g=>g.USER_ID===user.id&&g.ROLE_CODE==='OWNER');
        for(const l of locations){const roles=grants.filter(g=>g.USER_ID===user.id&&g.LOCATION_ID===l.id).map(g=>g.ROLE_CODE);if(!roles.length)continue;
          user.access.push({location_id:l.id,roles,overrides:Object.fromEntries(overrides.filter(o=>o.USER_ID===user.id&&o.LOCATION_ID===l.id).map(o=>[o.PERMISSION_CODE,o.EFFECT]))});}
      }
      users=users.filter(user=>u.TEAM_CONTEXT.is_owner||user.access.some(a=>locations.some(l=>l.id===a.location_id)));
      const history=await rows(c,"SELECT h.entity_id,h.actor_user_id,h.before_json,h.created_at,u.full_name FROM administration_audit h LEFT JOIN users u ON u.id=h.actor_user_id AND u.business_id=h.business_id WHERE h.business_id=:b AND h.action='USER_ACCESS_SAVE' ORDER BY h.created_at,h.id",{b});
      for(const row of history){const member=users.find(m=>m.id===row.ENTITY_ID);if(!member)continue;const at=new Date(row.CREATED_AT).toISOString();if(row.BEFORE_JSON===null&&!member.createdBy)Object.assign(member,{createdBy:row.ACTOR_USER_ID,createdByName:row.FULL_NAME,createdAt:at});Object.assign(member,{updatedBy:row.ACTOR_USER_ID,updatedByName:row.FULL_NAME,updatedAt:at});}
      const rp=await rows(c,'SELECT * FROM role_permissions');
      const roles=roleTemplates.map(r=>({...r,permissions:rp.filter(p=>p.ROLE_CODE===r.code).map(p=>p.PERMISSION_CODE)}));
      return {locations,users,roles,sections};
    }finally{await c.close();}
  }
  async location(actor:string,id:string|undefined,input:LocationInput){await this.transaction(actor,async(c,b,context)=>{
    if(!context.is_owner)throw new DomainError('FORBIDDEN','Solo el jefe principal administra sucursales.',403);
    const [existing]=id?await rows(c,'SELECT * FROM locations WHERE business_id=:b AND id=:id',{b,id}):[];
    if(id&&!existing)throw new DomainError('NOT_FOUND','Sucursal no disponible.',404);
    const [count]=await rows(c,'SELECT COUNT(*) n FROM locations WHERE business_id=:b AND active=1 AND id<>:id',{b,id:id||'new'});
    if(!input.active&&!count.N)throw new DomainError('LAST_LOCATION','Conserva al menos una sucursal habilitada.',409);
    const entity=id||randomUUID(),bind={id:entity,b,slug:input.slug,name:input.name,color:input.color,active:input.active?1:0};
    if(id)await c.execute('UPDATE locations SET slug=:slug,name=:name,color=:color,active=:active WHERE id=:id AND business_id=:b',bind);
    else await c.execute('INSERT INTO locations(id,business_id,slug,name,color,active) VALUES (:id,:b,:slug,:name,:color,:active)',bind);
    await this.audit(c,actor,b,'LOCATION_SAVE',entity,existing?{name:existing.NAME,slug:existing.SLUG,color:existing.COLOR,active:existing.ACTIVE===1}:null,input);
  });}
  async user(actor:string,id:string|undefined,input:UserWrite,locationId?:string){await this.transaction(actor,async(c,b,context)=>{
    const [existing]=id?await rows(c,'SELECT id,full_name,username,active FROM users WHERE business_id=:b AND id=:id',{b,id}):[];
    if(id&&!existing)throw new DomainError('NOT_FOUND','Usuario no disponible.',404);
    const prior=id?await rows(c,'SELECT * FROM user_location_roles WHERE business_id=:b AND user_id=:id',{b,id}):[];
    if(prior.some(g=>g.ROLE_CODE==='OWNER'))throw new DomainError('PROTECTED_OWNER','La cuenta del propietario está protegida.',409);
    if(!id&&!input.password_hash)throw new DomainError('PASSWORD_REQUIRED','Define la contraseña del nuevo usuario.');
    if(input.access.some(a=>(a.roles as string[]).includes('OWNER')))throw new DomainError('FORBIDDEN','El rol propietario está protegido.',403);
    const locations=await rows(c,'SELECT id FROM locations WHERE business_id=:b',{b});
    if(input.access.some(a=>!locations.some(l=>l.ID===a.location_id)))throw new DomainError('FORBIDDEN','Una sucursal pertenece a otro negocio.',403);
    const oldOverrides=id?await rows(c,'SELECT location_id,permission_code,effect FROM user_location_permissions WHERE business_id=:b AND user_id=:id',{b,id}):[];
    const oldAccess=[...new Set(prior.map(g=>g.LOCATION_ID))].map(location_id=>({location_id,roles:prior.filter(g=>g.LOCATION_ID===location_id).map(g=>g.ROLE_CODE),overrides:Object.fromEntries(oldOverrides.filter(o=>o.LOCATION_ID===location_id).map(o=>[o.PERMISSION_CODE,o.EFFECT]))}));
    assertUserGrant(context,existing?{id:id!,name:existing.FULL_NAME,username:existing.USERNAME,active:existing.ACTIVE===1,protected:false,access:oldAccess}:undefined,input,locationId);
    const entity=id||randomUUID(),bind={id:entity,b,username:input.username,name:input.name,active:input.active?1:0};
    const beforeOverrides=id?await rows(c,'SELECT location_id,permission_code,effect FROM user_location_permissions WHERE business_id=:b AND user_id=:id',{b,id}):[];
    if(id){
      await c.execute('UPDATE users SET full_name=:name,username=:username,active=:active WHERE business_id=:b AND id=:id',bind);
      if(input.password_hash)await c.execute('UPDATE users SET password_hash=:hash WHERE business_id=:b AND id=:id',{id,b,hash:input.password_hash});
    }else await c.execute('INSERT INTO users(id,business_id,username,full_name,active,password_hash) VALUES (:id,:b,:username,:name,:active,:hash)',{...bind,hash:input.password_hash!});
    await c.execute('DELETE FROM user_location_permissions WHERE business_id=:b AND user_id=:id'+(locationId?' AND location_id=:scope':''),{b,id:entity,...(locationId?{scope:locationId}:{})});
    await c.execute('DELETE FROM user_location_roles WHERE business_id=:b AND user_id=:id'+(locationId?' AND location_id=:scope':''),{b,id:entity,...(locationId?{scope:locationId}:{})});
    for(const a of input.access){
      for(const role of new Set(a.roles))await c.execute('INSERT INTO user_location_roles(business_id,user_id,location_id,role_code) VALUES (:b,:u,:l,:role)',{b,u:entity,l:a.location_id,role});
      for(const [permission,effect] of Object.entries(a.overrides))await c.execute('INSERT INTO user_location_permissions(business_id,user_id,location_id,permission_code,effect) VALUES (:b,:u,:l,:permission,:effect)',{b,u:entity,l:a.location_id,permission,effect});
    }
    await c.execute('UPDATE auth_sessions SET revoked=1 WHERE business_id=:b AND user_id=:id',{b,id:entity});
    const {password_hash:_,...safe}=input;
    await this.audit(c,actor,b,'USER_ACCESS_SAVE',entity,{user:existing||null,roles:prior,overrides:beforeOverrides},{...safe,password_changed:!!input.password_hash});
  });}
}
