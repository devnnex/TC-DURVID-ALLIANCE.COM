import {test,expect,type Page} from '@playwright/test';
import {backend,ready,branch,user} from './helpers/operational-backend';
async function fixture(page:Page,slug:string,lostAck=false){
 const server=await backend(page);server.context.locations[0].slug=slug;server.context.is_owner=false;(server.context as any).roles={[branch]:['BOSS']};
 const incoming:any={id:'received-surplus',kind:'ingredient-transfer',name:'Pulpa de mango',quantity:500,unit:'g',totalCost:null,note:'Refrigerado',sourceId:'other',sourceName:'Negocio vecino',destinationId:branch,destinationName:'Mi negocio',senderId:'other-boss',senderName:'Laura',recipientId:user,recipientName:'Responsable de prueba',at:new Date().toISOString(),status:'pending'};
 const history:any[]=[incoming],receipts=new Map<string,any>();let sent=0,accepted=0,failedAck=false;
 await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
  const r=route.request().postDataJSON(),a=r.body?.action,p=r.body?.payload;
  if(a!=='stock_alert_feed'&&!a?.startsWith('ingredient_transfer_')){await route.fallback();return;}
  let value:any;
  if(a==='stock_alert_feed')value={configured:false,subscriptionKeys:[],alerts:[],events:history.filter(t=>t.recipientId===user)};
  else if(a==='ingredient_transfer_feed')value={targets:[{id:'other',name:'Negocio vecino',bosses:[{id:'other-boss',name:'Laura'}]}],history};
  else if(receipts.has(r.body.operation_id))value=receipts.get(r.body.operation_id);
  else if(a==='ingredient_transfer_send'){sent++;const transfer={...p,id:'sent-'+sent,status:'pending',sourceId:branch,sourceName:'Mi negocio',destinationName:'Negocio vecino',senderId:user,senderName:'Responsable de prueba',recipientName:'Laura',at:new Date().toISOString()};history.unshift(transfer);value={transfer};receipts.set(r.body.operation_id,value);if(lostAck&&!failedAck){failedAck=true;await route.abort('failed');return;}}
  else{const t=history.find(t=>t.id===p.id);if(t.status==='pending'){t.status=a.endsWith('_accept')?'accepted':'rejected';if(t.status==='accepted'){accepted++;server.state.operations.ingredients.push({id:'mango',name:t.name,unit:t.unit,quantity:t.quantity,unitCost:0,minStock:0,revision:1});}}value={transfer:t};receipts.set(r.body.operation_id,value);}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{value}})});
 });
 await ready(page,'',slug);return {server,history,counts:()=>({sent,accepted})};
}
for(const slug of ['cafeteria','cocteleria'])test(slug+': un sobrante solo entra a la macro cuando el jefe acepta y conserva el envío al cambiar de vista',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const f=await fixture(page,slug,slug==='cocteleria');
 await page.locator('#stockAlertBell').click();const modal=page.locator('#stockAlertsDialog');await expect(modal).toContainText('Laura');await expect(modal).toContainText('500 g');await modal.locator('[data-stock-toggle]').click();
 const panel=modal.locator('[data-stock-panel=transfers]');await expect(panel).toBeVisible();await panel.locator('[name=name]').fill('Cáscara de piña');await panel.locator('[name=quantity]').fill('250');await panel.locator('[name=destinationId]').selectOption('other');await expect(panel.locator('[name=recipientId]')).toHaveValue('other-boss');
 await modal.locator('[data-stock-toggle]').click();await expect(modal.locator('[data-stock-panel=notices]')).toBeVisible();await modal.locator('[data-stock-toggle]').click();await expect(panel.locator('[name=name]')).toHaveValue('Cáscara de piña');
 await panel.locator('[data-transfer-submit]').click();if(slug==='cocteleria'){await expect(panel.locator('[data-transfer-status]')).toHaveAttribute('role','alert');await panel.locator('[data-transfer-submit]').click();}
 await expect(panel.locator('[data-transfer-status]')).toContainText('Envío registrado');expect(f.counts().sent).toBe(1);expect(f.server.state.operations.ingredients).toHaveLength(0);await expect(panel).toContainText('Sin precio · recibido sin costo');
 await panel.getByRole('button',{name:'Aceptar en mi macro'}).click();await expect(panel.locator('[data-transfer-status]')).toContainText('Insumo agregado');expect(f.counts().accepted).toBe(1);expect(f.server.state.operations.ingredients).toHaveLength(1);await expect(panel.getByRole('button',{name:'Aceptar en mi macro'})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const bounds=await modal.boundingBox();expect(bounds!.width).toBeLessThanOrEqual(390);await modal.screenshot({animations:'disabled',path:'test-results/surplus-'+slug+'-mobile.png'});
 await modal.locator('[data-stock-close]').click();await page.locator('#stockAlertBell').click();await expect(modal.locator('[data-stock-panel=notices]')).toBeVisible();expect(errors).toEqual([]);
});
test('el enlace de una notificación abre los envíos y un rol sin jefe no accede al formulario',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const f=await fixture(page,'cocteleria');await page.evaluate(()=>{history.replaceState(null,'','?stock-alert=1&ingredient-transfer=1');window.dispatchEvent(new CustomEvent('alliance-session-verified'));});await expect(page.locator('#stockAlertsDialog [data-stock-panel=transfers]')).toBeVisible();
 await page.evaluate(branch=>{const c=(window as any).OracleDb.identity().context;c.roles[branch]=['ADMIN'];window.dispatchEvent(new CustomEvent('alliance-session-verified'));},branch);await expect(page.locator('#stockAlertsDialog')).not.toBeVisible();await expect(page.locator('#stockAlertBell')).toBeHidden();expect(await page.evaluate(()=>(window as any).AllianceIngredientTransfers.allowed())).toBe(false);
});
test('un aviso nuevo actualiza la recepción abierta sin borrar el borrador del jefe',async({page})=>{
 const f=await fixture(page,'cocteleria');await page.locator('#stockAlertBell').click();await page.locator('[data-stock-toggle]').click();const panel=page.locator('[data-stock-panel=transfers]');await panel.locator('[name=name]').fill('Mi sobrante pendiente');
 f.history.unshift({...f.history[0],id:'second-surplus',name:'Banano maduro',quantity:200});
 await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'alliance-notice',branch:'cocteleria'}})));
 await expect(panel.locator('[data-transfer-history]')).toContainText('Banano maduro');await expect(panel.locator('[name=name]')).toHaveValue('Mi sobrante pendiente');
});
for(const slug of ['cafeteria','cocteleria'])test(slug+': contactos de proveedores, domiciliarios y mensajerías con búsqueda y acceso directo',async({page})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;server.state.operations.suppliers=[{id:'delivery',name:'Juan entregas',phone:'3001234567',document:'',active:true,contactType:'delivery',notes:'Zona norte',revision:1},{id:'courier',name:'Mensajería central',phone:'3009876543',document:'',active:true,contactType:'courier',notes:'Hasta las 8 p. m.',revision:1}];await ready(page,'',slug);await page.locator('.admin-sidebar [href="#supplies"]').click();await page.getByRole('button',{name:'Proveedores y contactos',exact:true}).click();await expect(page.locator('#supplies')).toContainText('Domiciliario');await expect(page.locator('#supplies')).toContainText('Zona norte');await expect(page.locator('#supplies .op-phone').first()).toHaveAttribute('href','tel:+573001234567');await page.locator('[data-supply-filter]').selectOption('courier');await expect(page.locator('#supplies .op-record:visible')).toHaveCount(1);await expect(page.locator('#supplies .op-record:visible')).toContainText('Mensajería central');await page.getByRole('button',{name:'Nuevo contacto',exact:true}).click();await expect(page.locator('#operationsDialog [name=contactType]')).toBeVisible();await expect(page.locator('#operationsDialog [name=notes]')).toBeVisible();
});
