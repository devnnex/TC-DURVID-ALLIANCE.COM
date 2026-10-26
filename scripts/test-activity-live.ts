import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {executeSql,ordsRoot} from './ords-sql.js';
const business=randomUUID(),owner=randomUUID(),worker=randomUUID(),first=randomUUID(),second=randomUUID(),slug='activity-check-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const salt=randomBytes(16).toString('hex'),hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
let token='',workerToken='',checks=0,refreshToken='';
const check=(condition:unknown,message:string)=>{assert.ok(condition,message);checks++;};
async function rpc(path:string,body:any={},location=first,access=token){const r=await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5500'},body:JSON.stringify({method:'POST',path,body,location_id:location,access_token:access}),signal:AbortSignal.timeout(45000)});return r.json();}
const action=(action:string,payload:any={},access=token,operation_id=randomUUID())=>rpc('/pos',{action,payload,operation_id},first,access);
const feed=(body:any={location_id:first})=>rpc('/admin/activity',body);
const model={settings:{monthlyUnits:100,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients:[{id:'flour',name:'Harina de prueba',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[],channels:[{id:'salon',name:'Salón',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[{id:'pizza',name:'Pizza de prueba',size:'Mediana',category:'Pizzas',output:1,wastePercent:0,minutes:null,monthlyUnits:100,currentPrice:10000,targetPercent:30,marginMode:'margin',channelId:'salon',lines:[{ingredientId:'flour',quantity:200,unit:'g'}]}]};
try{
  await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${business}','${slug}','Seguimiento temporal');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${owner}','${business}','owner','Jefe de prueba','${hash}');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${worker}','${business}','worker','Persona de prueba','${hash}');INSERT INTO locations(id,business_id,slug,name,color)VALUES('${first}','${business}','cocteleria','Primera','#a47a47');INSERT INTO locations(id,business_id,slug,name,color)VALUES('${second}','${business}','cafeteria','Segunda','#9b613e');INSERT INTO user_location_roles VALUES('${business}','${owner}','${first}','OWNER');INSERT INTO user_location_roles VALUES('${business}','${worker}','${first}','WAITER');INSERT INTO user_location_permissions VALUES('${business}','${worker}','${first}','inventory.read','ALLOW');INSERT INTO user_location_permissions VALUES('${business}','${worker}','${first}','products.write','ALLOW');COMMIT;END;`);
  const [a,b]=await Promise.all([rpc('/auth/login',{business_slug:slug,username:'owner',password}),rpc('/auth/login',{business_slug:slug,username:'worker',password})]);check(a.status===200&&b.status===200,'Login real');token=a.data.access_token;refreshToken=a.data.refresh_token;workerToken=b.data.access_token;
  check((await rpc('/admin/activity',{},first,workerToken)).status===403,'Solo el jefe consulta el seguimiento');
  check((await rpc('/activity/visit',{section:'users'},first,workerToken)).status===403,'Un empleado no registra una visita al centro del jefe');
  check((await rpc('/activity/visit',{section:'costing'},first,workerToken)).status===200,'Visita autorizada registrada');
  check((await rpc('/activity/visit',{section:'costing'},first,workerToken)).status===200,'Repetir vista es válido');
  const visits=(await feed({location_id:first,kind:'views'})).data.items;check(visits.length===1&&visits[0].actorId===worker&&visits[0].actorName==='Persona de prueba','Vista sin duplicados con usuario verificado');
  check((await rpc('/activity/visit',{section:'costing'},second,workerToken)).status===403,'No registra visitas a otra sucursal');
  check((await rpc('/activity/visit',{section:'costing',actorName:'Jefe falso'},first,workerToken)).status===400,'No acepta responsables enviados por el navegador');
  check((await rpc('/activity/visit',{section:'desconocida'})).status===400,'Sección inválida rechazada');
  const job=randomUUID();check((await action('costing_save',{model,revision:0},workerToken,job)).status===200,'Costeo guardado por empleado autorizado');
  const initial=(await feed({section:'costing',kind:'changes'})).data.items;
  check(initial.some((e:any)=>e.summary.includes('Harina de prueba')&&e.actorId===worker)&&initial.some((e:any)=>e.summary.includes('Pizza de prueba')),'Ingredientes y receta identificados en el seguimiento');
  check((await action('costing_save',{model,revision:0},workerToken,job)).status===200,'Reintento idempotente');check((await feed({section:'costing',kind:'changes'})).data.items.length===initial.length,'Reintento no duplica acciones');
  check((await action('costing_save',{model,revision:0},workerToken)).status===409,'Cambio obsoleto rechazado');check((await feed({section:'costing',kind:'changes'})).data.items.length===initial.length,'Un error no se registra como cambio exitoso');
  const loaded=await action('costing_load');check(loaded.data.value.actorName==='Persona de prueba','Costeo informa responsable real');
  check((await action('costing_approve',{recipeId:'pizza',revision:1},workerToken)).status===200,'Empleado autorizado guarda el producto rentable');
  const approved=(await action('costing_load')).data.value.approved[0];check(approved.actor===worker&&approved.actorName==='Persona de prueba','Historial conserva responsable del producto');
  check((await feed({location_id:second})).data.items.length===0,'Seguimiento por sucursal aislado');
  const before=(await feed()).data.items.length;await action('costing_load');check((await feed()).data.items.length===before,'Las lecturas automáticas no generan ruido');
  check((await feed({offset:0.5})).status===400&&((await feed({days:1000})).status===400),'Validación de paginación y período');
  const clientTable=a.data.bootstrap.tables.find((t:any)=>t.table_number===1);const client=(action:string,payload:any={})=>rpc('/pos/public',{action,payload,business_slug:slug,branch_slug:'cocteleria',table_code:clientTable.qr_code},first,'');
  const clientState=await client('getClientTableState');check(clientState.status===200,'Cliente abre cuenta con QR válido');
  const requestId=randomUUID(),request={request_id:requestId,session_id:clientState.data.value.session.id,request_type:'waiter',message:'Atención de prueba'};
  check((await client('createServiceRequest',request)).status===200,'Solicitud del cliente registrada');check((await client('createServiceRequest',request)).data.value.duplicate,'Solicitud repetida reconocida');
  const requests=(await feed()).data.items.filter((e:any)=>e.action==='CLIENT_REQUEST');check(requests.length===1&&requests[0].actorId===null&&requests[0].actorName==='Cliente de mesa','Cliente identificado sin atribuirlo a un empleado y sin duplicar');
  await executeSql(`BEGIN FOR i IN 1..55 LOOP alliance_activity.record_event('${owner}','${business}','${first}','dashboard','VIEW','Visita aislada de prueba');END LOOP;COMMIT;END;`);
  const page1=(await feed()).data,page2=(await feed({location_id:first,offset:50})).data;check(page1.items.length===50&&page1.hasMore,'Primera página limitada');check(page2.items.length>0&&!page2.hasMore&&!page2.items.some((e:any)=>page1.items.some((a:any)=>a.id===e.id)),'Segunda página sin repetir eventos');
  const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();await page.addInitScript(value=>{sessionStorage.setItem('alliance-ords-refresh',value);},refreshToken);await page.goto(pathToFileURL(resolve('admin/index.html')).href);await page.getByRole('heading',{name:'Usuarios y accesos',exact:true}).waitFor({timeout:45000});await page.getByRole('button',{name:'Seguimiento',exact:true}).click();await page.getByRole('heading',{name:'Seguimiento del equipo'}).waitFor({timeout:30000});await page.getByLabel('Sección',{exact:true}).selectOption('costing');await page.getByLabel('Responsable',{exact:true}).selectOption(worker);await page.getByText('Guardó un producto listo para vender',{exact:false}).waitFor({timeout:30000});check(await page.locator('.team-timeline').innerText().then(t=>t.includes('Persona de prueba')),'Interfaz usa seguimiento real de Oracle por file://');await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Seguimiento real adaptable a móvil');}finally{await browser.close();}
  console.log(JSON.stringify({oracleActivityChecks:checks}));
}finally{
  await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${business}' AND slug='${slug}') LOOP DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
  console.log('Solo los datos aislados de seguimiento fueron retirados.');
}
