import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchOrds,clearOrdsSession} from '../apps/web/src/ords-transport';
import {logoutSession,refresh,setAccess,api} from '../apps/web/src/api';

const key='alliance-ords-refresh',base='https://example.oraclecloudapps.com/ords/admin/alliance/api/v1';
function environment(){
  const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{location:{protocol:'https:',href:'https://portal.test/admin/',origin:'https://portal.test',pathname:'/admin/'},ALLIANCE_CONFIG:{API_URL:base},dispatchEvent});return {values,dispatchEvent};
}
const response=(data:unknown)=>new Response(JSON.stringify({status:200,data}));
afterEach(()=>{setAccess('');vi.unstubAllGlobals();});
describe('Cerrar sesión sin esperar la red y sin reabrir sesiones pendientes',()=>{
  it('captura la sesión para revocarla, pero libera los tokens locales inmediatamente',()=>{
    const {values}=environment();values.set(key,'old-refresh');setAccess('old-access');let payload:any;
    vi.stubGlobal('fetch',vi.fn((_url,options)=>{payload={...options,body:JSON.parse(options.body)};return new Promise(()=>{});}));
    logoutSession();expect(values.has(key)).toBe(false);expect(payload.keepalive).toBe(true);expect(payload.body.access_token).toBe('old-access');expect(payload.body.refresh_token).toBe('old-refresh');
  });
  it('una respuesta tardía de salir no elimina una sesión iniciada después',async()=>{
    const {values}=environment();values.set(key,'old-refresh');let finish!:(r:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>finish=resolve));
    const pending=fetchOrds(base,'/api/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer old-access'}});
    clearOrdsSession();values.set(key,'new-refresh');finish(response({ok:true}));await pending;expect(values.get(key)).toBe('new-refresh');
  });
  it('una renovación que termina después de salir no vuelve a autenticar al usuario',async()=>{
    const {values,dispatchEvent}=environment();values.set(key,'old-refresh');let finish!:(r:Response)=>void;const calls:any[]=[];
    vi.stubGlobal('fetch',(_url:string,options:any)=>{const body=JSON.parse(options.body);calls.push(body);if(body.path==='/auth/refresh')return new Promise<Response>(resolve=>finish=resolve);return Promise.resolve(response({ok:true}));});
    const renewing=refresh();const rejected=expect(renewing).rejects.toThrow('La sesión se cerró');logoutSession();finish(response({access_token:'rotated-access',refresh_token:'rotated-refresh',context:{},provider:'oracle-ords'}));await rejected;
    expect(values.has(key)).toBe(false);expect(dispatchEvent).not.toHaveBeenCalled();expect(calls.some(c=>c.path==='/auth/logout'&&c.access_token==='rotated-access')).toBe(true);
    await api('/context',{},undefined,false);expect(calls.at(-1).access_token).toBe('');
  });
  it('revocar una renovación descartada tampoco borra un login posterior',async()=>{
    const {values}=environment();values.set(key,'old-refresh');let finish!:(r:Response)=>void;
    vi.stubGlobal('fetch',(_url:string,options:any)=>JSON.parse(options.body).path==='/auth/refresh'?new Promise<Response>(resolve=>finish=resolve):Promise.resolve(response({ok:true})));
    const renewing=refresh();const rejected=expect(renewing).rejects.toThrow('La sesión se cerró');logoutSession();values.set(key,'new-refresh');setAccess('new-access');finish(response({access_token:'discarded-access',refresh_token:'discarded-refresh',context:{},provider:'oracle-ords'}));await rejected;
    expect(values.get(key)).toBe('new-refresh');
  });
});
