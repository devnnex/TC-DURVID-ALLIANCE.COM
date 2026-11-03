import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeSql,ordsRoot} from './ords-sql.js';

// Temporary tenant only: no appointments or stock belonging to real businesses are changed.
const b=randomUUID(),u=randomUUID(),g=randomUUID(),product=randomUUID(),customer=randomUUID();
const slug='cancel-check-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex');
const hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
let token='',checks=0;
function check(ok:unknown,label:string){assert.ok(ok,label);checks++;}
async function rpc(path:string,body:any={}){return (await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5500'},body:JSON.stringify({method:'POST',path,body,location_id:g,access_token:token}),signal:AbortSignal.timeout(45000)})).json();}
const action=(action:string,payload:any={},id=randomUUID())=>rpc('/pos',{action,payload,operation_id:id});
const query=(table:string,values:any,op='insert',id?:string)=>action('query',{table,op,values,filters:id?[{field:'id',op:'eq',value:id}]:[]});
const snapshot=async()=>(await action('operations_snapshot')).data.value;
try{
  await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${b}','${slug}','Cancelación temporal');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${u}','${b}','owner','Jefe agenda','${hash}');INSERT INTO locations(id,business_id,slug,name,color)VALUES('${g}','${b}','gcobarf','Agenda','#a47a47');INSERT INTO user_location_roles VALUES('${b}','${u}','${g}','OWNER');COMMIT;END;`);
  let login=await rpc('/auth/login',{business_slug:slug,username:'owner',password});check(login.status===200,'Inicia sesión');token=login.data.access_token;
  check((await action('operations_apply',{id:randomUUID(),command:'customer_save',payload:{id:customer,revision:0,name:'Cliente agenda',phone:'',document:'',active:true,contactConsent:false,allowCredit:true,creditLimit:100000}})).status===200,'Crea cliente');
  check((await query('menu_items',{id:product,name:'Producto terminado',price:10000,is_available:true})).status===200,'Crea producto');
  check((await action('upsert_inventory',{item:{productId:product,code:'CAL',unit:'unidad',costPrice:1000,salePrice:10000,stock:20,minStock:0}})).status===200,'Abastece productos terminados');
  check((await action('operations_apply',{id:randomUUID(),command:'materials_save',payload:{id:'raw',revision:0,name:'Insumo de producción',unit:'g',quantity:1000,totalCost:10000,minStock:0}})).status===200,'Abastece materia prima');
  const first=randomUUID(),second=randomUUID(),third=randomUUID();
  const values={table_id:null,status:'open',sale_channel:'walk_in',delivery_date:'2026-11-20',delivery_time:'09:30',customer_id:customer};
  for(const id of [first,second,third])check((await query('table_sessions',{id,...values})).status===200,'Programa entrega');
  const line=randomUUID();check((await query('session_items',{id:line,session_id:second,menu_item_id:product,item_name:'Producto terminado',quantity:2,unit_price:10000,status:'confirmed'})).status===200,'Agrega consumos sin cobrar');
  const ticket=randomUUID();check((await action('operations_apply',{id:randomUUID(),command:'ticket_send',payload:{id:ticket,sessionId:second,itemIds:[line],notes:''}})).status===200,'Envía consumos a preparación');
  check((await action('adjust_inventory',{adjustment:{eventId:randomUUID(),productId:product,delta:-2,sessionId:second,movementType:'CONSUMO_MESA',reference:'Consumo previo'}})).status===200,'Registra débito anterior de productos terminados');
  check((await query('table_sessions',{status:'cancelled'},'update',second)).status===200,'Cancela entrega con consumos');
  let snap=await snapshot();check(snap.docs.table_sessions.find((s:any)=>s.id===second)?.status==='cancelled','Conserva cuenta cancelada');check(snap.docs.session_items.find((s:any)=>s.id===line)?.status==='cancelled','Cancela consumos con la cuenta');
  check(snap.inventory.find((s:any)=>s.productId===product)?.stock===20,'Devuelve sólo productos descontados');check(snap.model.customers.some((c:any)=>c.id===customer&&c.active),'Conserva cliente activo');
  check(snap.model.ingredients.find((i:any)=>i.id==='raw')?.quantity===1000,'No devuelve materia prima de productos ya fabricados');check(snap.model.tickets.find((t:any)=>t.id===ticket)?.status==='cancelled','Cancela la comanda asociada');
  check(snap.docs.table_sessions.filter((s:any)=>s.status==='open').length===2,'Mantiene las otras entregas');
  check((await query('table_sessions',{status:'cancelled'},'update',second)).status===200,'Repetir cancelación es seguro');snap=await snapshot();check(snap.inventory.find((s:any)=>s.productId===product)?.stock===20,'Repetir no duplica devolución');
  check((await query('table_sessions',{status:'cancelled'},'update',first)).status===200,'Quita entrega sin productos');
  check((await query('session_items',{id:randomUUID(),session_id:second,menu_item_id:product,item_name:'Producto terminado',quantity:1,unit_price:10000,status:'confirmed'})).status===409,'No agrega consumos a la entrega cancelada');
  const paidLine=randomUUID();check((await query('session_items',{id:paidLine,session_id:third,menu_item_id:product,item_name:'Producto terminado',quantity:1,unit_price:10000,status:'confirmed'})).status===200,'Prepara entrega para cobrar');
  const sale=randomUUID(),invoice={id:sale,number:'CAL-'+sale.slice(0,8),sessionId:third,saleChannel:'walk_in',table:'Entrega cobrada',createdAt:new Date().toISOString(),items:[{id:paidLine,menu_item_id:product,item_name:'Producto terminado',quantity:1,unit_price:10000}],totals:{subtotal:10000,total:10000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:10000}]};
  check((await action('record_sale',{invoice},sale)).status===200,'Cobra otra entrega');
  check((await query('table_sessions',{status:'cancelled'},'update',third)).status===409,'Protege entrega ya cobrada');
  login=await rpc('/auth/login',{business_slug:slug,username:'owner',password});token=login.data.access_token;snap=await snapshot();check(snap.docs.table_sessions.filter((s:any)=>s.status==='cancelled').length===2,'Otra sesión ve las cancelaciones');check(snap.inventory.find((s:any)=>s.productId===product)?.stock===19,'Conserva saldo tras cobro');
  check((await query('table_sessions',{id:randomUUID(),...values,delivery_date:'2026-11-21'})).status===200,'Permite programar al mismo cliente otro día');
  console.log(JSON.stringify({deliveryCancellationLiveChecks:checks}));
}finally{
  await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${b}' AND slug='${slug}') LOOP DELETE FROM alliance_raw_movements WHERE business_id=x.id;DELETE FROM alliance_raw_stock WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
  console.log('Datos de prueba retirados.');
}
