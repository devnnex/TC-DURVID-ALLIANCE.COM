import {randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import type oracledb from 'oracledb';
import {createApp} from '../apps/api/src/app';
import {MemoryRepository} from '../apps/api/src/memory';
import {OracleRepository} from '../apps/api/src/oracle';
import {defaultLocations,sectionOverrides,type UserWrite} from '../packages/shared/administration';
import {hashPassword} from '../apps/api/src/password';

describe('Cuenta propia y aislamiento de usuarios',()=>{
 it('todos los roles editan sus credenciales sin cambiar accesos ni consultar cuentas ajenas',async()=>{
  const repo=new MemoryRepository(),root=await repo.setup({slug:'account-test',business_name:'Cuenta',name:'Principal',username:'root',password_hash:await hashPassword('Root1234'),locations:defaultLocations});
  const app=await createApp(repo,{secret:randomUUID()+randomUUID(),setupToken:'',provider:'memory',origin:'http://localhost:5173',production:false});app.log.level='silent';
  let logins=0;
  const login=async(username:string,password='Pass1234')=>{const r=await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:'127.0.1.'+(++logins),payload:{business_slug:'account-test',username,password}});expect(r.statusCode).toBe(200);return {authorization:'Bearer '+r.json().access_token};};
  try{
   expect((await app.inject({url:'/api/v1/account'})).statusCode).toBe(401);
   const roles=['WORKER','WAITER','ADMIN','BOSS','KITCHEN','CASHIER'] as const;
   for(const [i,role] of roles.entries()){
    const location=root.locations[i%3],username='persona'+i,access:UserWrite['access']=[{location_id:location.id,roles:[role],overrides:role==='ADMIN'?sectionOverrides(['Inicio','Usuarios']):{}}];
    await repo.saveUser(root.user.id,undefined,{name:role,username,active:true,password_hash:await hashPassword('Pass1234'),access});
    const member=[...repo.managed.values()].find(u=>u.username===username)!,before=structuredClone(member),auth=await login(username),otherSession=await login(username);
    const profile=await app.inject({url:'/api/v1/account',headers:auth});expect(profile.statusCode).toBe(200);expect(profile.json()).toEqual(before);expect(profile.json()).not.toHaveProperty('password_hash');
    const manager=['BOSS','ADMIN'].includes(role);
    expect((await app.inject({url:'/api/v1/admin/overview',headers:auth})).statusCode).toBe(manager?200:403);
    for(const extra of [{id:root.user.id},{active:false},{access:[]},{roles:['BOSS']},{sections:['Usuarios']}])expect((await app.inject({method:'PUT',url:'/api/v1/account',headers:auth,payload:{name:'Escalada',username,...extra}})).statusCode).toBe(400);
    if(!manager)for(const method of ['POST','PUT'] as const)expect((await app.inject({method,url:'/api/v1/admin/users'+(method==='PUT'?'/'+root.user.id:''),headers:auth,payload:{name:'Ajeno',username:'ajeno',active:true,password:'Pass1234',access}})).statusCode).toBe(403);
    expect((await app.inject({method:'PUT',url:'/api/v1/account',headers:auth,payload:{name:'Duplicado',username:'root'}})).statusCode).toBe(409);
    expect(repo.managed.get(member.id)).toEqual(before);
    expect((await app.inject({method:'PUT',url:'/api/v1/account',headers:auth,payload:{name:'Nueva persona',username:username+' editado'}})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/context',headers:otherSession})).statusCode).toBe(200);
    expect((await app.inject({method:'PUT',url:'/api/v1/account',headers:auth,payload:{name:'Nueva persona',username:username+' editado',password:'Nuevo!42'}})).statusCode).toBe(200);
    expect(repo.managed.get(member.id)).toMatchObject({access:before.access,active:before.active,protected:before.protected});
    expect((await app.inject({url:'/api/v1/context',headers:auth})).json().user.username).toBe(username+' editado');
    expect((await app.inject({url:'/api/v1/context',headers:otherSession})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'account-test',username:username+' editado',password:'Pass1234'}})).statusCode).toBe(401);
    await login(username+' editado','Nuevo!42');
   }
   const auth=await login('root','Root1234'),before=structuredClone(repo.managed.get(root.user.id));
   expect((await app.inject({method:'PUT',url:'/api/v1/account',headers:auth,payload:{name:'Jefe actualizado',username:'jefe principal',password:'Jefe!42'}})).statusCode).toBe(200);
   expect(repo.managed.get(root.user.id)).toMatchObject({protected:true,active:true,access:before!.access});
   expect((await app.inject({url:'/api/v1/context',headers:auth})).json().is_owner).toBe(true);
   await login('jefe principal','Jefe!42');
  }finally{await app.close();}
 });
 it('Oracle guarda perfil, contraseña, revocación y auditoría en una transacción sin escribir roles',async()=>{
  const actor=randomUUID(),business=randomUUID(),session=randomUUID(),execute=vi.fn(async(sql:string):Promise<any>=>({rows:sql.startsWith('SELECT')?[{ID:actor,BUSINESS_ID:business,FULL_NAME:'Antes',USERNAME:'antes',ACTIVE:1}]:[],rowsAffected:1}));
  const connection={execute,commit:vi.fn(),rollback:vi.fn(),close:vi.fn()},repo=new OracleRepository({getConnection:async()=>connection} as unknown as oracledb.Pool);
  await repo.saveProfile(actor,{name:'Después',username:'despues',password_hash:'private-hash'},session);
  const calls=execute.mock.calls.map(c=>c[0]);expect(calls.some(q=>/user_location_(roles|permissions)/.test(q))).toBe(false);expect(calls.some(q=>q.includes('AND id<>:sid'))).toBe(true);expect(connection.commit).toHaveBeenCalledOnce();
  const audit=(execute.mock.calls as any[]).find(c=>c[0].includes('INSERT INTO administration_audit'));expect(JSON.stringify(audit)).not.toContain('private-hash');
  execute.mockImplementation(async(sql:string)=>{if(sql.startsWith('INSERT INTO administration_audit'))throw new Error('Audit failure');return {rows:[{ID:actor,BUSINESS_ID:business}],rowsAffected:1};});
  await expect(repo.saveProfile(actor,{name:'Otro',username:'otro'},session)).rejects.toThrow('Audit failure');expect(connection.rollback).toHaveBeenCalledOnce();expect(connection.commit).toHaveBeenCalledTimes(1);
 });
});
