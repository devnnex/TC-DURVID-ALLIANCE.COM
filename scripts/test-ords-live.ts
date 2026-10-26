import { randomBytes,randomUUID } from 'node:crypto';
import { executeSql,ordsRoot } from './ords-sql.js';
import assert from 'node:assert/strict';
const apiUrl=ordsRoot+'alliance/api/v1/rpc';
const b=randomUUID(),u=randomUUID(),l=randomUUID(),otherBusiness=randomUUID(),otherLocation=randomUUID(),device=randomUUID();
const slug='ords-validation-'+randomBytes(6).toString('hex');
const password=randomBytes(24).toString('hex');
let checks=0;
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}
async function rpc(method:string,path:string,body:unknown={},access='',location=l,refresh=''){
  const r=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5500'},body:JSON.stringify({method,path,body,access_token:access,location_id:location,refresh_token:refresh}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${method} ${path}`);
  const result=await r.json() as {status:number;data:any};return result;
}
try{
  const before=await executeSql('SELECT COUNT(*) n FROM businesses');
  // Real tests use their own business; production rows are never reused.
  await executeSql(`DECLARE h VARCHAR2(512);BEGIN h:=alliance_security.password_hash('${password}');
    INSERT INTO businesses(id,slug,name) VALUES('${b}','${slug}','Validacion ORDS temporal');
    INSERT INTO businesses(id,slug,name) VALUES('${otherBusiness}','${slug}-other','Validacion ORDS temporal');
    INSERT INTO users(id,business_id,username,full_name,password_hash) VALUES('${u}','${b}','owner','Validacion temporal',h);
    INSERT INTO locations(id,business_id,slug,name,color) VALUES('${l}','${b}','main','Temporal','#123456');
    INSERT INTO locations(id,business_id,slug,name,color) VALUES('${otherLocation}','${otherBusiness}','other','Otra temporal','#654321');
    INSERT INTO user_location_roles VALUES('${b}','${u}','${l}','OWNER');COMMIT;END;`);
  check((await rpc('GET','/context')).status===401,'La API publica no entrega contexto sin token.');
  const denied=await rpc('POST','/auth/login',{business_slug:slug,username:'owner',password:'wrong-password'});
  check(denied.status===401,'Rechaza contrasena incorrecta.');
  const login=await rpc('POST','/auth/login',{business_slug:slug,username:'owner',password});
  check(login.status===200,'Inicia sesion en Oracle real.');
  let access=login.data.access_token;let refresh=login.data.refresh_token;
  check(login.data.context.is_owner===true,'El propietario tiene su contexto real.');
  check((await rpc('GET','/bootstrap',{},access,otherLocation)).status===403,'Aisla otras sucursales y negocios.');
  check((await rpc('POST','/admin/locations',{slug:'second',name:'Segunda temporal',color:'#345678',active:true},access)).status===200,'Crea sucursal desde la API.');
  const userBody={name:'Empleado temporal',username:'employee',password:'4826',active:true,access:[{location_id:l,roles:['CASHIER'],overrides:{'activity.read':'DENY'}}]};
  check((await rpc('POST','/admin/users',userBody,access)).status===200,'Crea empleado con rol y excepciones.');
  const overview=await rpc('GET','/admin/overview',{},access);
  check(overview.status===200&&overview.data.users.length===2,'Carga administracion sin hashes de contrasena.');
  check(!JSON.stringify(overview.data).includes('pbkdf2'),'No expone hashes en administracion.');
  const employee=overview.data.users.find((x:any)=>x.username==='employee');
  check((await rpc('PUT','/admin/users/'+u,{...userBody,username:'owner'},access)).status===409,'Protege la cuenta propietaria.');
  check((await rpc('POST','/devices/register',{id:device,name:'Dispositivo temporal'},access)).status===200,'Registra el dispositivo real.');
  const operation={operation_id:randomUUID(),idempotency_key:randomUUID(),device_id:device,business_id:b,location_id:l,entity_type:'PRODUCT',entity_id:randomUUID(),operation_type:'PRODUCT_UPSERT',payload:{name:'Producto temporal',sku:'TEST-ORDS',category:'Validacion',price_minor:'2500000',kind:'SIMPLE',unit_id:'u',active:true},base_version:0,client_created_at:new Date().toISOString()};
  const first=await rpc('POST','/sync',{operations:[operation]},access);
  check(first.status===200&&first.data.results[0].status==='SYNCED','Guarda el producto real.');
  const duplicate=await rpc('POST','/sync',{operations:[operation]},access);
  check(duplicate.status===200&&duplicate.data.results[0].product.version===1,'Un reintento no duplica ni aumenta version.');
  const reused=await rpc('POST','/sync',{operations:[{...operation,payload:{...operation.payload,name:'Contenido cambiado'}}]},access);
  check(reused.data.results[0].code==='IDEMPOTENCY_REUSE','Detecta reutilizacion de idempotencia.');
  const conflict=await rpc('POST','/sync',{operations:[{...operation,operation_id:randomUUID(),idempotency_key:randomUUID()}]},access);
  check(conflict.data.results[0].status==='CONFLICT','Detecta una version anterior.');
  const boot=await rpc('GET','/bootstrap',{},access);
  check(boot.status===200&&boot.data.products.length===1&&boot.data.products[0].price_minor==='2500000','Descarga catalogo y dinero como entero textual.');
  const changes=await rpc('GET','/sync/changes?cursor=0',{},access);
  check(changes.status===200&&changes.data.changes.length===1,'Publica un solo cambio confirmado.');
  const employeeLogin=await rpc('POST','/auth/login',{business_slug:slug,username:'employee',password:userBody.password});
  check(employeeLogin.status===200,'El empleado inicia sesion.');
  check(!employeeLogin.data.context.permissions[l].includes('activity.read'),'Aplica DENY sobre el rol.');
  check((await rpc('GET','/admin/overview',{},employeeLogin.data.access_token)).status===403,'Empleado no administra usuarios.');
  const deniedWrite=await rpc('POST','/sync',{operations:[{...operation,operation_id:randomUUID(),idempotency_key:randomUUID()}]},employeeLogin.data.access_token);
  check(deniedWrite.data.results[0].code==='FORBIDDEN','Empleado sin permiso no modifica productos.');
  const {password:_,...update}=userBody;
  check((await rpc('PUT','/admin/users/'+employee.id,{...update,active:false},access)).status===200,'Suspende al empleado.');
  check((await rpc('GET','/context',{},employeeLogin.data.access_token)).status===401,'Revoca la sesion anterior.');
  check((await rpc('POST','/auth/refresh',{},'',l,employeeLogin.data.refresh_token)).status===401,'No renueva una sesion revocada.');
  const renewed=await rpc('POST','/auth/refresh',{},'',l,refresh);
  check(renewed.status===200,'Renueva sesion sin cookies de terceros.');
  check((await rpc('POST','/auth/refresh',{},'',l,refresh)).status===401,'Rechaza reutilizar el refresh anterior.');
  access=renewed.data.access_token;refresh=renewed.data.refresh_token;
  check((await rpc('POST','/auth/logout',{},access)).status===200,'Cierra sesion en Oracle.');
  check((await rpc('POST','/auth/refresh',{},'',l,refresh)).status===401,'El cierre revoca la renovacion.');
  console.log(JSON.stringify({liveOracleChecksPassed:checks,preexistingBusinesses:(before[0].resultSet?.items[0] as any)?.n}));
}finally{
  // Exact generated UUIDs only; no schema reset or deletion of customer rows.
  await executeSql(`BEGIN
    FOR x IN (SELECT id FROM businesses WHERE id IN ('${b}','${otherBusiness}') AND slug IN ('${slug}','${slug}-other')) LOOP
      DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;
      DELETE FROM audit_log WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;
      DELETE FROM change_feed WHERE business_id=x.id;DELETE FROM sync_operations WHERE business_id=x.id;
      DELETE FROM devices WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;
      DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM ingredients WHERE business_id=x.id;
      DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM auth_sessions WHERE business_id=x.id;
      DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;
      DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;
    END LOOP;COMMIT;END;`);
  console.log('Datos temporales eliminados; las filas previas se conservaron.');
}
