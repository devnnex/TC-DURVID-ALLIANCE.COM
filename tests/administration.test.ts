import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type oracledb from 'oracledb';
import { createApp } from '../apps/api/src/app';
import { MemoryRepository } from '../apps/api/src/memory';
import { OracleRepository } from '../apps/api/src/oracle';
import { defaultLocations, effectivePermissions, roleTemplates, userInput } from '../packages/shared/administration';
import { prepareMigration } from '../scripts/sql-migration';

describe('Sucursales y permisos',()=>{
  it('el bloqueo individual prevalece sobre múltiples roles y no permite elevarse a propietario',()=>{
    expect(effectivePermissions(['ADMIN','CASHIER'],{'products.write':'DENY','administration.manage':'ALLOW'})).not.toContain('products.write');
    expect(effectivePermissions(['ADMIN'],{'administration.manage':'ALLOW'})).toContain('administration.manage');
    expect(effectivePermissions(['ADMIN'],{'sales.manage':'ALLOW'})).not.toContain('sales.manage');
    expect(userInput.safeParse({name:'Empleado',username:'empleado',active:true,access:[{location_id:randomUUID(),roles:['OWNER'],overrides:{}}]}).success).toBe(false);
    expect(userInput.safeParse({name:'Empleado',username:'empleado',active:true,access:[{location_id:randomUUID(),roles:['ADMIN'],overrides:{'products.read':'DENY'}}]}).success).toBe(false);
  });
  it('007 conserva la ejecución única y registra los permisos de cada plantilla sin repetir 001–006',async()=>{
    const source=await readFile(new URL('../database/migrations/007_location_access.sql',import.meta.url),'utf8');
    const sql=prepareMigration(source).sql;
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(2);
    expect(sql).toContain('FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id)');
    expect(sql).toContain('FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)');
    const operational=await readFile(new URL('../database/ords/009_operational_schema.sql',import.meta.url),'utf8');
    const operations=await readFile(new URL('../database/ords/011_operations_schema.sql',import.meta.url),'utf8');
    const grants=new Map([...(operational+'\n'+operations).matchAll(/grant_(?:permission|access)\('([^']+)','([^']+)'\)/g)].map(m=>[m[1],m[2].split(',')]));
    const addition=await readFile(new URL('../database/ords/014_team_roles.sql',import.meta.url),'utf8');expect(addition).toContain("r.code IN('OWNER','BOSS')");expect(addition).toContain("'WORKER' role_code");
    for(const r of roleTemplates.filter(r=>!['BOSS','WORKER'].includes(r.code)))for(const p of r.permissions.filter(p=>p!=='sales.manage')){
      if(grants.has(p))expect(grants.get(p)).toContain(r.code);
      else expect(sql).toContain(`SELECT '${r.code}' role_code,'${p}' permission_code FROM dual`);
    }
    expect(sql).not.toContain('CREATE TABLE businesses');
  });
  it('crea todas las sucursales, asigna roles diferentes, aplica bloqueos y revoca sesiones al cambiar accesos',async()=>{
    const repo=new MemoryRepository(),setupToken=randomUUID();const app=await createApp(repo,{secret:randomUUID()+randomUUID(),setupToken,provider:'memory',origin:'http://localhost:5173',production:false});app.log.level='silent';
    try{
      const setup=await app.inject({method:'POST',url:'/api/v1/admin/setup',headers:{'x-setup-token':setupToken},payload:{slug:'alliance',business_name:'Alliance',locations:defaultLocations,name:'Owner',username:'owner',password:'owner-password-test'}});
      expect(setup.statusCode).toBe(200);const owner=setup.json();expect(owner.locations).toHaveLength(3);expect(repo.locations.size).toBe(4);
      const login=async(username:string,password:string)=>app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'alliance',username,password}});
      const ownerLogin=await login('owner','owner-password-test'),auth={authorization:`Bearer ${ownerLogin.json().access_token}`};
      let snapshot=(await app.inject({url:'/api/v1/admin/overview',headers:auth})).json();expect(snapshot.locations).toHaveLength(4);expect(JSON.stringify(snapshot)).not.toContain('password_hash');
      const [first,second]=owner.locations;
      const input={name:'Ana',username:'ana',password:'4826',active:true,access:[{location_id:first.id,roles:['ADMIN'],overrides:{'products.write':'DENY'}},{location_id:second.id,roles:['CASHIER'],overrides:{'activity.read':'DENY'}}]};
      expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers:auth,payload:input})).statusCode).toBe(200);
      snapshot=(await app.inject({url:'/api/v1/admin/overview',headers:auth})).json();const ana=snapshot.users.find((u:any)=>u.username==='ana');expect(ana.access).toHaveLength(2);
      for(const invalid of ['123','1234567890123'])expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers:auth,payload:{...input,username:'badlength',password:invalid}})).statusCode).toBe(400);
      const employee=await login('ana',input.password),employeeAuth={authorization:`Bearer ${employee.json().access_token}`};
      expect(employee.json().context.locations).toHaveLength(2);expect(employee.json().context.permissions[first.id]).not.toContain('products.write');expect(employee.json().context.permissions[second.id]).not.toContain('activity.read');
      expect((await app.inject({url:'/api/v1/admin/overview',headers:employeeAuth})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:'/api/v1/admin/locations',headers:employeeAuth,payload:{name:'No',slug:'forbidden',color:'#123456',active:true}})).statusCode).toBe(403);
      expect((await app.inject({url:'/api/v1/bootstrap',headers:{...employeeAuth,'x-location-id':owner.locations[2].id}})).statusCode).toBe(403);
      expect((await app.inject({url:'/api/v1/ingredients',headers:{...employeeAuth,'x-location-id':second.id}})).statusCode).toBe(403);
      const device=randomUUID();expect((await app.inject({method:'POST',url:'/api/v1/devices/register',headers:{...employeeAuth,'x-location-id':first.id},payload:{id:device,name:'Ana'}})).statusCode).toBe(200);
      const op={operation_id:randomUUID(),idempotency_key:randomUUID(),device_id:device,business_id:owner.user.business_id,location_id:first.id,entity_type:'PRODUCT',entity_id:randomUUID(),operation_type:'PRODUCT_UPSERT',payload:{name:'Prueba',sku:'X',category:'Prueba',price_minor:'100',kind:'SIMPLE',unit_id:'u',active:true},base_version:0,client_created_at:new Date().toISOString()};
      const sync=await app.inject({method:'POST',url:'/api/v1/sync',headers:{...employeeAuth,'x-location-id':first.id},payload:{operations:[op]}});expect(sync.json().results[0].code).toBe('FORBIDDEN');expect(repo.products.size).toBe(0);
      expect((await app.inject({method:'PUT',url:`/api/v1/admin/users/${owner.user.id}`,headers:auth,payload:input})).statusCode).toBe(409);
      expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers:auth,payload:{...input,username:'otro',access:[{location_id:randomUUID(),roles:['CASHIER'],overrides:{}}]}})).statusCode).toBe(403);
      expect(repo.users.size).toBe(2);
      expect((await app.inject({method:'PUT',url:`/api/v1/admin/users/${ana.id}`,headers:auth,payload:{...input,password:undefined,access:[input.access[1]]}})).statusCode).toBe(200);
      expect((await app.inject({url:'/api/v1/context',headers:employeeAuth})).statusCode).toBe(401);
      expect((await app.inject({method:'POST',url:'/api/v1/auth/refresh',cookies:{alliance_refresh:employee.cookies[0].value}})).statusCode).toBe(401);
      expect((await login('ana',input.password)).json().context.locations).toHaveLength(1);
      expect((await app.inject({method:'POST',url:'/api/v1/admin/locations',headers:auth,payload:{name:'Nueva',slug:'nueva',color:'#123456',active:true}})).statusCode).toBe(200);
      expect((await app.inject({url:'/api/v1/context',headers:auth})).json().locations).toHaveLength(4);
      expect(repo.adminAudit).toHaveLength(3);
      for(const l of owner.locations.slice(1))expect((await app.inject({method:'PUT',url:`/api/v1/admin/locations/${l.id}`,headers:auth,payload:{name:l.name,slug:l.slug,color:l.color,active:false}})).statusCode).toBe(200);
      const newLocation=[...repo.locations.values()].find(l=>l.slug==='nueva')!;await repo.saveLocation(owner.user.id,newLocation.id,{...newLocation,active:false});
      expect((await app.inject({method:'PUT',url:`/api/v1/admin/locations/${first.id}`,headers:auth,payload:{name:first.name,slug:first.slug,color:first.color,active:false}})).statusCode).toBe(409);
    }finally{await app.close();}
  });
});

describe('Transacciones de administración Oracle (driver simulado)',()=>{
  const fixture=()=>{
    const actor=randomUUID(),business=randomUUID(),location=randomUUID();
    const execute=vi.fn(async(sql:string,_binds?:any,_options?:any):Promise<any>=>{
      if(sql.includes('SELECT u.* FROM users'))return {rows:[{ID:actor,BUSINESS_ID:business,ACTIVE:1}]};
      if(sql.includes('SELECT id FROM businesses'))return {rows:[{ID:business}]};
      if(sql.includes('FROM locations'))return {rows:[{ID:location,BUSINESS_ID:business}]};
      if(sql.includes('FROM user_location_roles')&&_binds?.id===actor)return {rows:[{USER_ID:actor,LOCATION_ID:location,BUSINESS_ID:business,ROLE_CODE:'OWNER'}]};
      return {rows:[],rowsAffected:1};
    });
    const c={execute,commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{}),close:vi.fn(async()=>{})};
    const repo=new OracleRepository({getConnection:async()=>c} as unknown as oracledb.Pool);
    return {repo,c,actor,business,location};
  };
  it('usuario, roles, excepciones y auditoría se confirman juntos sin guardar hashes en la auditoría',async()=>{
    const {repo,c,actor,location}=fixture();
    await repo.saveUser(actor,undefined,{name:'Ana',username:'ana',active:true,password_hash:'private-hash',access:[{location_id:location,roles:['CASHIER'],overrides:{'products.write':'ALLOW'}}]});
    const queries=c.execute.mock.calls.map(c=>c[0]);
    expect(queries.filter(q=>q.includes('SELECT u.* FROM users'))).toHaveLength(2);
    expect(queries).toContain('SELECT id FROM businesses WHERE id=:b FOR UPDATE');
    expect(queries.some(q=>q.startsWith('INSERT INTO user_location_permissions'))).toBe(true);
    expect(queries.some(q=>q.startsWith('UPDATE auth_sessions SET revoked=1'))).toBe(true);
    const audit=c.execute.mock.calls.find(c=>c[0].startsWith('INSERT INTO administration_audit'))!;
    expect(JSON.stringify(audit[1])).not.toContain('private-hash');expect(JSON.parse(audit[1].after).password_changed).toBe(true);
    expect(c.commit).toHaveBeenCalledTimes(1);expect(c.rollback).not.toHaveBeenCalled();expect(c.close).toHaveBeenCalledTimes(1);
  });
  it('una sucursal de otro negocio se rechaza antes de insertar y revierte la transacción',async()=>{
    const {repo,c,actor}=fixture();
    await expect(repo.saveUser(actor,undefined,{name:'Ana',username:'ana',active:true,password_hash:'hash',access:[{location_id:randomUUID(),roles:['CASHIER'],overrides:{}}]})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(c.execute.mock.calls.some(c=>c[0].startsWith('INSERT'))).toBe(false);expect(c.commit).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledTimes(1);expect(c.close).toHaveBeenCalledTimes(1);
  });
  it('un fallo de auditoría revierte también la creación del usuario y sus accesos',async()=>{
    const {repo,c,actor}=fixture();const execute=c.execute.getMockImplementation()!;
    c.execute.mockImplementation(async(sql,binds,options)=>{if(sql.startsWith('INSERT INTO administration_audit'))throw new Error('Oracle unavailable');return execute(sql,binds,options);});
    await expect(repo.saveUser(actor,undefined,{name:'Ana',username:'ana',active:true,password_hash:'hash',access:[]})).rejects.toThrow('Oracle unavailable');
    expect(c.commit).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledTimes(1);expect(c.close).toHaveBeenCalledTimes(1);
  });
});
