import {test,expect,type Page} from '@playwright/test';
import {backend} from './helpers/operational-backend';

async function enter(page:Page){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.goto('/negocios/gcobarf/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#deliveryCalendar')).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}
async function schedule(page:Page,customer:string,time:string){
  await page.locator('[data-delivery-day]').first().click();const dialog=page.locator('#deliveryDialog');
  await dialog.locator('[name=date]').fill('2026-11-20');await dialog.locator('[name=time]').fill(time);
  await dialog.getByRole('combobox').fill(customer);await dialog.getByRole('option',{name:customer,exact:true}).click();
  await dialog.getByRole('button',{name:'Guardar entrega',exact:true}).click();await expect(dialog).toBeHidden();
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
  await expect(page.locator('#metricOpen')).toHaveText('1');await page.locator('[data-delivery-day="2026-11-20"]').click();await expect(first).toContainText('Cuenta cerrada');
  const second=page.locator('[data-delivery-card]').filter({hasText:'Juan López'});await second.locator('[data-delivery-edit]').click();await page.locator('#deliveryDialog [name=time]').fill('16:15');await page.locator('#deliveryDialog [type=submit]').click();await expect(page.locator('#deliveryDialog')).toBeHidden();
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
