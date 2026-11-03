import {test,expect,type Page} from '@playwright/test';
import {backend} from './helpers/operational-backend';

async function enter(page:Page){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.goto('/negocios/gcobarf/admin.html#costing');
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#costingReload')).toBeEnabled();
}
test('costeo confirma en servidor, comparte pesos y sustituye el insumo desde un único buscador',async({page,browser,context})=>{
  test.setTimeout(90000);const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1},{id:'kg',name:'Kilogramos',dimension:'MASS',factor:1000});
  server.state.operations.ingredients=[{id:'raw-chicken',name:'Pollo',unit:'g',quantity:10000,unitCost:10,minStock:0,revision:1},{id:'raw-spinach',name:'Espinaca',unit:'kg',quantity:10,unitCost:4000,minStock:0,revision:1}];
  server.state.costing.model={settings:{monthlyUnits:null,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients:[{id:'chicken',stockId:'raw-chicken',name:'Pollo',unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[],channels:[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[{id:'batch',name:'Producción',output:1,size:'',category:'',wastePercent:0,currentPrice:20000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,productionDate:'2026-11-03',lines:[{ingredientId:'chicken',unit:'g',quantity:950,initialQuantity:1000}]}]};
  await enter(page);const initial=page.locator('[data-sheet-line="0"]'),final=page.locator('[data-sheet-final-weight="0"]');
  await expect(final).toHaveValue('950');await initial.fill('1200');await expect(final).toHaveValue('950');await initial.fill('1000');await expect(page.locator('[data-sheet-loss="0"]')).toContainText('(5 %)');
  await page.locator('[data-sheet-save]').click();await expect(page.locator('#costingStatus')).toContainText('confirmados en el servidor');expect(server.state.costing.revision).toBe(1);
  const otherContext=await browser.newContext({baseURL:'http://127.0.0.1:4177'});await server.attach(otherContext);const other=await otherContext.newPage();await enter(other);await expect(other.locator('[data-sheet-final-weight="0"]')).toHaveValue('950');await otherContext.close();
  await page.locator('[data-sheet-source="0"]').click();const dialog=page.locator('.cost-stock-menu');await dialog.getByRole('searchbox').fill('espinaca');await dialog.getByRole('option',{name:'Espinaca · kg',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(initial).toHaveValue('1');await expect(final).toHaveValue('0.95');await expect(page.locator('.cost-ingredient-cell')).toContainText('Espinaca');
  await page.locator('[data-sheet-editor=ingredients][data-key]:not([data-key=""])').last().click();const editor=page.locator('#costSheetEditor');
  await expect(editor.getByRole('combobox',{name:'Buscar y seleccionar insumo'})).toHaveCount(1);await expect(editor.locator('select[name=stockId]')).toBeHidden();await expect(editor.locator('.op-select-search')).toHaveCount(0);
  await editor.getByRole('combobox',{name:'Buscar y seleccionar insumo'}).fill('pollo');await editor.getByRole('option',{name:'Pollo · g',exact:true}).click();await editor.locator('[name=quantity]').fill('1000');await editor.locator('[type=submit]').click();await expect(editor).toHaveCount(0);
  await context.setOffline(true);await initial.fill('1100');await page.locator('[data-sheet-save]').click();await expect(page.locator('#costingStatus')).toContainText('sin conexión');const revision=server.state.costing.revision;
  await context.setOffline(false);await expect.poll(()=>server.state.costing.revision,{timeout:20000}).toBe(revision+1);await expect(page.locator('#costingStatus')).toContainText('confirmados en el servidor');
});
