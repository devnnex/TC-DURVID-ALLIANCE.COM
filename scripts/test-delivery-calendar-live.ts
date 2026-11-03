import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeSql,ordsRoot} from './ords-sql.js';

// Isolated tenant: validates the production RPC without touching business data.
const b=randomUUID(),u=randomUUID(),g=randomUUID(),l=randomUUID(),product=randomUUID(),customer=randomUUID(),other=randomUUID();
const slug='calendar-check-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex');
const hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
let token='',checks=0;
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks++;};
async function rpc(path:string,body:any={},location=g){return (await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5500'},body:JSON.stringify({method:'POST',path,body,location_id:location,access_token:token}),signal:AbortSignal.timeout(45000)})).json();}
const action=(action:string,payload:any={},location=g,id=randomUUID())=>rpc('/pos',{action,payload,operation_id:id},location);
const command=(command:string,payload:any)=>action('operations_apply',{id:randomUUID(),command,payload});
const query=(table:string,values:any,op='insert',id?:string,location=g)=>action('query',{table,op,values,filters:id?[{field:'id',op:'eq',value:id}]:[]},location);
const snapshot=async()=>(await action('operations_snapshot')).data.value;
try{
  await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${b}','${slug}','Agenda temporal');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${u}','${b}','owner','Jefe agenda','${hash}');INSERT INTO locations(id,business_id,slug,name,color)VALUES('${g}','${b}','gcobarf','Agenda','#a47a47');INSERT INTO locations(id,business_id,slug,name,color)VALUES('${l}','${b}','cocteleria','Mesas','#a47a47');INSERT INTO user_location_roles VALUES('${b}','${u}','${g}','OWNER');COMMIT;END;`);
  const login=await rpc('/auth/login',{business_slug:slug,username:'owner',password});check(login.status===200,'Inicia sesión');token=login.data.access_token;
  for(const [id,name]of [[customer,'Cliente A'],[other,'Cliente B']])check((await command('customer_save',{id,revision:0,name,phone:'',document:'',active:true,contactConsent:false,allowCredit:true,creditLimit:100000})).status===200,'Crea cliente activo');
  check((await query('menu_items',{id:product,name:'Entrega de prueba',price:10000,is_available:true})).status===200,'Crea producto');
  check((await action('upsert_inventory',{item:{productId:product,code:'CAL',unit:'unidad',costPrice:1000,salePrice:10000,stock:20,minStock:0}})).status===200,'Abastece producto');
  const first=randomUUID(),second=randomUUID(),values={table_id:null,status:'open',sale_channel:'walk_in',delivery_date:'2026-11-20',delivery_time:'09:30',customer_id:customer,payer_name:'Nombre alterado'};
  check((await query('table_sessions',{id:first,...values})).status===200,'Programa primera cuenta');
  check((await query('table_sessions',{id:second,...values,customer_id:other,delivery_time:'14:00'})).status===200,'Varios clientes por día');
  let snap=await snapshot();check(snap.docs.table_sessions.find((s:any)=>s.id===first)?.payer_name==='Cliente A','Servidor usa el cliente del catálogo');
  check((await query('table_sessions',{...values,id:randomUUID(),delivery_date:'2026-02-30'})).status===400,'Rechaza fecha imposible');
  check((await query('table_sessions',{...values,id:randomUUID(),delivery_time:'25:00'})).status===400,'Rechaza hora imposible');
  check((await query('table_sessions',{...values,id:randomUUID(),customer_id:randomUUID()})).status===400,'Rechaza cliente ajeno');
  check((await query('table_sessions',{...values,id:randomUUID()},'insert',undefined,l)).status===400,'Otros negocios conservan mesas');
  const line=randomUUID();check((await query('session_items',{id:line,session_id:first,menu_item_id:product,item_name:'Entrega de prueba',quantity:2,unit_price:10000,status:'confirmed'})).status===200,'Agrega consumo con flujo actual');
  check((await query('table_sessions',{customer_id:other},'update',first)).status===409,'Protege cliente con consumos');
  check((await query('table_sessions',{delivery_date:'2026-11-21',delivery_time:'10:00'},'update',first)).status===200,'Reprograma cuenta sin perder consumo');
  const login2=await rpc('/auth/login',{business_slug:slug,username:'owner',password});token=login2.data.access_token;
  snap=await snapshot();check(snap.docs.table_sessions.some((s:any)=>s.id===first&&s.delivery_date==='2026-11-21')&&snap.docs.session_items.some((i:any)=>i.id===line),'Otra sesión recibe agenda y consumos');
  const sale=randomUUID(),invoice={id:sale,number:'CAL-'+sale.slice(0,8),sessionId:first,saleChannel:'walk_in',table:'Entrega Cliente A',customerId:customer,creditDueDate:'2026-11-30',createdAt:new Date().toISOString(),items:[{id:line,menu_item_id:product,item_name:'Entrega de prueba',quantity:2,unit_price:10000}],totals:{subtotal:20000,total:20000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'credit',amount:20000}]};
  const sold=await action('record_sale',{invoice},g,sale);check(sold.status===200,'Envía entrega a cartera: '+JSON.stringify(sold.data?.error));
  snap=await snapshot();check(snap.docs.table_sessions.find((s:any)=>s.id===first)?.status==='closed','Cobro cierra la cuenta programada');
  check(snap.model.debts.some((r:any)=>r.customerId===customer&&r.total-r.paid===20000),'Cartera usa el mismo cliente y valor');
  check((await query('table_sessions',{delivery_date:'2026-11-22'},'update',first)).status===409,'Cuenta cerrada conserva fecha histórica');
  const ingredient=(id:string,name:string,stockId:string)=>({id,name,stockId,unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false});
  const model={settings:{monthlyUnits:null,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients:[ingredient('chicken','Pollo','raw-chicken'),ingredient('spinach','Espinaca','raw-spinach')],expenses:[],channels:[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[{id:'batch',name:'Producción',output:1,size:'',category:'',wastePercent:0,currentPrice:10000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,productionDate:'2026-11-03',lines:[{ingredientId:'chicken',unit:'g',quantity:95,initialQuantity:100}]}]};
  check((await action('costing_save',{model,revision:0})).status===200,'Guarda pesos inicial y final distintos');
  check((await command('materials_link',{productId:product,recipeId:'batch',revision:1,salePortions:1,mappings:[{ingredientId:'chicken',stockId:'raw-chicken'}]})).status===200,'Vincula producción a pollo');
  check((await command('materials_save',{id:'raw-spinach',revision:0,name:'Espinaca',unit:'g',quantity:1000,totalCost:4000,minStock:0})).status===200,'Insumo compartido de espinaca');
  model.recipes[0].lines[0].ingredientId='spinach';
  const swapped=await action('costing_save',{model,revision:1});check(swapped.status===200,'Sustituye insumo vinculado: '+JSON.stringify(swapped.data?.error));
  snap=await snapshot();const linked=snap.model.recipes.find((r:any)=>r.productId===product);check(linked.mappings[0].stockId==='raw-spinach'&&linked.lines[0].ingredientId==='raw-spinach'&&linked.lines[0].quantity===100,'El descuento usa el nuevo insumo y el peso inicial');
  const changedSale=randomUUID(),changedInvoice={...invoice,id:changedSale,number:'SWAP-'+changedSale.slice(0,8),sessionId:randomUUID(),items:[{...invoice.items[0],id:randomUUID(),quantity:1}],totals:{...invoice.totals,subtotal:10000,total:10000},payments:[{method:'credit',amount:10000}]};
  check((await action('record_sale',{invoice:changedInvoice})).status===200,'Vende producción con insumo sustituido');
  snap=await snapshot();check(snap.model.ingredients.find((i:any)=>i.id==='raw-spinach').quantity===900&&snap.model.ingredients.find((i:any)=>i.id==='raw-chicken').quantity===0,'Descuenta 100 g sólo de espinaca');
  console.log(JSON.stringify({deliveryCalendarLiveChecks:checks}));
}finally{
  await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${b}' AND slug='${slug}') LOOP DELETE FROM alliance_raw_movements WHERE business_id=x.id;DELETE FROM alliance_raw_stock WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
  console.log('Datos de prueba retirados.');
}
