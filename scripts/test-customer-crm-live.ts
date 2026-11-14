import assert from 'node:assert/strict';
import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import {executeSql,ordsRoot} from './ords-sql.js';
const business=randomUUID(),locations=[randomUUID(),randomUUID(),randomUUID()],owner=randomUUID(),waiter=randomUUID(),product=randomUUID(),category=randomUUID(),slug='crm-test-'+randomBytes(6).toString('hex');
const password=randomBytes(20).toString('hex'),salt=randomBytes(16).toString('hex'),passwordHash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');let token='',checks=0;
function check(value:unknown,message:string){assert.ok(value,message);checks++;}
async function rpc(path:string,body:any={},location=locations[0]){const response=await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'POST',path,body,location_id:location,access_token:token}),signal:AbortSignal.timeout(45000)});return response.json();}
const pos=(action:string,payload:any={},location=locations[0],operationId=randomUUID())=>rpc('/pos',{action,payload,operation_id:operationId},location);
try{
  await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${business}','${slug}','Prueba temporal CRM');${locations.map((id,i)=>`INSERT INTO locations(id,business_id,slug,name,color)VALUES('${id}','${business}','${['cocteleria','cafeteria','gcobarf'][i]}','CRM ${i}','#a47a47');`).join('')}${[[owner,'owner','Jefe CRM','OWNER'],[waiter,'waiter','Mesera CRM','WAITER']].map(([id,name,full,role])=>`INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${id}','${business}','${name}','${full}','${passwordHash}');${locations.slice(0,role==='OWNER'?1:2).map(location=>`INSERT INTO user_location_roles VALUES('${business}','${id}','${location}','${role}');`).join('')}`).join('')}COMMIT;END;`);
  let result=await rpc('/auth/login',{business_slug:slug,username:'owner',password});check(result.status===200,'Owner login');const ownerToken=result.data.access_token;token=ownerToken;
  result=await rpc('/auth/login',{business_slug:slug,username:'waiter',password});check(result.status===200,'Waiter login');const waiterToken=result.data.access_token;
  for(const [index,location] of locations.slice(0,2).entries()){
    token=ownerToken;const boot=await pos('bootstrap',{},location);check(boot.status===200,'Scoped bootstrap');const table=boot.data.value.tables[1].id;
    await pos('query',{table:'menu_categories',op:'insert',values:{id:category,name:'Productos CRM',sort_order:0,is_active:true},filters:[]},location);
    await pos('query',{table:'menu_items',op:'insert',values:{id:product,name:'Café CRM',category_id:category,price:5000,is_available:true},filters:[]},location);
    const profile={name:'Cliente directo',phone:'3001112233',birthDate:'1990-01-01',contactConsent:true},clientId=randomUUID();
    const save={id:randomUUID(),command:'customer_crm_save',payload:{id:clientId,revision:0,active:true,...profile}};
    result=await pos('operations_apply',save,location);check(result.status===200,'Direct CRM registration');
    let snapshot=(await pos('operations_snapshot',{},location)).data.value;const original=snapshot.model.customers.find((c:any)=>c.id===clientId);check(original.createdById===owner&&original.createdAt&&original.allowCredit===false,'Creator and no implicit credit');
    check((await pos('operations_apply',{...save,id:randomUUID(),payload:{...save.payload,id:randomUUID(),phone:'+57 3001112233'}},location)).status===409,'Duplicate phone rejected');
    check((await pos('operations_apply',{...save,id:randomUUID(),payload:{...save.payload,id:randomUUID(),birthDate:'2026-02-30'}},location)).status===400,'Invalid birthday rejected');
    check((await pos('operations_apply',{...save,id:randomUUID(),payload:{...save.payload,revision:1,name:'Cliente actualizado'}},location)).status===200,'Edit CRM profile');
    snapshot=(await pos('operations_snapshot',{},location)).data.value;check(snapshot.model.customers[0].createdAt===original.createdAt,'Creation remains unchanged');
    const creditEdit={id:randomUUID(),command:'customer_save',payload:{id:clientId,revision:2,name:'Cliente actualizado',phone:profile.phone,document:'',active:true,contactConsent:true,allowCredit:true,creditLimit:50000,paymentFrequency:'once',paymentDate:''}};
    check((await pos('operations_apply',creditEdit,location)).status===200,'Existing credit editor remains available');
    snapshot=(await pos('operations_snapshot',{},location)).data.value;check(snapshot.model.customers[0].birthDate===profile.birthDate&&snapshot.model.customers[0].createdAt===original.createdAt,'Credit edits preserve birthday and CRM creation');
    token=waiterToken;check((await pos('operations_apply',{...save,id:randomUUID()},location)).status===403,'Waiter cannot write directly to CRM');snapshot=(await pos('operations_snapshot',{},location)).data.value;check(snapshot.model.customers.length===0&&snapshot.model.debts.length===0,'Waiter cannot download CRM or debt records');
    const registration={name:'Cliente del mesero '+index,phone:'3009998877',birthDate:'1995-11-14',contactConsent:true},order={id:randomUUID(),tableId:table,items:[{productId:product,quantity:1,unitPrice:5000,notes:''}],notes:'',customerRegistration:registration},job=randomUUID();
    result=await pos('order_submit',{...order,id:randomUUID(),customerRegistration:{...registration,contactConsent:false}},location);check(result.status===400,'Consent required');
    result=await pos('order_submit',{...order,id:randomUUID(),customerRegistration:{...registration,birthDate:'2999-01-01'}},location);check(result.status===400,'Future birthday rejected');
    result=await pos('order_submit',{...order,id:randomUUID(),items:[{...order.items[0],unitPrice:1}],customerRegistration:{...registration,phone:'3005556677'}},location);check(result.status===409,'Invalid order rejected atomically');
    result=await pos('order_submit',order,location,job);check(result.status===200,'Customer and order committed together');const association=result.data.value.order;
    check(!JSON.stringify(result.data.value).includes(registration.phone)&&!JSON.stringify(result.data.value).includes(registration.birthDate),'Order response contains no contact or birthday');
    check((await pos('order_submit',order,location,job)).status===200,'Retry is idempotent');
    check((await pos('order_submit',{...order,id:randomUUID(),customerRegistration:{...registration,phone:'+57 3009998877',name:'Otro nombre'}},location)).data.value.order.customerId===association.customerId,'Existing phone is associated without duplicate');
    token=ownerToken;snapshot=(await pos('operations_snapshot',{},location)).data.value;check(snapshot.model.customers.length===2&&snapshot.docs.service_requests.length===2,'No duplicates and invalid requests leave no records');
    const enrolled=snapshot.model.customers.find((c:any)=>c.id===association.customerId);check(enrolled.createdById===waiter&&enrolled.createdByName==='Mesera CRM'&&enrolled.name===registration.name&&enrolled.birthDate===registration.birthDate,'Waiter attribution and prior data preserved');
    check((await pos('order_accept',{requestId:order.id,expectedSessionId:null},location)).status===200,'Normal acceptance flow');snapshot=(await pos('operations_snapshot',{},location)).data.value;
    check(snapshot.docs.session_items[0].customer_id===association.customerId&&snapshot.model.tickets[0].customerId===association.customerId,'Association reaches accepted order and preparation ticket');
  }
  token=ownerToken;const forbidden={id:randomUUID(),command:'customer_crm_save',payload:{id:randomUUID(),revision:0,name:'No corresponde',phone:'3001234567',birthDate:'1990-01-01',contactConsent:true,active:true}};
  check((await pos('operations_apply',forbidden,locations[2])).status===403,'GCOBARF is outside CRM registration scope');
  console.log(JSON.stringify({oracleCRMChecks:checks}));
}finally{
  await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${business}' AND slug='${slug}') LOOP DELETE FROM alliance_raw_movements WHERE business_id=x.id;DELETE FROM alliance_raw_stock WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
}
