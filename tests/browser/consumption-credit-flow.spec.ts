import {test,expect,type Page} from '@playwright/test';
import {backend,ready} from './helpers/operational-backend';

async function pickCustomer(page:Page){
  await page.locator('.op-customer-picker-toggle').click();
  await page.locator('.op-customer-picker [role=option]').filter({hasText:'Ana Pérez'}).click();
}
async function queueProduct(page:Page,quantity:string,enter=false){
  await page.locator('#consumptionProductSearch').fill('Producto');
  await page.locator('[data-consumption-product]').first().click();
  await page.locator('#consumptionForm [name=quantity]').fill(quantity);
  if(enter)await page.locator('#consumptionForm [name=quantity]').press('Enter');
  else await page.locator('#consumptionQueueButton').click();
}
for(const offline of [false,true])test('varios consumos de selección pasan a cartera '+(offline?'sin conexión':'con conexión'),async({page,context})=>{
  test.setTimeout(60000);
  const server=await backend(page);
  server.state.operations.customers=[{id:'ana',name:'Ana Pérez',active:true,allowCredit:true,creditLimit:1000000,revision:1}];
  await ready(page);
  if(!offline)await page.evaluate(async()=>{const w=window as any,original=w.OracleDb.remote,stale=await original('operations_snapshot');w.OracleDb.remote=(action:string,...args:any[])=>action==='operations_snapshot'?new Promise(resolve=>w.releaseOldSnapshot=()=>resolve(stale)):original(action,...args);w.oldSnapshot=w.OperationsPanel.load(true);w.OracleDb.remote=original;});
  if(offline)await context.setOffline(true);
  await page.locator('#tablesGrid [data-open-table="table-0"]').click();
  await pickCustomer(page);
  await page.locator('[name=credit_consumption_due]').fill('2026-12-01');
  await queueProduct(page,'2',true);await queueProduct(page,'3');
  await expect(page.locator('#consumptionSelectionLines > div')).toHaveCount(2);
  await page.locator('#addConsumptionToCredit').click();
  await expect(page.locator('#consumptionDialog')).toBeHidden();
  await expect(page.locator('#metricOpen')).toHaveText('0');
  await page.locator('.admin-sidebar [href="#customers"]').click();
  await expect(page.locator('.op-client-card')).toContainText(/50\.000/);
  if(!offline){await page.evaluate(async()=>{const w=window as any;w.releaseOldSnapshot();await w.oldSnapshot;});await expect(page.locator('.op-client-card')).toContainText(/50\.000/);}
  await page.getByRole('button',{name:'Cuentas por cobrar',exact:true}).click();
  await expect(page.locator('[data-debt-filter]')).toHaveValue('pending');
  await expect(page.locator('#customers .op-records')).toContainText(/50\.000/);
  const local=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));
  expect(local.model.debts).toHaveLength(1);expect(local.model.debts[0].total).toBe(50000);
  expect(local.sales[0].items).toHaveLength(2);
  if(offline)await context.setOffline(false);
  await page.evaluate(()=>void (window as any).AllianceOffline.flush());
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.operations.debts).toHaveLength(1);expect(server.state.operations.debts[0].total).toBe(50000);
});

test('reprogramar una cuenta offline conserva la fecha tras recargar y un reintento no duplica el cambio',async({page,context})=>{
  test.setTimeout(60000);const server=await backend(page,{lostAck:true,lostAckAction:'operations_apply'});server.state.operations.customers=[{id:'ana',name:'Ana Pérez',active:true,allowCredit:true,creditLimit:100000,revision:1,paymentFrequency:'monthly',paymentDate:'2026-12-01'}];server.state.operations.debts=[{id:'opening',customerId:'ana',customerName:'Ana Pérez',total:30000,paid:5000,dueDate:'2026-12-01',reference:'Saldo anterior'}];await ready(page);await context.setOffline(true);await page.locator('.admin-sidebar [href="#customers"]').click();await page.locator('[data-op=edit-customer]').click();const form=page.locator('#operationsDialog form');await form.locator('[name=paymentFrequency]').selectOption('fortnightly');await form.locator('[name=paymentDate]').fill('2026-12-15');await form.locator('[name=rescheduleDebts]').check();await form.getByRole('button',{name:'Guardar registro',exact:true}).click();await expect(page.locator('#operationsDialog')).toBeHidden();await page.reload();await expect(page.locator('.op-client-card')).toContainText('Cada 15 días');await expect(page.locator('.op-client-card')).toContainText(/25\.000/);await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.counts().ackLost).toBe(true);expect(server.state.operations.debts[0]).toMatchObject({dueDate:'2026-12-15',total:30000,paid:5000});expect(server.state.operations.debts[0].dueDateChanges).toHaveLength(1);
});

for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal'])test('desglose, edición sin perder selección y acuerdo de pago en '+branch,async({page})=>{
  test.setTimeout(60000);await page.goto('/negocios/'+branch+'/admin.html?demo=1&branch='+branch);await expect(page.locator('#metricTables')).toHaveText('24');
  const fixture=await page.evaluate(async()=>{const w=window as any,s=await w.OracleDb.remote('operations_snapshot'),p=s.docs.menu_items[0],table=s.docs.restaurant_tables[0];await w.OracleDb.remote('operations_apply',{id:crypto.randomUUID(),command:'customer_save',payload:{id:'ana',revision:0,name:'Ana Pérez',active:true,allowCredit:true,creditLimit:1000000}});await w.OracleDb.remote('order_submit',{id:'edit-preview',tableId:table.id,items:[{productId:p.id,quantity:1,unitPrice:p.price}]});await w.OracleDb.remote('order_accept',{requestId:'edit-preview',expectedSessionId:null});await w.OperationsPanel.load(true);document.dispatchEvent(new CustomEvent('alliance-order-changed'));return {table:table.id,name:p.name,price:p.price};});
  await expect(page.locator('#metricOpen')).toHaveText('1');await page.locator('#tablesGrid [data-open-table="'+fixture.table+'"]').click();await page.locator('#consumptionProductSearch').fill(fixture.name);await page.locator('[data-consumption-product]').first().click();await page.locator('#consumptionForm [name=quantity]').fill('2');await page.locator('#consumptionQueueButton').click();await expect(page.locator('#viewTableConsumption')).toBeHidden();
  const preview=page.locator('#tableConsumptionPreview');await expect(preview).toBeVisible();if(branch==='cocteleria')await page.screenshot({path:'test-results/consumption-preview-desktop.png'});const field=await page.locator('#consumptionProductSearch').boundingBox(),box=await preview.boundingBox();expect(box!.x+box!.width).toBeLessThan(field!.x);
  await preview.locator('[data-saved-consumption]').dblclick();const editor=page.locator('#savedConsumptionDialog');await expect(editor).toBeVisible();if(branch==='cocteleria')await page.screenshot({path:'test-results/saved-consumption-editor.png'});await editor.locator('[name=quantity]').fill('3');await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(editor).toBeHidden();await expect(page.locator('#consumptionSelectionLines > div')).toHaveCount(1);await expect(preview).toContainText('3 ×');
  await pickCustomer(page);await page.locator('[name=credit_consumption_due]').fill('2026-12-01');await page.locator('#addConsumptionToCredit').click();await expect(page.locator('#metricOpen')).toHaveText('0');
  const nav=page.locator('.admin-sidebar [href="#customers"]');expect(await nav.evaluate(e=>e.previousElementSibling?.getAttribute('href'))).toBe('#accounts');await expect(nav).toHaveAttribute('data-nav-group','operation');await nav.click();await expect(page.locator('.op-client-card')).toContainText('Ana Pérez');await page.locator('[data-op=edit-customer]').click();const form=page.locator('#operationsDialog form');await form.locator('[name=paymentFrequency]').selectOption('fortnightly');await form.locator('[name=paymentDate]').fill('2026-12-15');await form.locator('[name=rescheduleDebts]').check();if(branch==='cocteleria')await page.screenshot({path:'test-results/customer-payment-agreement.png'});await form.getByRole('button',{name:'Guardar registro',exact:true}).click();await expect(page.locator('#operationsDialog')).toBeHidden();
  const snapshot=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));expect(snapshot.model.customers[0]).toMatchObject({paymentFrequency:'fortnightly',paymentDate:'2026-12-15'});expect(snapshot.model.debts[0]).toMatchObject({dueDate:'2026-12-15',total:fixture.price*5,paid:0});expect(snapshot.model.debts[0].dueDateChanges).toHaveLength(1);
  await page.locator('.admin-sidebar [href="#dashboard"]').click();await page.locator('#tablesGrid [data-open-table="'+fixture.table+'"]').click();await pickCustomer(page);await expect(page.locator('[name=credit_consumption_due]')).toHaveValue('2026-12-15');await page.locator('[data-cancel-consumption]').first().click();
  await page.setViewportSize({width:390,height:844});await page.evaluate(async({table,name,price})=>{const w=window as any,s=await w.OracleDb.remote('operations_snapshot'),p=s.docs.menu_items.find((p:any)=>p.name===name);await w.OracleDb.remote('order_submit',{id:'mobile-preview',tableId:table,items:[{productId:p.id,quantity:1,unitPrice:price}]});await w.OracleDb.remote('order_accept',{requestId:'mobile-preview',expectedSessionId:null});document.dispatchEvent(new CustomEvent('alliance-order-changed'));},fixture);await expect(page.locator('#metricOpen')).toHaveText('1');await page.locator('#tablesGrid [data-open-table="'+fixture.table+'"]').click();await page.locator('#viewTableConsumption').click();await expect(preview).toBeVisible();const mobilePreview=await preview.boundingBox(),mobileField=await page.locator('#consumptionProductSearch').boundingBox();expect(mobilePreview!.y).toBeLessThan(mobileField!.y);if(branch==='cocteleria')await page.screenshot({path:'test-results/consumption-preview-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('mensajes del sistema conservan cancelación, teclado, cola y texto seguro sin diálogos nativos',async({page})=>{
  const native:string[]=[];page.on('dialog',d=>{native.push(d.type());void d.dismiss();});await page.goto('/index.html');
  await page.evaluate(()=>{const w=window as any;w.answer=w.AllianceDialogs.confirm('¿Eliminar <img src=x> este registro?');w.notice=w.AllianceDialogs.alert('Cambios conservados');});
  const dialog=page.locator('#systemMessageDialog');await expect(dialog).toContainText('<img src=x>');await expect(dialog.locator('img')).toHaveCount(0);await page.keyboard.press('Escape');await expect(dialog).toContainText('Cambios conservados');expect(await page.evaluate(()=>(window as any).answer)).toBe(false);await dialog.getByRole('button',{name:'Entendido',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.setViewportSize({width:320,height:700});await page.evaluate(()=>{const w=window as any;w.promptAnswer=w.AllianceDialogs.prompt({message:'Nombre del registro',value:'Anterior'});});await dialog.locator('input').fill('Nuevo');await dialog.locator('input').press('Enter');expect(await page.evaluate(()=>(window as any).promptAnswer)).toBe('Nuevo');expect(native).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('el cambio de fecha respeta las cuentas que el usuario vio al abrir el acuerdo',async({page})=>{
  await page.goto('/negocios/cocteleria/admin.html?demo=1');await expect(page.locator('#metricTables')).toHaveText('24');
  await page.evaluate(async()=>{const w=window as any;await w.OracleDb.remote('operations_apply',{id:crypto.randomUUID(),command:'customer_save',payload:{id:'ana',revision:0,name:'Ana Pérez',active:true,allowCredit:true,creditLimit:100000}});await w.OracleDb.remote('operations_apply',{id:crypto.randomUUID(),command:'debt_add',payload:{id:'seen',customerId:'ana',total:10000,dueDate:'2026-12-01',reference:'Cuenta vista'}});await w.OperationsPanel.load(true);});
  await page.locator('.admin-sidebar [href="#customers"]').click();await page.locator('[data-op=edit-customer]').click();const form=page.locator('#operationsDialog form');await form.locator('[name=paymentDate]').fill('2026-12-15');await form.locator('[name=rescheduleDebts]').check();
  await page.evaluate(async()=>{const w=window as any;await w.OracleDb.remote('operations_apply',{id:crypto.randomUUID(),command:'debt_add',payload:{id:'newer',customerId:'ana',total:5000,dueDate:'2026-12-01',reference:'Cuenta que llegó después'}});await w.OperationsPanel.load(true);});
  await form.getByRole('button',{name:'Guardar registro',exact:true}).click();await expect(page.locator('#operationsDialog')).toBeHidden();const snapshot=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));expect(snapshot.model.debts.find((d:any)=>d.id==='seen').dueDate).toBe('2026-12-15');expect(snapshot.model.debts.find((d:any)=>d.id==='newer').dueDate).toBe('2026-12-01');
});
