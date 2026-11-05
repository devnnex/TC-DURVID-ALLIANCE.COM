import {test,expect,type Page} from '@playwright/test';
import {backend,product} from './helpers/operational-backend';

async function enter(page:Page){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.goto('/negocios/gcobarf/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#deliveryCalendar')).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}
async function schedule(page:Page,customer:string,time:string,close=true){
  await page.locator('[data-delivery-day]').first().click();const dialog=page.locator('#deliveryDialog');
  await dialog.locator('[name=date]').fill('2026-11-20');await dialog.locator('[name=time]').fill(time);
  await dialog.getByRole('combobox').fill(customer);await dialog.getByRole('option',{name:customer,exact:true}).click();
  await dialog.getByRole('button',{name:'Guardar entrega',exact:true}).click();await expect(dialog).toBeVisible();await expect(dialog.locator('[data-delivery-card]').filter({hasText:customer})).toBeVisible();
  if(close)await dialog.locator('[data-delivery-close]').click();
}
test('calendario programa varios clientes, comparte cuentas y usa el envío a cartera actual',async({page,browser})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.operations.customers=['Ana Pérez','Juan López'].map((name,i)=>({id:'client-'+i,name,active:true,allowCredit:true,creditLimit:100000,revision:1}));
  await enter(page);await expect(page.locator('#tablesGrid')).toBeHidden();
  await schedule(page,'Ana Pérez','09:30');await schedule(page,'Juan López','14:00');
  await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(page.locator('[data-delivery-card]')).toHaveCount(2);await expect(page.locator('#metricTables')).toHaveText('2');await expect(page.locator('#metricOpen')).toHaveText('2');
  const first=page.locator('[data-delivery-card]').filter({hasText:'Ana Pérez'});
  await first.locator('[data-delivery-open]').click();await expect(page.locator('#consumptionDialog')).toBeVisible();
  await expect(page.locator('#consumptionForm [name=credit_customer_id]')).toHaveValue('client-0');
  await page.locator('#consumptionProductSearch').fill('Producto');await page.locator('[data-consumption-product]').first().click();await page.locator('#consumptionForm [name=quantity]').fill('2');
  await page.locator('#consumptionQueueButton').click();await page.locator('[name=credit_consumption_due]').fill('2026-12-01');await page.locator('#addConsumptionToCredit').click();
  await expect(page.locator('#consumptionDialog')).toBeHidden();await expect.poll(()=>server.state.operations.debts.length).toBe(1);expect(server.state.operations.debts[0].customerId).toBe('client-0');expect(server.state.operations.debts[0].total).toBe(20000);
  await expect(page.locator('#metricOpen')).toHaveText('1');await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(first).toContainText('Pendiente de pago');
  const second=page.locator('[data-delivery-card]').filter({hasText:'Juan López'});await second.locator('[data-delivery-edit]').click();await page.locator('#deliveryDialog [name=time]').fill('16:15');await page.locator('#deliveryDialog [type=submit]').click();await expect(page.locator('#deliveryDialog')).toBeVisible();await expect(second).toContainText('16:15');
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4177',serviceWorkers:'allow'});await server.attach(context);const other=await context.newPage();await enter(other);
  await other.locator('[data-delivery-day="2026-11-20"]').click();await expect(other.locator('[data-delivery-card]')).toHaveCount(2);await expect(other.locator('[data-delivery-card]').filter({hasText:'Juan López'})).toContainText('16:15');await expect(other.locator('[data-delivery-card]').filter({hasText:'Ana Pérez'})).toContainText('20.000');await context.close();
  await page.screenshot({path:'test-results/gcobarf-calendar-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/gcobarf-calendar-mobile.png',fullPage:true});expect(errors).toEqual([]);
});

test('una entrega sin conexión se conserva al recargar y se envía al reconectar',async({page,context})=>{
  test.setTimeout(60000);const server=await backend(page);server.context.locations[0].slug='gcobarf';server.state.operations.customers=[{id:'client',name:'Ana Pérez',active:true,allowCredit:true,creditLimit:100000,revision:1}];
  await enter(page);await context.setOffline(true);await schedule(page,'Ana Pérez','09:30');await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(page.locator('[data-delivery-card]')).toHaveCount(1);expect(server.state.docs.table_sessions).toHaveLength(0);
  await page.reload();await expect(page.locator('[data-delivery-day="2026-11-20"]')).toBeVisible();await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(page.locator('[data-delivery-card]')).toContainText('Ana Pérez');
  await context.setOffline(false);await expect.poll(()=>server.state.docs.table_sessions.length,{timeout:20000}).toBe(1);await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:20000}).toBe(0);
});

test('guardar conserva la agenda y permite agregar consumos y cobrar con el diálogo actual',async({page})=>{
  const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.operations.customers=[{id:'ana',name:'Ana Pérez',active:true,allowCredit:true,creditLimit:100000,revision:1}];
  await enter(page);await schedule(page,'Ana Pérez','09:30',false);
  const dialog=page.locator('#deliveryDialog');await expect(dialog.getByRole('button',{name:'Cobrar',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Guardar entrega',exact:true}).click();await expect(dialog.locator('[data-delivery-status]')).toContainText('Entrega guardada');await expect(dialog.locator('[data-delivery-card]')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Agregar / ver productos'}).click();
  await page.locator('#consumptionProductSearch').fill('Producto');await page.locator('[data-consumption-product]').first().click();await page.locator('#consumptionForm [name=quantity]').fill('2');
  await page.locator('#consumptionSubmitButton').click();await expect(page.locator('#consumptionDialog')).toBeHidden();
  await page.locator('[data-delivery-day="2026-11-20"]').click();await dialog.getByRole('button',{name:'Cobrar',exact:true}).click();
  await expect(page.locator('#paymentDialog')).toBeVisible();await expect(page.locator('#paymentTableLabel')).toContainText('Ana Pérez');await expect(page.locator('#paymentTotal')).toContainText('20.000');
  await expect(page.locator('#paymentForm [name=customer_id]')).toHaveValue('ana');
  await page.locator('#paymentForm button[value=save]').click();await expect(page.locator('#paymentDialog')).toBeHidden();
  await expect.poll(()=>server.state.sales.length).toBe(1);expect(server.state.sales[0].totals.total).toBe(20000);
  await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(dialog).toContainText('Pagado');await expect(dialog.getByRole('button',{name:'Cobrar',exact:true})).toBeDisabled();
});

test('cobrar permite elegir una entrega del día sin mezclar clientes',async({page})=>{
  const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.operations.customers=['Ana Pérez','Juan López'].map((name,i)=>({id:'client-'+i,name,active:true,revision:1}));
  server.state.docs.table_sessions=server.state.operations.customers.map((c:any,i:number)=>({id:'delivery-'+i,delivery_date:'2026-11-20',delivery_time:'09:00',customer_id:c.id,payer_name:c.name,status:'open',sale_channel:'walk_in',table_id:null}));
  server.state.docs.session_items=server.state.docs.table_sessions.map((s:any,i:number)=>({id:'line-'+i,session_id:s.id,menu_item_id:product,item_name:'Producto de prueba',quantity:i+1,unit_price:10000,status:'confirmed'}));
  await enter(page);await page.locator('[data-delivery-day="2026-11-20"]').click();
  const dialog=page.locator('#deliveryDialog');await dialog.getByRole('button',{name:'Cobrar',exact:true}).click();await expect(page.locator('#paymentDialog')).toBeHidden();
  await dialog.locator('[data-delivery-card]').filter({hasText:'Juan López'}).getByRole('button',{name:'Cobrar',exact:true}).click();
  await expect(page.locator('#paymentDialog')).toBeVisible();await expect(page.locator('#paymentForm [name=session_id]')).toHaveValue('delivery-1');await expect(page.locator('#paymentTotal')).toContainText('20.000');
  expect(server.state.sales).toHaveLength(0);
});

test('quita entregas individuales sin perder clientes, sincroniza y permite programarlas de nuevo',async({page,context,browser})=>{
  test.setTimeout(90000);const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.operations.customers=['Ana Pérez','Juan López','Luz Díaz'].map((name,i)=>({id:'client-'+i,name,active:true,revision:1}));
  const day='2026-11-20';server.state.docs.table_sessions=server.state.operations.customers.map((c:any,i:number)=>({id:'delivery-'+i,delivery_date:day,delivery_time:String(8+i).padStart(2,'0')+':00',customer_id:c.id,payer_name:c.name,status:'open',sale_channel:'walk_in',table_id:null}));
  server.state.docs.session_items=[{id:'line',session_id:'delivery-1',menu_item_id:product,item_name:'Producto de prueba',quantity:2,unit_price:10000,status:'confirmed'}];
  // Some older accounts have already debited finished goods; cancellation returns just that debit.
  server.state.stock[product].stock=4998;server.state.movements=[{movementId:'old-debit',productId:product,sessionId:'delivery-1',type:'CONSUMO_MESA',delta:-2}];
  await enter(page);await page.locator('[data-delivery-day="'+day+'"]').click();
  const cards=page.locator('[data-delivery-card]'),juan=cards.filter({hasText:'Juan López'});
  await expect(cards).toHaveCount(3);await juan.locator('[data-delivery-remove]').click();await page.locator('.alliance-message button[value=cancel]').click();await expect(cards).toHaveCount(3);
  await juan.locator('[data-delivery-remove]').click();await expect(page.locator('.alliance-message')).toContainText('Juan López');await page.locator('.alliance-message button[value=accept]').click();
  await expect(cards).toHaveCount(2);await expect(page.locator('#metricTables')).toHaveText('2');await expect(page.locator('#metricOpen')).toHaveText('2');
  await expect.poll(()=>server.state.docs.table_sessions.find((s:any)=>s.id==='delivery-1').status).toBe('cancelled');
  expect(server.state.docs.session_items[0].status).toBe('cancelled');expect(server.state.stock[product].stock).toBe(5000);expect(server.state.operations.customers).toHaveLength(3);
  await context.setOffline(true);await cards.filter({hasText:'Ana Pérez'}).locator('[data-delivery-remove]').click();await page.locator('.alliance-message button[value=accept]').click();await expect(cards).toHaveCount(1);
  await page.reload();await expect(page.locator('#deliveryCalendar')).toBeVisible();await page.locator('[data-delivery-day="'+day+'"]').click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('Luz Díaz');
  await context.setOffline(false);await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:20000}).toBe(0);
  expect(server.state.docs.table_sessions.find((s:any)=>s.id==='delivery-0').status).toBe('cancelled');expect(server.state.stock[product].stock).toBe(5000);
  const otherContext=await browser.newContext({baseURL:'http://127.0.0.1:4177',serviceWorkers:'allow'});await server.attach(otherContext);const other=await otherContext.newPage();await enter(other);await other.locator('[data-delivery-day="'+day+'"]').click();await expect(other.locator('[data-delivery-card]')).toHaveCount(1);await otherContext.close();
  await page.locator('#deliveryDialog [data-delivery-close]').click();await schedule(page,'Juan López','15:30');await page.locator('[data-delivery-day="'+day+'"]').click();await expect(cards).toHaveCount(2);
  await cards.filter({hasText:'Juan López'}).locator('[data-delivery-remove]').click();await page.locator('.alliance-message button[value=accept]').click();await expect(cards).toHaveCount(1);
  await cards.locator('[data-delivery-remove]').click();await page.locator('.alliance-message button[value=accept]').click();await expect(cards).toHaveCount(0);await expect(page.locator('#metricTables')).toHaveText('0');
  expect(server.state.operations.customers).toHaveLength(3);expect(server.state.stock[product].stock).toBe(5000);
});
