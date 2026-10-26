import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';

const source=readFileSync(new URL('../operational/offline-auth.js',import.meta.url),'utf8');
const day=86400000;
const account={id:'user',business_id:'business',business_slug:'business',username:'Usuario',name:'Persona'};
const session={context:{user:account},refresh_token:'test-refresh-token'};
function fixture(){
 const records=new Map<string,any>(),markers=new Map<string,string>(),clock={now:Date.now()};
 const storage={get:async(key:string)=>structuredClone(records.get(key)),put:async(row:any)=>{records.set(row.scope,structuredClone(row));},once:async(key:string,row:any)=>{if(!records.has(key))records.set(key,structuredClone(row));return structuredClone(records.get(key));}};
 const start=()=>{
  const sandbox:any={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,structuredClone,Date:{now:()=>clock.now},ALLIANCE_CONFIG:{API_URL:'https://example.invalid/api/v1'},OracleDb:{user:()=>account},AllianceOffline:{authStore:storage,authenticationPrepared:()=>{}},localStorage:{getItem:(key:string)=>markers.get(key)??null,setItem:(key:string,value:string)=>markers.set(key,value),removeItem:(key:string)=>markers.delete(key)}};
  sandbox.window=sandbox;runInNewContext(source,sandbox);return sandbox.AllianceOfflineAuth;
 };
 return {start,clock,records};
}

describe('Vigencia del acceso sin conexión',()=>{
 it('restaura tras reiniciar y verifica la contraseña al día 59; exige validación después del día 60',async()=>{
  const f=fixture(),initial=f.start(),verifiedAt=f.clock.now;
  await initial.remember(account.username,'4826',session);
  expect(initial.ready(account.id)).toBe(true);
  f.clock.now=verifiedAt+59*day;
  const reopened=f.start();
  expect((await reopened.restoreSession(session.context))?.refresh_token).toBe(session.refresh_token);
  await expect(reopened.login(account.business_slug,account.username,'wrong')).rejects.toThrow('incorrectos');
  expect((await reopened.login(account.business_slug,account.username,'4826')).context.user.id).toBe(account.id);
  f.clock.now=verifiedAt+60*day+1;
  expect(await f.start().restoreSession(session.context)).toBeNull();
  await expect(f.start().login(account.business_slug,account.username,'4826')).rejects.toThrow('internet');
  expect([...f.records.values()].some(row=>row.context?.user.id===account.id)).toBe(true);
 });
 it('una validación en línea renueva el plazo con la sesión abierta',async()=>{
  const f=fixture(),auth=f.start(),verifiedAt=f.clock.now;
  await auth.remember(account.username,'4826',session);
  f.clock.now=verifiedAt+59*day;
  await auth.cacheSession({...session,refresh_token:'renewed-refresh-token'});
  f.clock.now=verifiedAt+61*day;
  const restored=await f.start().restoreSession(session.context);
  expect(restored?.refresh_token).toBe('renewed-refresh-token');
  expect(restored?.context.user.id).toBe(account.id);
 });
 it('ampliar el plazo conserva la revocación al cerrar sesión',async()=>{
  const f=fixture(),auth=f.start();await auth.remember(account.username,'4826',session);
  await auth.logout(session.context);
  expect(await f.start().restoreSession(session.context)).toBeNull();
  const login=await f.start().login(account.business_slug,account.username,'4826');
  expect(login.requireOnlineLogin).toBe(true);
  expect(login.refresh_token).toBe('');
 });
});
