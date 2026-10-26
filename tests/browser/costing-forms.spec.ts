import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {exerciseCostingForms} from './helpers/costing-flow.js';

for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal']){
  test(`costeo completo ${branch}: errores visibles, receta, gastos, precio, edición y eliminación`,async({page,context})=>{
    test.setTimeout(90000);await context.setOffline(true);const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/ords/'))requests.push(r.url());});
    await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href+'?demo=1&branch='+branch+'#costing');await expect(page.locator('#costingStatus')).toContainText('Demostración');
    await exerciseCostingForms(page);expect(errors).toEqual([]);expect(requests).toEqual([]);
  });
}

test('un guardado lento o fallido se informa y conserva el borrador para reintentar',async({page})=>{
  await page.route('**/api-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.ALLIANCE_CONFIG={API_URL:'https://example.oraclecloudapps.com/ords/admin/alliance/api/v1'};"}));
  const branch='11111111-1111-4111-8111-111111111111',permissions=['home.read','inventory.read','products.write','products.read','tables.manage'];
  const context={user:{id:'22222222-2222-4222-8222-222222222222',business_id:'33333333-3333-4333-8333-333333333333',business_slug:'tc-alliance',name:'Prueba',username:'tester'},locations:[{id:branch,slug:'cocteleria',name:'Coctelería',active:true}],permissions:{[branch]:permissions},is_owner:true};
  const initial={business:{business_name:'Prueba',subtitle:'Prueba',accent_color:'#a47a47',currency:'COP'},tables:Array.from({length:24},(_,i)=>({id:'table-'+i,name:'M'+(i+1),sort_order:i,is_active:true})),categories:[],items:[]};
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let writes=0,model:any=null;
  await page.route('**/ords/**',async route=>{
    const request=route.request().postDataJSON();let status=200,data:any={ok:true};
    if(request.path==='/auth/login')data={access_token:'a'.repeat(64),refresh_token:'b'.repeat(64),provider:'oracle-ords',context,bootstrap:initial};
    else if(request.path==='/auth/refresh'){status=401;data={error:{message:'Inicia sesión'}};}
    else if(request.path==='/pos'){
      const action=request.body.action;
      if(action==='costing_load')data={value:{model,revision:model?1:0,history:[]}};
      else if(action==='costing_save'){writes++;if(writes===1){await gate;status=503;data={error:{message:'Oracle está temporalmente no disponible.'}};}else{model=request.body.payload.model;data={value:{revision:1,updatedAt:new Date().toISOString()}};}}
      else if(action==='getAdminSnapshot')data={value:{sessions:[],requests:[],sessionItems:[]}};
      else if(action==='getEvents')data={value:{events:[]}};
      else if(action==='bootstrap'||action==='remote_bootstrap')data={value:initial};
      else if(action==='query')data={value:[]};else data={value:{items:[],movements:[],sales:[],ok:true}};
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify({status,data})});
  });
  await page.goto('/negocios/cocteleria/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');await page.locator('.admin-sidebar a[href="#costing"]').click();await expect(page.locator('#costingStatus')).toContainText('Datos confirmados');await page.locator('.cost-steps [data-tab=ingredients]').click();
  const form=page.locator('#costEditor');await form.locator('[name=name]').fill('Harina');await form.locator('[name=quantity]').fill('1');await form.locator('[name=purchasePrice]').fill('10000');await form.locator('button[type=submit]').click();
  await expect(form.locator('.cost-form-feedback')).toContainText('Guardando en Oracle');await expect(form.locator('button[type=submit]')).toBeDisabled();await expect(page.locator('[data-tab=recipes]')).toBeDisabled();await expect(page.locator('#costingReload')).toBeDisabled();expect(writes).toBe(1);
  release();await expect(form.locator('.cost-form-feedback')).toContainText('El borrador sigue disponible');await expect(page.locator('.cost-table')).toContainText('Harina');await expect(page.locator('#costingSave')).toBeEnabled();await page.locator('#costingSave').click();await expect(form.locator('.cost-form-feedback')).toContainText('Cambios guardados');expect(writes).toBe(2);expect(model.ingredients[0].name).toBe('Harina');
});
