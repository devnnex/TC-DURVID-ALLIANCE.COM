import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {backend,branch as locationId} from './helpers/operational-backend';

for(const slug of ['cafeteria','cocteleria'])test(slug+': CRM claro, cumpleaños, responsable y sincronización sobre el respaldo',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-14T16:00:00Z'));await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/'+slug+'/admin.html')).href+'?demo=1#customers');
  await page.locator('.admin-sidebar [href="#customers"]').click();await expect(page.locator('#customers h2')).toHaveText('CRM clientes');
  await page.getByRole('button',{name:'Nuevo cliente',exact:false}).click();const dialog=page.locator('#operationsDialog');
  await dialog.locator('[name=name]').fill('María Pérez');await dialog.locator('[name=phone]').fill('3001234567');await dialog.locator('[name=birthDate]').fill('1990-11-14');await dialog.locator('[name=contactConsent]').check();
  await dialog.locator('[type=submit]').click();await expect(dialog).toBeHidden();
  const card=page.locator('.crm-client'),kpis=page.locator('.crm-kpis');await expect(card).toHaveCount(1);await expect(kpis.locator('.crm-kpi>strong')).toHaveText(['1','1','1']);await expect(kpis.locator('.crm-kpi-today')).toContainText('María Pérez');await expect(card).toContainText('Cumpleaños hoy');
  await card.locator('summary').click();await expect(card).toContainText('Administrador de demostración');await expect(card).toContainText('14/11/2026');
  await page.locator('#customers').screenshot({path:'test-results/crm-'+slug+'.png'});
  await card.getByRole('button',{name:'Editar cliente'}).click();await dialog.locator('[name=name]').fill('María Pérez Actualizada');await dialog.locator('[type=submit]').click();await expect(card).toContainText('María Pérez Actualizada');
  const customer=await page.evaluate(async()=>{const snapshot=await (window as any).OracleDb.remote('operations_snapshot');return snapshot.model.customers[0];});expect(customer.createdByName).toBe('Administrador de demostración');expect(customer.createdAt).toBe('2026-11-14T16:00:00.000Z');expect(customer.allowCredit).toBe(false);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#customers').screenshot({path:'test-results/crm-mobile-'+slug+'.png'});
  await page.getByRole('button',{name:'Cumpleaños',exact:true}).click();await expect(card).toHaveCount(1);
  await page.locator('.admin-sidebar [href="#inventory"]').click();await expect(page.locator('[data-material-refresh]')).toHaveCount(0);const badge=page.locator('.inventory-shared-sync');await expect(badge).toBeVisible();await expect(page.locator('.materials-tabs [data-material-sync]')).toHaveCount(0);
  const badgeBox=await badge.boundingBox(),backup=await page.locator('.inventory-history-sync').boundingBox();expect(badgeBox!.y+badgeBox!.height).toBeLessThanOrEqual(backup!.y);
});

for(const slug of ['cafeteria','cocteleria'])test(slug+': el mesero registra desde la comanda sin acceso al CRM y sincroniza una sola vez',async({page,context})=>{
  test.setTimeout(90000);const server=await backend(page,{lostAck:true,lostAckAction:'order_submit'});
  server.context.locations[0].slug=slug;server.context.is_owner=false;server.context.permissions[locationId]=['home.read','products.read','service.read','service.write','locations.read'];
  await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
    const request=route.request().postDataJSON();if(request.path!=='/pos'||request.body.action!=='operations_snapshot'){await route.fallback();return;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{value:{model:{...server.state.operations,customers:[],debts:[]},units:server.state.units,docs:server.state.docs,inventory:[],sales:[],at:new Date().toISOString(),docVersions:server.state.docVersions}}})});
  });
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.goto('/negocios/'+slug+'/index.html');
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm [type=submit]').click();await expect(page.locator('#waiterApp')).toBeVisible();
  await expect(page.locator('[data-product]').first()).toBeEnabled();await page.locator('[data-product]').first().click();await page.locator('#waiterTable').selectOption('table-0');
  await page.locator('#waiterRegisterCustomer').check();await page.locator('#waiterCustomerName').fill('Daniel Cliente');await page.locator('#waiterCustomerPhone').fill('3019876543');await page.locator('#waiterCustomerBirthday').fill('1995-11-14');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.waiter-customer-registration').screenshot({path:'test-results/waiter-crm-'+slug+'.png'});
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();await context.setOffline(true);
  await page.locator('#sendWaiterOrder').click();await expect(page.locator('#waiterStatus')).toContainText('registro guardados');await expect(page.locator('#waiterRegisterCustomer')).not.toBeChecked();await expect(page.locator('#waiterCustomerFields')).toBeHidden();expect(server.state.operations.customers).toHaveLength(0);
  await page.reload();await expect(page.locator('#waiterApp')).toBeVisible();await expect(page.locator('#waiterSent')).toContainText('Daniel Cliente');
  const denied=await page.evaluate(async()=>{try{await (window as any).OracleDb.remote('operations_apply',{id:crypto.randomUUID(),command:'customer_crm_save',payload:{id:'forbidden',revision:0,name:'Otro',phone:'3001112233',birthDate:'1990-01-01',contactConsent:true,active:true}});return '';}catch(error){return (error as Error).message;}});expect(denied).toContain('permiso');
  await context.setOffline(false);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>server.counts().ackLost).toBe(true);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.operations.customers).toHaveLength(1);expect(server.state.docs.service_requests.filter((r:any)=>r.request_type==='order')).toHaveLength(1);const customer=server.state.operations.customers[0],request=server.state.docs.service_requests[0];expect(customer.source).toBe('waiter');expect(customer.createdByName).toBeTruthy();expect(request.order.customerId).toBe(customer.id);expect(request.order).not.toHaveProperty('phone');expect(request.order).not.toHaveProperty('birthDate');
  await page.goto('/negocios/'+slug+'/admin.html');await expect(page.locator('.admin-sidebar [href="#customers"]')).toBeHidden();
});
