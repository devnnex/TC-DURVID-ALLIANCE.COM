import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {backend,ready,branch,product} from './helpers/operational-backend';

for(const slug of ['cocteleria','cafeteria','gcobarf','sucursal'])test(slug+': bandeja de jefe explica faltantes y se actualiza al reponer',async({page})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;
 server.state.units.push({id:'ml',dimension:'VOLUME',factor:1});
 server.state.operations.ingredients=[{id:'milk',name:'Leche entera',unit:'ml',quantity:450,unitCost:1,minStock:0}];
 server.state.operations.recipes=[{productId:product,managed:true,name:'Café',lines:[{ingredientId:'milk',unit:'ml',quantity:100}]}];
 await ready(page,'',slug);await page.locator('#stockAlertBell').click();const dialog=page.locator('#stockAlertsDialog');
 await expect(dialog).toContainText('550 ml de Leche entera');await expect(dialog).toContainText('6:30 a. m. y 6:30 p. m.');await expect(dialog.getByRole('button',{name:'Activar notificaciones',exact:true})).toBeDisabled();
 await page.evaluate(async()=>{await (window as any).OracleDb.remote('operations_apply',{command:'materials_adjust',payload:{ingredientId:'milk',unit:'ml',quantity:550,totalCost:550,kind:'in',reason:'Reposición'}});});await expect(dialog).toContainText('Todo al día');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

async function fakeDevice(page:Page){
 await page.addInitScript(()=>{
  Object.defineProperty(window,'Notification',{configurable:true,value:class{static get permission(){return localStorage.getItem('mock-permission')||'default';}static async requestPermission(){localStorage.setItem('mock-prompts',String(Number(localStorage.getItem('mock-prompts')||0)+1));localStorage.setItem('mock-permission','granted');return 'granted';}}});
  const subscription=()=>{const endpoint=localStorage.getItem('mock-endpoint');return endpoint?{endpoint,options:{},toJSON:()=>({endpoint,expirationTime:null,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}),unsubscribe:async()=>{localStorage.removeItem('mock-endpoint');localStorage.setItem('mock-unsubscribes',String(Number(localStorage.getItem('mock-unsubscribes')||0)+1));return true;}}:null;};
  Object.defineProperty(PushManager.prototype,'getSubscription',{configurable:true,value:async()=>subscription()});
  Object.defineProperty(PushManager.prototype,'subscribe',{configurable:true,value:async()=>{const n=Number(localStorage.getItem('mock-subscribes')||0)+1;localStorage.setItem('mock-subscribes',String(n));localStorage.setItem('mock-endpoint','https://fcm.googleapis.com/fcm/send/test-'+n);return subscription();}});
 });
}
for(const expire of [false,true])test('activación permanente al recargar y volver a entrar'+(expire?' con renovación de suscripción':' sin repetir permisos'),async({page})=>{
 await fakeDevice(page);const server=await backend(page),active=new Set<string>();let subscriptions=0;
 server.context.is_owner=false;(server.context as any).roles={[branch]:['BOSS']};
 await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{const r=route.request().postDataJSON(),a=r.body?.action;if(!['stock_alert_feed','stock_alert_subscribe','stock_alert_unsubscribe'].includes(a)){await route.fallback();return;}let value:any={configured:true,publicKey:'A'.repeat(87),subscriptionKeys:[...active],alerts:[]};if(a==='stock_alert_subscribe'){subscriptions++;active.add(createHash('sha256').update(r.body.payload.subscription.endpoint).digest('hex'));value={ok:true};}if(a==='stock_alert_unsubscribe'){active.delete(createHash('sha256').update(r.body.payload.endpoint).digest('hex'));value={ok:true};}await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{value}})});});
 await ready(page);await page.locator('#stockAlertBell').click();await page.getByRole('button',{name:'Activar notificaciones',exact:true}).click();await expect(page.locator('[data-stock-feedback]')).toContainText('autorización queda guardada');await expect(page.locator('[data-stock-enable]')).toBeHidden();
 await page.locator('[data-stock-close]').click();await page.locator('#logoutButton').click();await expect(page.locator('#adminLogin')).toBeVisible();await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm [type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');
 if(expire)await page.evaluate(()=>localStorage.removeItem('mock-endpoint'));await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');await page.locator('#stockAlertBell').click();await expect(page.locator('[data-stock-push-status]')).toContainText('Notificaciones activadas');
 expect(await page.evaluate(()=>localStorage.getItem('mock-prompts'))).toBe('1');expect(subscriptions).toBe(expire?2:1);expect(await page.evaluate(()=>localStorage.getItem('mock-unsubscribes'))).toBeNull();
 await page.getByRole('button',{name:'Desactivar notificaciones',exact:true}).click();await expect(page.locator('[data-stock-feedback]')).toContainText('desactivadas');await page.locator('[data-stock-close]').click();await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');expect(subscriptions).toBe(expire?2:1);
});

test('administrador sin rol de jefe no ve ni activa suscripciones',async({page})=>{
 const server=await backend(page);server.context.is_owner=false;(server.context as any).roles={[branch]:['ADMIN']};await ready(page);await expect(page.locator('#stockAlertBell')).toBeHidden();expect(await page.evaluate(()=>!!(window as any).OracleDb.user())).toBe(true);
});
