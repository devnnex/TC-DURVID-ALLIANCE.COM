import '../operational/auth-proof.js';
import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeSql,ordsRoot} from './ords-sql.js';
const business=randomUUID(),owner=randomUUID(),slug='user-lifecycle-'+randomBytes(5).toString('hex');
const branches=['cocteleria','cafeteria','gcobarf','sucursal'].map(slug=>({id:randomUUID(),slug}));
const password=randomBytes(16).toString('hex'),salt=randomBytes(16).toString('hex');
const hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
let token='',checks=0;
function check(v:unknown,message:string){assert.ok(v,message);checks++;}
async function call(path:string,body:any={},location:string|null=branches[0].id,method='POST',access=token){
 const result=await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,path,body,access_token:access,location_id:location}),signal:AbortSignal.timeout(45000)});
 return result.json();
}
async function login(username:string,password:string,location=branches[0].id){
 return (globalThis as any).AllianceAuthProof.login(async(path:string,body:any)=>{const r=await call(path,body,location,'POST','');if(r.status!==200)throw Object.assign(Error(r.data?.error?.message),{status:r.status});return r.data;},{business_slug:slug,username,password},location);
}
const input=(location:string,username='same-credentials')=>({name:'Persona de prueba',username,password:'4826',active:true,access:[{location_id:location,roles:['WAITER'],overrides:{}}]});
const overview=async(location:string|null)=>{const r=await call('/admin/overview',{},location,'GET');check(r.status===200,'Consulta del equipo');return r.data;};
try{
 await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${business}','${slug}','Ciclo de usuarios temporal');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${owner}','${business}','owner','Responsable temporal','${hash}');${branches.map(l=>"INSERT INTO locations(id,business_id,slug,name,color)VALUES('"+l.id+"','"+business+"','"+l.slug+"','"+l.slug+"','#a47a47');INSERT INTO user_location_roles VALUES('"+business+"','"+owner+"','"+l.id+"','OWNER');").join('')}COMMIT;END;`);
 token=(await login('owner',password)).access_token;
 const ids:string[]=[],sessions:string[]=[];
 for(const b of branches){
   const created=await call('/admin/users',input(b.id),b.id);check(created.status===200,'Mismo usuario disponible en '+b.slug+': '+JSON.stringify(created.data?.error));
   const row=(await overview(b.id)).users.find((u:any)=>u.username==='same-credentials'&&u.access.some((a:any)=>a.location_id===b.id));
   ids.push(row.id);sessions.push((await login('same-credentials','4826',b.id)).access_token);
   check((await call('/admin/users',input(b.id),b.id)).status===409,'Duplicado dentro del mismo negocio rechazado');
 }
 check(new Set(ids).size===4,'Cada negocio tiene una identidad distinta');
 const ambiguous=await call('/auth/login',{business_slug:slug,username:'same-credentials',password:'4826'},null,'POST','');
 check(ambiguous.status===400&&ambiguous.data.error.code==='BRANCH_REQUIRED','Una entrada sin negocio no elige una cuenta al azar');
 for(let i=0;i<branches.length;i++){
   const b=branches[i],other=(i+1)%branches.length;
   check((await call('/admin/users/'+ids[i],{},b.id,'DELETE')).status===200,'Eliminar solo en '+b.slug);
   check((await call('/context',{},b.id,'GET',sessions[i])).status===401,'Sesión del eliminado revocada');
   if(other>i)check((await call('/context',{},branches[other].id,'GET',sessions[other])).status===200,'La otra cuenta conserva su sesión');
   check((await call('/admin/users',input(b.id),b.id)).status===200,'Recrear mismas credenciales en '+b.slug);
   const fresh=(await overview(b.id)).users.find((u:any)=>u.username==='same-credentials'&&u.access.some((a:any)=>a.location_id===b.id));
   check(fresh.id!==ids[i],'La cuenta recreada recibe otro ID');check(!fresh.progressSince?.[b.id],'La cuenta nueva no hereda el progreso anterior');
   const logged=await login('same-credentials','4826',b.id);check(logged.context.user.id===fresh.id,'Acceso rápido selecciona la cuenta del negocio correcto');
   const {password:_,...body}=input(b.id);
   check([403,404].includes((await call('/admin/users/'+ids[i],body,b.id,'PUT')).status),'La identidad eliminada no se reactiva mediante un ID antiguo');
 }
 check((await call('/admin/users/'+owner,{},branches[0].id,'DELETE')).status===409,'Jefe principal protegido');
 const multi={...input(branches[0].id,'multi'),access:[...input(branches[0].id).access,...input(branches[1].id).access]};
 check((await call('/admin/users',multi,null)).status===200,'Cuenta con dos accesos de prueba');
 const shared=(await overview(null)).users.find((u:any)=>u.username==='multi'),otherSession=await login('multi','4826',branches[1].id);
 check((await call('/admin/users/'+shared.id,{},null,'DELETE')).status===400,'Un usuario compartido exige seleccionar el negocio y no se elimina globalmente');
 check((await call('/admin/users/'+shared.id,{},branches[0].id,'DELETE')).status===200,'Retirar solo el primer acceso');
 const after=(await overview(null)).users.find((u:any)=>u.id===shared.id);
 check(after.access.length===1&&after.access[0].location_id===branches[1].id,'Segundo negocio conserva los permisos');
 check(!!after.progressSince?.[branches[0].id]&&!after.progressSince?.[branches[1].id],'El reinicio del progreso está limitado al negocio eliminado');
 check((await call('/context',{},branches[1].id,'GET',otherSession.access_token)).status===200,'La sesión del otro negocio sigue vigente');
 check((await call('/admin/users',input(branches[0].id,'multi'),branches[0].id)).status===200,'Credenciales reutilizables aunque el otro negocio conserve la cuenta');
 const replacement=(await overview(branches[0].id)).users.find((u:any)=>u.username==='multi'&&u.access.some((a:any)=>a.location_id===branches[0].id));
 check(replacement.id!==shared.id,'El usuario del negocio actual es nuevo e independiente');
 check((await call('/admin/users/'+replacement.id,{},branches[0].id,'DELETE')).status===200,'Retira la sustitución temporal');
 const {password:_,...multiEdit}=multi;check((await call('/admin/users/'+shared.id,multiEdit,null,'PUT')).status===200,'Volver a asignar una cuenta compartida conserva el corte del progreso');
 const reassigned=(await overview(null)).users.find((u:any)=>u.id===shared.id);check(reassigned.progressSince[branches[0].id]===after.progressSince[branches[0].id],'El progreso anterior no reaparece al reasignar');
 const race=await Promise.all([call('/admin/users',input(branches[0].id,'concurrent'),branches[0].id),call('/admin/users',input(branches[0].id,'concurrent'),branches[0].id)]);
 check(race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===409).length===1,'Dos creaciones simultáneas no duplican el usuario en un negocio');
 const paused=(await overview(branches[0].id)).users.find((u:any)=>u.username==='concurrent'),{password:__,...pause}=input(branches[0].id,'concurrent');
 check((await call('/admin/users/'+paused.id,{...pause,active:false},branches[0].id,'PUT')).status===200,'Pausa sin eliminar');
 check((await call('/admin/users',input(branches[0].id,'concurrent'),branches[0].id)).status===409,'Una cuenta pausada conserva el nombre reservado');
 console.log(JSON.stringify({oracleUserLifecycleChecks:checks,branches:branches.map(b=>b.slug)}));
}finally{
 await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${business}' AND slug='${slug}')LOOP DELETE FROM alliance_auth_challenges WHERE business_slug='${slug}';DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM auth_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
 }
