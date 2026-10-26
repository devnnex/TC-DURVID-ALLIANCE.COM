import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createApp } from '../apps/api/src/app';
import { MemoryRepository } from '../apps/api/src/memory';
import { apiBaseUrl } from '../apps/web/src/api-url';
import { allowedWebOrigins } from '../apps/api/src/web-origins';
const config={secret:randomUUID()+randomUUID(),setupToken:randomUUID(),provider:'memory',production:false,origin:'http://127.0.0.1:4174'};
describe('Frontend estático y API independiente',()=>{
  it('conserva el host local para sesiones y acepta la API HTTPS alojada',()=>{
    expect(apiBaseUrl('http://127.0.0.1:3001/api/v1',{hostname:'localhost',protocol:'http:'})).toBe('http://localhost:3001/api/v1');
    expect(apiBaseUrl('https://api.example.com/api/v1/',{hostname:'example.github.io',protocol:'https:'})).toBe('https://api.example.com/api/v1');
    expect(()=>apiBaseUrl('http://127.0.0.1:3001/api/v1',{hostname:'example.github.io',protocol:'https:'})).toThrow('API alojada');
    expect(()=>apiBaseUrl('(description=(protocol=tcps))',{hostname:'localhost',protocol:'http:'})).toThrow('URL HTTP');
    expect(()=>apiBaseUrl('http://api.example.com/api/v1',{hostname:'example.github.io',protocol:'https:'})).toThrow('HTTPS');
    expect(()=>apiBaseUrl('https://user:password@api.example.com/api/v1',{hostname:'example.github.io',protocol:'https:'})).toThrow('credenciales');
  });
  it('permite Live Server local y limita producción a orígenes HTTPS explícitos',()=>{
    expect(allowedWebOrigins(config.origin,false)).toContain('http://localhost:5500');
    expect(allowedWebOrigins('https://example.github.io',true)).toEqual(['https://example.github.io']);
    expect(allowedWebOrigins('https://example.github.io,http://localhost:5500',true)).toContain('http://localhost:5500');
    expect(()=>allowedWebOrigins('http://public.example',true)).toThrow('HTTPS');
  });
  it('login y renovación funcionan desde Live Server; bloquea cambios de otro origen',async()=>{
    const repo=new MemoryRepository(),app=await createApp(repo,config);app.log.level='silent';
    const input={slug:'static-test',business_name:'Test',location_name:'Main',name:'Owner',username:'owner',password:'static-test-password'};
    try{
      const forbidden=await app.inject({method:'POST',url:'/api/v1/admin/setup',headers:{origin:'https://untrusted.example','x-setup-token':config.setupToken},payload:input});
      expect(forbidden.statusCode).toBe(403);expect(await repo.setupRequired()).toBe(true);
      const origin='http://127.0.0.1:5500';
      const preflight=await app.inject({method:'OPTIONS',url:'/api/v1/auth/login',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
      expect(preflight.headers['access-control-allow-origin']).toBe(origin);
      expect((await app.inject({method:'POST',url:'/api/v1/admin/setup',headers:{origin,'x-setup-token':config.setupToken},payload:input})).statusCode).toBe(200);
      const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{business_slug:input.slug,username:input.username,password:input.password}});
      expect(login.statusCode).toBe(200);expect(login.headers['access-control-allow-credentials']).toBe('true');
      const refresh=await app.inject({method:'POST',url:'/api/v1/auth/refresh',headers:{origin},cookies:{alliance_refresh:login.cookies[0].value}});expect(refresh.statusCode).toBe(200);
    }finally{await app.close();}
  });
  it('sirve solo el sitio compilado y rechaza archivos privados',async()=>{
    const app=await createApp(new MemoryRepository(),{...config,siteDir:resolve('dist')});app.log.level='silent';
    try{
      expect((await app.inject('/site/index.html')).statusCode).toBe(200);
      expect((await app.inject('/site/admin/')).statusCode).toBe(200);
      expect((await app.inject('/site/.env')).statusCode).toBe(404);
      expect((await app.inject('/site/%2e%2e/.env')).statusCode).toBe(404);
      expect((await app.inject('/site/apps/api/src/config.ts')).statusCode).toBe(404);
    }finally{await app.close();}
  });
  it('cookie entre sitios exige HTTPS y renovación desde un origen permitido',async()=>{
    const app=await createApp(new MemoryRepository(),{...config,production:true,origin:'https://frontend.example',cookieSameSite:'none'});app.log.level='silent';
    try{
      expect((await app.inject({method:'POST',url:'/api/v1/auth/refresh'})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:'/api/v1/auth/refresh?reload=1'})).statusCode).toBe(403);
    }finally{await app.close();}
  });
  it('el sitio alojado recibe su URL pública y admite sesiones desde su propio origen',async()=>{
    const publicApiUrl='https://api.example.com/api/v1';
    const app=await createApp(new MemoryRepository(),{...config,production:true,origin:'https://frontend.example',cookieSameSite:'none',siteDir:resolve('dist'),publicApiUrl});app.log.level='silent';
    try{
      const response=await app.inject('/site/api-config.js');
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(`const API_URL = ${JSON.stringify(publicApiUrl)};\nwindow.ALLIANCE_CONFIG = { API_URL };\n`);
      expect(response.headers['cache-control']).toBe('no-store');
      const preflight=await app.inject({method:'OPTIONS',url:'/api/v1/auth/login',headers:{origin:'https://api.example.com','access-control-request-method':'POST','access-control-request-headers':'content-type'}});
      expect(preflight.headers['access-control-allow-origin']).toBe('https://api.example.com');
    }finally{await app.close();}
  });
});
