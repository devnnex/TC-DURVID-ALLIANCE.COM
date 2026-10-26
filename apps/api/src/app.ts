import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainError, operationSchema, uuid } from '../../../packages/shared/domain.js';
import type { Principal } from '../../../packages/shared/domain.js';
import type { Repository } from './repository.js';
import { locationInput, userInput } from '../../../packages/shared/administration.js';
import { checkPassword, digest, hashPassword, token } from './password.js';
import { allowedWebOrigins } from './web-origins.js';
import { registerSite } from './site.js';
export type AppConfig = { secret:string;origin:string;production:boolean;setupToken:string;provider:string;cookieSameSite?:'strict'|'none';siteDir?:string;publicApiUrl?:string };
export async function createApp(repo: Repository, cfg: AppConfig) {
  const app=Fastify({logger:{level:'info',redact:['req.headers.authorization','req.headers.cookie','req.headers.x-setup-token','password','refresh_hash']},bodyLimit:1024*1024});
  await app.register(cookie);
  const origins=allowedWebOrigins(cfg.origin,cfg.production);
  if(cfg.publicApiUrl){const url=new URL(cfg.publicApiUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!=='/api/v1')throw new Error('PUBLIC_API_URL debe ser la URL HTTPS pública de la API, terminada en /api/v1.');origins.push(url.origin);}
  if(!cfg.production)origins.push('http://127.0.0.1:3001','http://localhost:3001');
  await app.register(cors,{origin:origins,credentials:true});
  app.addHook('onRequest',async request=>{
    // CORS alone cannot prevent writes from an untrusted browser origin.
    const origin=request.headers.origin;
    if(origin&&!origins.includes(origin))throw new DomainError('FORBIDDEN','Este origen no está autorizado para acceder al sistema.',403);
    if(cfg.cookieSameSite==='none'&&request.url.split('?')[0]==='/api/v1/auth/refresh'&&!origin)throw new DomainError('FORBIDDEN','La renovación de sesión requiere un origen autorizado.',403);
  });
  await app.register(jwt,{secret:cfg.secret,sign:{iss:'tc-alliance',aud:'tc-alliance-web',expiresIn:'15m'},verify:{allowedIss:'tc-alliance',allowedAud:'tc-alliance-web'}});
  await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
  app.setErrorHandler((error,request,reply)=>{
    const err=error as Error & {statusCode?:number};
    if(err instanceof DomainError) return reply.status(err.status).send({error:{code:err.code,message:err.message},request_id:request.id});
    if(err instanceof z.ZodError) return reply.status(400).send({error:{code:'INVALID_INPUT',message:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},request_id:request.id});
    const status=err.statusCode||500;
    if(status>=500)request.log.error({err},'Request failed');
    return reply.status(status).send({error:{code:status===401?'UNAUTHORIZED':status===429?'RATE_LIMIT':'INTERNAL_ERROR',message:status===401?'Inicia sesión para continuar.':status===429?'Intenta nuevamente en un momento.':'No fue posible completar la operación.'},request_id:request.id});
  });
  if(cfg.cookieSameSite==='none'&&!cfg.production)throw new Error('La cookie entre sitios requiere HTTPS en producción.');
  const refreshCookie={httpOnly:true,secure:cfg.production,sameSite:cfg.cookieSameSite||'strict',path:'/api/v1/auth',maxAge:60*60*24*7};
  async function authenticate(request: any) {
    const claims=await request.jwtVerify() as {sub:string;sid:string};
    const s=await repo.getSession(claims.sid);
    if(!s||s.revoked||s.user_id!==claims.sub||s.expires_at<=Date.now())throw new DomainError('UNAUTHORIZED','Tu sesión terminó.',401);
    return {session:s,context:await repo.context(s.user_id)};
  }
  async function principal(request: any): Promise<Principal> {
    const {context}=await authenticate(request);const selected=uuid.parse(request.headers['x-location-id']);
    if(!context.locations.some(l=>l.id===selected&&l.active))throw new DomainError('FORBIDDEN','No tienes acceso a esta sucursal.',403);
    return {user_id:context.user.id,business_id:context.user.business_id,location_id:selected,permissions:context.permissions[selected]||[]};
  }
  app.get('/api/v1/health',async(_request,reply)=>{const ok=await repo.health();return reply.status(ok?200:503).send({ok,provider:cfg.provider,version:'0.2.0',scope:'catalog-administration'});});
  app.get('/api/v1/installation',async(_request,reply)=>{
    if(!await repo.health())return reply.status(503).send({error:{code:'DATABASE_UNAVAILABLE',message:'No se pudo comprobar la base de datos. Intenta nuevamente en un momento.'}});
    return {provider:cfg.provider,setup_required:await repo.setupRequired(),setup_available:!!cfg.setupToken};
  });
  if(cfg.siteDir)registerSite(app,cfg.siteDir,cfg.publicApiUrl);
  app.post('/api/v1/admin/setup',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async request=>{
    const provided=String(request.headers['x-setup-token']||'');
    if(!cfg.setupToken || !timingSafeEqual(Buffer.from(digest(provided)),Buffer.from(digest(cfg.setupToken))))throw new DomainError('FORBIDDEN','La configuración requiere el token de instalación.',403);
    const input=z.object({slug:z.string().regex(/^[a-z0-9-]{3,80}$/),business_name:z.string().trim().min(1).max(160),location_name:z.string().trim().min(1).max(160).optional(),locations:z.array(locationInput).min(1).max(100).optional(),name:z.string().trim().min(1).max(160),username:z.string().trim().min(1).max(320),password:z.string().min(12).max(128)}).strict().superRefine((v,c)=>{
      if(!!v.location_name===!!v.locations)c.addIssue({code:'custom',message:'Define la lista de sucursales.'});
      if(v.locations&&(!v.locations.some(l=>l.active)||new Set(v.locations.map(l=>l.slug)).size!==v.locations.length))c.addIssue({code:'custom',path:['locations'],message:'Usa identificadores únicos y habilita al menos una sucursal.'});
    }).parse(request.body);
    const {password,...rest}=input;return repo.setup({...rest,password_hash:await hashPassword(password)});
  });
  app.post('/api/v1/auth/login',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(request,reply)=>{
    const body=z.object({business_slug:z.string().min(1).max(80),username:z.string().trim().min(1).max(320),password:z.string().min(1).max(128)}).strict().parse(request.body);
    const user=await repo.findUser(body.business_slug,body.username);const valid=await checkPassword(body.password,user?.password_hash||await hashPassword(token()));
    if(!user||!valid)throw new DomainError('UNAUTHORIZED','Usuario o contraseña incorrectos.',401);
    const refresh=token(),sid=randomUUID(),loginAt=Date.now();await repo.saveSession({id:sid,user_id:user.id,business_id:user.business_id,refresh_hash:digest(refresh),expires_at:loginAt+7*86400000,revoked:false});
    reply.setCookie('alliance_refresh',refresh,refreshCookie);
    const context=await repo.context(user.id);context.user.last_login_at=new Date(loginAt).toISOString();return {access_token:app.jwt.sign({sub:user.id,sid}),context,provider:cfg.provider};
  });
  app.post('/api/v1/auth/refresh',async(request,reply)=>{
    const refresh=token();const session=await repo.rotateSession(digest(request.cookies.alliance_refresh||''),digest(refresh));
    if(!session)throw new DomainError('UNAUTHORIZED','Inicia sesión nuevamente.',401);
    const context=await repo.context(session.user_id);context.user.last_login_at=new Date(session.expires_at-7*86400000).toISOString();reply.setCookie('alliance_refresh',refresh,refreshCookie);
    return {access_token:app.jwt.sign({sub:session.user_id,sid:session.id}),context,provider:cfg.provider};
  });
  app.post('/api/v1/auth/logout',async(request,reply)=>{
    const {session}=await authenticate(request);await repo.revokeSession(session.id);reply.clearCookie('alliance_refresh',{path:refreshCookie.path});return {ok:true};
  });
  app.get('/api/v1/context',async request=>(await authenticate(request)).context);
  app.get('/api/v1/admin/overview',async request=>repo.administration((await authenticate(request)).context.user.id));
  app.post('/api/v1/admin/locations',async request=>{
    const {context}=await authenticate(request);await repo.saveLocation(context.user.id,undefined,locationInput.parse(request.body));return {ok:true};
  });
  app.put('/api/v1/admin/locations/:id',async request=>{
    const {context}=await authenticate(request);const {id}=z.object({id:uuid}).parse(request.params);await repo.saveLocation(context.user.id,id,locationInput.parse(request.body));return {ok:true};
  });
  for(const method of ['POST','PUT'] as const)app.route({method,url:method==='POST'?'/api/v1/admin/users':'/api/v1/admin/users/:id',handler:async request=>{
    const {context}=await authenticate(request);
    // Check ownership before password hashing or exposing validation details.
    await repo.administration(context.user.id);
    const id=method==='PUT'?z.object({id:uuid}).parse(request.params).id:undefined;
    const {password,...input}=userInput.parse(request.body);
    if(!id&&!password)throw new DomainError('PASSWORD_REQUIRED','Define la contraseña del nuevo usuario.');
    const locationId=request.headers['x-location-id']===undefined?undefined:uuid.parse(request.headers['x-location-id']);
    await repo.saveUser(context.user.id,id,{...input,password_hash:password?await hashPassword(password):undefined},locationId);return {ok:true};
  }});
  app.post('/api/v1/devices/register',async request=>{
    const p=await principal(request);const input=z.object({id:uuid,name:z.string().trim().min(1).max(120)}).strict().parse(request.body);
    await repo.registerDevice(p,input.id,input.name);return {ok:true};
  });
  app.get('/api/v1/bootstrap',async request=>repo.bootstrap(await principal(request)));
  for(const entity of ['products','ingredients','units'] as const) app.get(`/api/v1/${entity}`,async request=>{
    const p=await principal(request);if(entity==='ingredients'&&!p.permissions.includes('inventory.read'))throw new DomainError('FORBIDDEN','No tienes permiso para consultar ingredientes.',403);
    return (await repo.bootstrap(p))[entity];
  });
  app.post('/api/v1/sync',async request=>{
    const p=await principal(request);const input=z.object({operations:z.array(operationSchema).min(1).max(100)}).strict().parse(request.body);
    const results=[];
    for(const op of input.operations) {
      try{results.push(await repo.apply(p,op));}
      catch(e){if(e instanceof DomainError && e.status!==401 && e.status<500)results.push({operation_id:op.operation_id,status:'REQUIRES_REVIEW' as const,code:e.code,message:e.message});else throw e;}
    }
    return {results};
  });
  app.get('/api/v1/sync/changes',async request=>{
    const q=z.object({cursor:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)}).strict().parse(request.query);
    return repo.changes(await principal(request),q.cursor);
  });
  app.addHook('onClose',async()=>repo.close());return app;
}
