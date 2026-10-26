import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import { MemoryRepository } from '../apps/api/src/memory';
it('setup protegido, autenticación, selección scoped, refresh rotado y logout revocable',async()=>{
  const repo=new MemoryRepository();const secret=randomUUID()+randomUUID(),setupToken=randomUUID();const app=await createApp(repo,{secret,setupToken,provider:'memory',origin:'http://localhost:5173',production:false});
  try{
    const input={slug:'alliance-test',business_name:'Alliance',location_name:'Principal',name:'Owner',username:'owner',password:'a-secure-test-password'};
    expect((await app.inject({method:'POST',url:'/api/v1/admin/setup',payload:input})).statusCode).toBe(403);
    const setup=await app.inject({method:'POST',url:'/api/v1/admin/setup',headers:{'x-setup-token':setupToken},payload:input});expect(setup.statusCode).toBe(200);const context=setup.json();
    expect((await app.inject({method:'POST',url:'/api/v1/admin/setup',headers:{'x-setup-token':setupToken},payload:input})).statusCode).toBe(409);
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:input.slug,username:input.username,password:input.password}});expect(login.statusCode).toBe(200);
    const auth={authorization:`Bearer ${login.json().access_token}`};const oldCookie=login.cookies[0];
    expect((await app.inject({url:'/api/v1/bootstrap',headers:{...auth,'x-location-id':randomUUID()}})).statusCode).toBe(403);
    expect((await app.inject({url:'/api/v1/bootstrap',headers:{...auth,'x-location-id':context.locations[0].id}})).statusCode).toBe(200);
    const rotated=await app.inject({method:'POST',url:'/api/v1/auth/refresh',cookies:{alliance_refresh:oldCookie.value}});expect(rotated.statusCode).toBe(200);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/refresh',cookies:{alliance_refresh:oldCookie.value}})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:auth})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/context',headers:auth})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/refresh',cookies:{alliance_refresh:rotated.cookies[0].value}})).statusCode).toBe(401);
  }finally{await app.close();}
});
