import type { Context } from '../../../packages/shared/domain.js';
import { apiBaseUrl } from './api-url';
import { fetchOrds,clearOrdsSession,revokeOrdsSession } from './ords-transport';
declare global {interface Window {ALLIANCE_CONFIG?:{API_URL?:string}}}
let accessToken='';let refreshPromise:Promise<LoginResult>|undefined;let authGeneration=0;
type EmbeddedTransport=(path:string,options:RequestInit,locationId?:string)=>Promise<unknown>;
let embeddedTransport:EmbeddedTransport|undefined;
export function useEmbeddedTransport(transport:EmbeddedTransport){embeddedTransport=transport;}
export type LoginResult={access_token:string;context:Context;provider:string};
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function setAccess(value:string){accessToken=value;if(!value){authGeneration++;refreshPromise=undefined;clearOrdsSession();}}
export function logoutSession(){
  const headers=new Headers({'Content-Type':'application/json'});if(accessToken)headers.set('Authorization',`Bearer ${accessToken}`);
  // Capture tokens synchronously, then release the interface without awaiting the network.
  void fetchServer('/api/v1/auth/logout',{method:'POST',headers,credentials:'include',keepalive:true}).catch(()=>{});
  setAccess('');
}
async function fetchServer(path:string,options:RequestInit):Promise<Response>{
  const base=typeof window==='undefined'?'/api/v1':apiBaseUrl(window.ALLIANCE_CONFIG?.API_URL,window.location);
  try{return base.includes('/ords/')?await fetchOrds(base,path,options):await fetch(base+path.replace(/^\/api\/v1/,''),options);}catch(e){if(options.signal?.aborted||e instanceof DOMException&&['TimeoutError','AbortError'].includes(e.name))throw new HttpError(504,'La conexión tardó demasiado. Intenta nuevamente.');throw new HttpError(503,'No pudimos conectar con tu espacio. Comprueba tu conexión y vuelve a intentar.');}
}
async function readResponse(response:Response){
  try{return await response.json();}catch{throw new HttpError(response.status||503,'El servidor no está disponible. Vuelve a intentar en un momento.');}
}
function revokeDiscarded(result:LoginResult&{refresh_token?:string}){
  const base=apiBaseUrl(window.ALLIANCE_CONFIG?.API_URL,window.location);
  if(base.includes('/ords/'))void revokeOrdsSession(base,result.access_token,result.refresh_token||'');
}
export async function refresh():Promise<LoginResult>{
  if(refreshPromise)return refreshPromise;
  const generation=authGeneration;
  const pending=fetchServer('/api/v1/auth/refresh',{method:'POST',credentials:'include',signal:AbortSignal.timeout(15000)})
    .then(async r=>{const data=await readResponse(r);if(generation!==authGeneration){if(r.ok)revokeDiscarded(data);throw new HttpError(401,'La sesión se cerró.');}if(!r.ok){if(r.status===401){accessToken='';window.dispatchEvent(new Event('alliance-session-expired'));}throw new HttpError(r.status,data.error?.message||'Inicia sesión nuevamente.');}accessToken=data.access_token;window.dispatchEvent(new CustomEvent('alliance-session-renewed',{detail:data}));return data;}).finally(()=>{if(refreshPromise===pending)refreshPromise=undefined;});
  refreshPromise=pending;
  return refreshPromise;
}
export async function api<T>(path:string,options:RequestInit={},locationId?:string,retry=true):Promise<T>{
  if(embeddedTransport)return await embeddedTransport(path,options,locationId) as T;
  const headers=new Headers(options.headers);headers.set('Content-Type','application/json');if(accessToken)headers.set('Authorization',`Bearer ${accessToken}`);if(locationId)headers.set('x-location-id',locationId);
  const response=await fetchServer(`/api/v1${path}`,{...options,headers,credentials:'include',signal:options.signal||AbortSignal.timeout(15000)});
  if(response.status===401&&retry&&path!=='/auth/login'){await refresh();return api<T>(path,options,locationId,false);}
  const data=await readResponse(response);if(!response.ok)throw new HttpError(response.status,data.error?.message||'No se pudo completar la solicitud.');return data;
}
