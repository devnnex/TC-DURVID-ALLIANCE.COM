import { afterEach,describe,expect,it,vi } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { apiBaseUrl } from '../apps/web/src/api-url';
import { fetchOrds,clearOrdsSession } from '../apps/web/src/ords-transport';
import { checkPassword } from '../apps/api/src/password';
const base='https://db.example.com/ords/admin/alliance/api/v1';
const values=new Map<string,string>();
function setup(){values.clear();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});vi.stubGlobal('window',{location:{protocol:'https:'}});}
afterEach(()=>vi.unstubAllGlobals());
describe('Cliente Oracle ORDS',()=>{
  it('acepta la ruta del esquema y conserva HTTPS',()=>{
    expect(apiBaseUrl(base,{hostname:'owner.github.io',protocol:'https:'})).toBe(base);
    expect(()=>apiBaseUrl(base.replace('https:','http:'),{hostname:'owner.github.io',protocol:'https:'})).toThrow('HTTPS');
  });
  it('envia solo el contrato de aplicacion, sin cookies ni autenticacion de base',async()=>{
    setup();const request=vi.fn(async(_url:string,_options:RequestInit)=>new Response(JSON.stringify({status:200,data:{cursor:0}})));vi.stubGlobal('fetch',request);
    const r=await fetchOrds(base,'/api/v1/bootstrap',{headers:{Authorization:'Bearer application-token','x-location-id':'branch','x-unused':'private'},credentials:'include'});
    expect(r.status).toBe(200);expect(request.mock.calls[0][0]).toBe(base+'/rpc');
    const options=request.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('omit');expect(options.headers).toEqual({'Content-Type':'application/json'});
    expect(JSON.parse(String(options.body))).toMatchObject({method:'GET',path:'/bootstrap',access_token:'application-token',location_id:'branch'});
  });
  it('conserva y rota el refresh por pestaña y lo borra al cerrar sesion',async()=>{
    setup();const calls:RequestInit[]=[];let sequence=0;
    vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{calls.push(options);sequence++;return new Response(JSON.stringify({status:200,data:sequence<3?{access_token:'access',refresh_token:'refresh-'+sequence}:{ok:true}}));});
    await fetchOrds(base,'/api/v1/auth/login',{method:'POST',body:'{}'});
    await fetchOrds(base,'/api/v1/auth/refresh',{method:'POST'});
    expect(JSON.parse(String(calls[1].body)).refresh_token).toBe('refresh-1');expect(values.get('alliance-ords-refresh')).toBe('refresh-2');
    await fetchOrds(base,'/api/v1/auth/logout',{method:'POST'});expect(values.size).toBe(0);
  });
  it('mantiene el 401 de negocio y borra una renovacion revocada',async()=>{
    setup();values.set('alliance-ords-refresh','expired');vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({status:401,data:{error:{message:'Sesion terminada'}}})));
    expect((await fetchOrds(base,'/api/v1/auth/refresh',{method:'POST'})).status).toBe(401);expect(values.size).toBe(0);clearOrdsSession();
  });
  it('usa la politica separada para abrir index.html por doble clic',async()=>{
    setup();vi.stubGlobal('window',{location:{protocol:'file:'}});const request=vi.fn(async(_url:string,_options:RequestInit)=>new Response(JSON.stringify({status:200,data:{ok:true}})));vi.stubGlobal('fetch',request);
    await fetchOrds(base,'/api/v1/health',{});expect(request.mock.calls[0][0]).toBe(base+'/file/rpc');
  });
  it('Node puede verificar las contraseñas PBKDF2 creadas por ORDS',async()=>{
    const salt='000102030405060708090a0b0c0d0e0f',password='ORDS-vector-password';
    const encoded='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
    expect(await checkPassword(password,encoded)).toBe(true);expect(await checkPassword('incorrect-password',encoded)).toBe(false);
  });
});
