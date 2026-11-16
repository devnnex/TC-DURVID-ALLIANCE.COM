import {describe,it,expect} from 'vitest';
import {randomUUID,createHmac} from 'node:crypto';
import {createApp} from '../apps/api/src/app';
import {MemoryRepository} from '../apps/api/src/memory';
import {hashPassword} from '../apps/api/src/password';
for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal'])describe('Frontera de seguridad Node · '+branch,()=>{
  it('rechaza tokens, privilegios e inyecciones inventados y aplica denegaciones sin confiar en el navegador',async()=>{
    const repo=new MemoryRepository(),password='secure-owner-password',workerPassword='4826';const context=await repo.setup({slug:'security-'+branch,business_name:'Prueba',name:'Principal',username:'owner',password_hash:await hashPassword(password),locations:[{slug:branch,name:branch,color:'#123456',active:true}]}),location=context.locations[0].id;
    await repo.saveUser(context.user.id,undefined,{name:'Personal',username:'worker',active:true,password_hash:await hashPassword(workerPassword),access:[{location_id:location,roles:['WORKER'],overrides:{}}]});
    const secret=randomUUID()+randomUUID(),app=await createApp(repo,{secret,setupToken:randomUUID(),provider:'memory',origin:'https://app.example.com',production:true});
    try{
      const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'security-'+branch,username:'worker',password:workerPassword,branch}});expect(login.statusCode).toBe(200);expect(login.headers['cache-control']).toBe('no-store');expect(login.headers['x-content-type-options']).toBe('nosniff');expect(login.headers['referrer-policy']).toBe('no-referrer');expect(login.headers['x-frame-options']).toBe('DENY');expect(JSON.stringify(login.json())).not.toContain('password_hash');
      const headers={authorization:'Bearer '+login.json().access_token,'x-location-id':location};expect((await app.inject({url:'/api/v1/bootstrap',headers})).statusCode).toBe(200);
      expect((await app.inject({url:'/api/v1/bootstrap',headers:{...headers,'x-location-id':randomUUID()}})).statusCode).toBe(403);
      expect((await app.inject({url:'/api/v1/admin/overview',headers:{...headers,'x-role':'OWNER','x-permissions':'administration.manage,sales.write'}})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers,payload:{name:'Escalada',username:'hacker',password:'4826',active:true,access:[{location_id:location,roles:['OWNER'],overrides:{}}]}})).statusCode).toBe(403);
      const worker=[...repo.managed.values()].find(u=>u.username==='worker')!;worker.access[0].overrides['products.read']='DENY';expect((await app.inject({url:'/api/v1/bootstrap',headers})).statusCode).toBe(403);
      for(const token of ['',"' OR 1=1 --",'eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.'])expect((await app.inject({url:'/api/v1/context',headers:{authorization:'Bearer '+token}})).statusCode).toBe(401);
      const claims=JSON.parse(Buffer.from(login.json().access_token.split('.')[1],'base64url').toString());
      const sign=(body:any,algorithm='HS256')=>{const input=Buffer.from(JSON.stringify({alg:algorithm,typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(body)).toString('base64url');return input+'.'+createHmac(algorithm==='HS512'?'sha512':'sha256',secret).update(input).digest('base64url');};
      for(const invalid of [{...claims,exp:1},{...claims,iss:'other'},{...claims,aud:'other'},{...claims,sid:randomUUID()},{...claims,sub:randomUUID()}])expect((await app.inject({url:'/api/v1/context',headers:{authorization:'Bearer '+sign(invalid)}})).statusCode).toBe(401);
      expect((await app.inject({url:'/api/v1/context',headers:{authorization:'Bearer '+sign(claims,'HS512')}})).statusCode).toBe(401);
      const injection=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'security-'+branch,username:"' OR 1=1 --",password:'wrong',branch}});expect(injection.statusCode).toBe(401);expect(injection.json().error.message).toBe('Usuario o contraseña incorrectos.');expect(injection.body).not.toMatch(/ORA-|SELECT |password_hash|stack/);
      expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'security-'+branch,username:'worker',password:workerPassword,role:'OWNER'}})).statusCode).toBe(400);
      expect((await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'https://evil.example.com'},payload:{business_slug:'security-'+branch,username:'owner',password}})).statusCode).toBe(403);
    }finally{await app.close();}
  });
});
it('limita intentos de login antes de seguir verificando contraseñas y no bloquea lecturas normales',async()=>{
  const app=await createApp(new MemoryRepository(),{secret:randomUUID()+randomUUID(),setupToken:randomUUID(),provider:'memory',origin:'https://app.example.com',production:true});
  try{for(let i=0;i<10;i++)expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'not-found',username:'user-'+i,password:'wrong'}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'not-found',username:'again',password:'wrong'}})).statusCode).toBe(429);expect((await app.inject({url:'/api/v1/health'})).statusCode).toBe(200);}finally{await app.close();}
});
