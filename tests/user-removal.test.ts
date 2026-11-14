import {describe,it,expect} from 'vitest';
import {MemoryRepository} from '../apps/api/src/memory';
import {defaultLocations,type UserWrite} from '../packages/shared/administration';
import {createApp} from '../apps/api/src/app';
import {hashPassword} from '../apps/api/src/password';
import {randomUUID} from 'node:crypto';
async function fixture(){
 const repo=new MemoryRepository(),setup=await repo.setup({slug:'company',business_name:'Company',name:'Owner',username:'owner',password_hash:'unused',locations:defaultLocations});
 const owner=setup.user.id,locations=setup.locations;
 const input=(index:number,username='mesero'):UserWrite=>({name:'Persona',username,active:true,password_hash:'test-hash',access:[{location_id:locations[index].id,roles:['WAITER'],overrides:{}}]});
 return {repo,owner,locations,input};
}
describe('Usuarios independientes por negocio y eliminación',()=>{
 it('admite las mismas credenciales en distintos negocios y conserva la exclusividad dentro de cada uno',async()=>{
   const {repo,owner,locations,input}=await fixture();
   for(let i=0;i<3;i++)await repo.saveUser(owner,undefined,input(i),locations[i].id);
   const users=await Promise.all(locations.map(l=>repo.findUser('company','mesero',l.slug)));
   expect(new Set(users.slice(0,3).map(u=>u?.id)).size).toBe(3);
   await expect(repo.findUser('company','mesero')).rejects.toMatchObject({code:'BRANCH_REQUIRED'});
   await expect(repo.saveUser(owner,undefined,input(0),locations[0].id)).rejects.toMatchObject({code:'USERNAME_EXISTS'});
   expect(users[3]).toBeUndefined();
 });
 it('recrea con ID nuevo, revoca el usuario eliminado y conserva el de otro negocio',async()=>{
   const {repo,owner,locations,input}=await fixture();
   await repo.saveUser(owner,undefined,input(0),locations[0].id);await repo.saveUser(owner,undefined,input(1),locations[1].id);
   const old=(await repo.findUser('company','mesero',locations[0].id))!,other=(await repo.findUser('company','mesero',locations[1].id))!;
   const sid=randomUUID();await repo.saveSession({id:sid,business_id:old.business_id,user_id:old.id,revoked:false,refresh_hash:'old',expires_at:Date.now()+10000});
   await repo.removeUser(owner,old.id,locations[0].id);expect((await repo.getSession(sid))?.revoked).toBe(true);
   await repo.saveUser(owner,undefined,input(0),locations[0].id);const fresh=(await repo.findUser('company','mesero',locations[0].id))!;
   expect(fresh.id).not.toBe(old.id);expect((await repo.findUser('company','mesero',locations[1].id))?.id).toBe(other.id);
   expect((await repo.administration(owner)).users.some(u=>u.id===old.id)).toBe(false);
   await expect(repo.saveUser(owner,old.id,input(0),locations[0].id)).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('retira solo el acceso elegido y mantiene vigente la sesión de los otros negocios',async()=>{
   const {repo,owner,locations,input}=await fixture();
   const shared={...input(0),access:[...input(0).access,...input(1).access]};await repo.saveUser(owner,undefined,shared);
   const account=(await repo.findUser('company','mesero',locations[0].id))!,sid=randomUUID();
   await expect(repo.removeUser(owner,account.id)).rejects.toMatchObject({code:'LOCATION_REQUIRED'});
   await repo.saveSession({id:sid,business_id:account.business_id,user_id:account.id,revoked:false,refresh_hash:'shared',expires_at:Date.now()+10000});
   await repo.removeUser(owner,account.id,locations[0].id);
   expect((await repo.getSession(sid))?.revoked).toBe(false);expect((await repo.context(account.id)).locations.map(l=>l.id)).toEqual([locations[1].id]);
   await repo.saveUser(owner,undefined,input(0),locations[0].id);
   expect((await repo.findUser('company','mesero',locations[0].id))?.id).not.toBe(account.id);
   const old=(await repo.administration(owner)).users.find(u=>u.id===account.id)!;
   expect(old.progressSince?.[locations[0].id]).toBeTruthy();expect(old.progressSince?.[locations[1].id]).toBeUndefined();
 });
 it('pausar conserva la identidad y el nombre reservado',async()=>{
   const {repo,owner,locations,input}=await fixture();await repo.saveUser(owner,undefined,input(0),locations[0].id);const id=(await repo.findUser('company','mesero',locations[0].id))!.id;
   await repo.saveUser(owner,id,{...input(0),active:false},locations[0].id);
   await expect(repo.saveUser(owner,undefined,input(0),locations[0].id)).rejects.toMatchObject({code:'USERNAME_EXISTS'});
   await repo.saveUser(owner,id,input(0),locations[0].id);expect((await repo.findUser('company','mesero',locations[0].id))?.id).toBe(id);
   expect((await repo.administration(owner)).users.find(u=>u.id===id)?.progressSince).toBeUndefined();
 });
 it('protege al propietario y rechaza la eliminación desde otro negocio',async()=>{
   const {repo,owner,locations,input}=await fixture();await expect(repo.removeUser(owner,owner,locations[0].id)).rejects.toMatchObject({code:'PROTECTED_OWNER'});
   await repo.saveUser(owner,undefined,input(1),locations[1].id);const id=(await repo.findUser('company','mesero',locations[1].id))!.id;
   await expect(repo.removeUser(owner,id,locations[0].id)).rejects.toMatchObject({code:'FORBIDDEN'});
   await expect(repo.removeUser(id,owner,locations[1].id)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('DELETE HTTP libera el usuario solo en el negocio seleccionado',async()=>{
   const {repo,owner,locations,input}=await fixture();repo.users.get(owner)!.password_hash=await hashPassword('owner-password-test');
   const app=await createApp(repo,{secret:randomUUID()+randomUUID(),setupToken:'',provider:'memory',origin:'http://localhost:5173',production:false});app.log.level='silent';
   try{
     const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'company',username:'owner',password:'owner-password-test'}});
     const auth={authorization:'Bearer '+login.json().access_token,'x-location-id':locations[0].id};
     await repo.saveUser(owner,undefined,input(0),locations[0].id);const id=(await repo.findUser('company','mesero',locations[0].id))!.id;
     expect((await app.inject({method:'DELETE',url:'/api/v1/admin/users/'+id,headers:{...auth,'content-type':'application/json'},payload:{}})).statusCode).toBe(200);
     expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers:auth,payload:{...input(0),password_hash:undefined,password:'4826'}})).statusCode).toBe(200);
     const next=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{business_slug:'company',username:'mesero',password:'4826',branch:locations[0].slug}});
     expect(next.statusCode).toBe(200);expect(next.json().context.user.id).not.toBe(id);
     const preflight=await app.inject({method:'OPTIONS',url:'/api/v1/admin/users/'+id,headers:{origin:'http://localhost:5173','access-control-request-method':'DELETE'}});
     expect(preflight.headers['access-control-allow-methods']).toContain('DELETE');
   }finally{await app.close();}
 });
});
