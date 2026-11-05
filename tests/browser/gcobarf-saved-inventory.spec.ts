import {test,expect,type Page} from '@playwright/test';
import {backend} from './helpers/operational-backend';

async function enter(page:Page){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.goto('/negocios/gcobarf/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm [type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}
function seed(server:any){
  server.context.locations[0].slug='gcobarf';server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
  server.state.operations.ingredients=[{id:'raw',name:'Pollo',unit:'g',quantity:10000,unitCost:10,minStock:0,revision:1}];
  const model=server.state.costing.model;model.settings={monthlyUnits:10,monthlyMinutes:null,productionMonth:'2026-11',taxRate:0,taxMode:'included'};
  model.ingredients=[{id:'i',stockId:'raw',name:'Pollo',unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
  model.channels=[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
  model.recipes=[{id:'saved',name:'GCOBARF - Pollo - 20261105',productType:'Pollo',productionDate:'2026-11-05',output:10,productionRows:[{name:'Pollo',quantity:10}],lines:[{ingredientId:'i',quantity:1000,initialQuantity:1000,unit:'g'}],pricingBasis:'production',currentPrice:3000,targetPercent:30,marginMode:'margin',channelId:'direct',minutes:null,monthlyUnits:null}];
  server.state.costing.revision=5;server.state.operations.productions=[{id:'saved',recipeId:'saved',output:10,transferred:0,parts:[],cost:10000,finalUnitCost:1000}];
}

test('agrega una producción guardada usando la versión actual sin guardar ni reemplazar un borrador antiguo',async({page})=>{
  const server=await backend(page);seed(server);await enter(page);
  const stale=structuredClone(server.state.costing.model);stale.recipes[0].output=99;stale.recipes[0].productionRows[0].quantity=99;
  await page.evaluate(model=>(window as any).OracleDb.local.setItem('costing-draft',JSON.stringify({model,revision:2,dirty:true,selected:'saved'})),stale);
  await page.locator('.admin-sidebar [href="#costing"]').click();await expect(page.locator('[name=sheetOutput]')).toHaveValue('99');
  const draftBefore=await page.evaluate(()=>(window as any).OracleDb.local.getItem('costing-draft'));
  server.state.costing.revision=6;server.state.costing.model.recipes[0].currentPrice=4500;
  let saveRequests=0;page.on('request',request=>{if(request.method()!=='POST')return;try{const body=request.postDataJSON()?.body;if(body?.action==='costing_save'||body?.operations?.some((o:any)=>o.action==='costing_save'))saveRequests++;}catch{}});
  await page.locator('[data-costing-inventory="saved"]').click();await expect(page.locator('#inventoryDialog')).toBeVisible();
  await expect(page.locator('#inventoryForm [name=stock]')).toHaveValue('10');await expect(page.locator('#inventoryForm [name=sale_price]')).toHaveValue('$4.500');
  await expect(page.locator('#inventoryForm [type=submit]')).toBeEnabled();await page.locator('#inventoryForm [type=submit]').click();await expect(page.locator('#inventoryDialog')).toBeHidden();
  await expect.poll(()=>server.state.operations.productions[0].transferred).toBe(10);
  expect(server.state.costing.revision).toBe(6);expect(server.state.costing.model.recipes[0].output).toBe(10);expect(server.state.operations.ingredients[0].quantity).toBe(10000);expect(saveRequests).toBe(0);
  expect(await page.evaluate(()=>(window as any).OracleDb.local.getItem('costing-draft'))).toBe(draftBefore);
});

test('una cantidad pendiente en el borrador no bloquea el botón de una producción guardada',async({page})=>{
  const server=await backend(page);seed(server);await enter(page);await page.locator('.admin-sidebar [href="#costing"]').click();
  await page.locator('[name=sheetOutput]').fill('');await expect(page.locator('[data-sheet-save]')).toBeDisabled();
  const saved=page.locator('[data-costing-inventory="saved"]');await expect(saved).toBeEnabled();await saved.click();await expect(page.locator('#inventoryDialog')).toBeVisible();
  await expect(page.locator('#inventoryForm [name=stock]')).toHaveValue('10');expect(server.state.costing.revision).toBe(5);
});
