import '../../../operational/auth-proof.js';
// Only application tokens are stored here; never Oracle database credentials.
// sessionStorage survives reloads and is cleared when this tab is closed.
const key='alliance-ords-refresh';
let sessionGeneration=0;
export function clearOrdsSession(){sessionGeneration++;try{sessionStorage.removeItem(key);}catch{}}
// Revoke a response that belongs to a discarded session, without touching a newer login.
export function revokeOrdsSession(base:string,access:string,refreshToken:string){
  const endpoint=window.location.protocol==='file:'?'/file/rpc':'/rpc';
  return fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',keepalive:true,
    body:JSON.stringify({method:'POST',path:'/auth/logout',body:{},access_token:access,refresh_token:refreshToken})}).catch(()=>{});
}
export async function fetchOrds(base:string,path:string,options:RequestInit):Promise<Response>{
  const generation=sessionGeneration;
  const headers=new Headers(options.headers);
  let refreshToken='';try{refreshToken=sessionStorage.getItem(key)||'';}catch{}
  const method=(options.method||'GET').toUpperCase();
  const payload={method,path:path.replace(/^\/api\/v1/,''),body:options.body?JSON.parse(String(options.body)):{},
    access_token:headers.get('Authorization')?.replace(/^Bearer /,'')||'',refresh_token:refreshToken,
    location_id:headers.get('x-location-id')||'',setup_token:headers.get('x-setup-token')||''};
  const endpoint=typeof window!=='undefined'&&window.location.protocol==='file:'?'/file/rpc':'/rpc';
  const send=async(path:string,body:unknown)=>{const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({...payload,path,body}),signal:options.signal,keepalive:options.keepalive});if(!response.ok){const e=new Error('No se pudo conectar con tu espacio.') as Error&{status:number};e.status=response.status;throw e;}return response.json();};
  let envelope;
  if(payload.path==='/auth/login'&&typeof payload.body.password==='string'&&typeof payload.body.business_slug==='string'&&typeof payload.body.username==='string'){try{const data=await (globalThis as any).AllianceAuthProof.login(async(path:string,body:unknown)=>{const result=await send(path,body);if(result.status>=400){const e=new Error(result.data?.error?.message||'No se pudo iniciar sesión.') as Error&{status:number};e.status=result.status;throw e;}return result.data;},payload.body,payload.location_id);if(generation!==sessionGeneration){void revokeOrdsSession(base,data.access_token,data.refresh_token);return new Response(JSON.stringify({error:{message:'La sesión se cerró.'}}),{status:401,headers:{'Content-Type':'application/json'}});}envelope={status:200,data};}catch(e){const error=e as Error&{status?:number};return new Response(JSON.stringify({error:{message:error.message}}),{status:error.status||503,headers:{'Content-Type':'application/json'}});}}
  else {const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify(payload),signal:options.signal,keepalive:options.keepalive});if(!response.ok)return response;envelope=await response.json();}
  if(!Number.isInteger(envelope.status)||envelope.status<200||envelope.status>599||!envelope.data)throw new Error('Respuesta ORDS invalida.');
  // An older response must not replace or clear a newer login.
  let current='';try{current=sessionStorage.getItem(key)||'';}catch{}
  if(generation===sessionGeneration&&current===refreshToken){
    if(envelope.status===200&&envelope.data.refresh_token){try{sessionStorage.setItem(key,envelope.data.refresh_token);}catch{}}
    if(payload.path==='/auth/logout'&&envelope.status===200||payload.path==='/auth/refresh'&&envelope.status===401)clearOrdsSession();
  }
  return new Response(JSON.stringify(envelope.data),{status:envelope.status,headers:{'Content-Type':'application/json'}});
}
