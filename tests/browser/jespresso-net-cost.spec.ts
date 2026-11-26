import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

for(const branch of ['cafeteria','cocteleria'])test(`${branch}: costo neto comparable, merma y cierre compacto`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href+`?demo=1&branch=${branch}#costing`);
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(branch=>{
    const w=window as any,m=w.AllianceCosting.empty(),sheet=w.AllianceJespresso.defaults();
    Object.assign(sheet,{date:'2026-11-26',workingDays:25,closingDays:25,monthlySales:15000000});
    sheet.operating.forEach((row:any,index:number)=>row.amount=[1200000,4000000,1800000,700000,600000,1200000][index]);
    m.ingredients=[
      {id:'chicken',name:'Pechuga de pollo',unit:'kg',quantity:2,purchasePrice:36000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false},
      {id:'bread',name:'Pan brioche',unit:'unit',quantity:10,purchasePrice:20000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false},
      {id:'oil',name:'Aceite de cocina',unit:'ml',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}
    ];
    m.channels=[{id:'direct',name:'Venta directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
    m.recipes=[{id:'recipe',name:'Receta de prueba',size:'',category:'Recetas',output:10,wastePercent:0,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,sheet,lines:[{ingredientId:'chicken',quantity:2000,unit:'g',stage:'batch'},{ingredientId:'bread',quantity:10,unit:'unit',stage:'batch'},{ingredientId:'oil',quantity:300,unit:'ml',stage:'batch'}]}];
    const stateKey='alliance-operational-demo-v1:'+branch,state=JSON.parse(localStorage.getItem(stateKey)!);
    state.operations=w.AllianceOperationsEngine.empty();
    state.operations.ingredients=m.ingredients.map((ingredient:any)=>{ingredient.stockId='raw-'+ingredient.id;return {id:ingredient.stockId,name:ingredient.name,unit:ingredient.unit,quantity:100000,unitCost:ingredient.purchasePrice/ingredient.quantity,minStock:0,revision:1};});
    localStorage.setItem(stateKey,JSON.stringify(state));
    w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
  },branch);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('.jr-ingredients thead th')).toHaveText(['Ingredientes para la fabricación','Peso inicial','Peso final','Unidades','Precio / compra','Costo neto','Importe','']);
  await expect(page.locator('[data-j-net-cost="0"]')).toHaveText(/18\s*\/ g/);
  await expect(page.locator('[data-j-net-cost="1"]')).toHaveText(/2\.000\s*\/ u/);
  await expect(page.locator('[data-j-net-cost="2"]')).toHaveText(/10\s*\/ ml/);
  await expect(page.locator('[data-j-line-total="0"]')).toContainText('36.000');
  await page.locator('[data-j-final="0"]').fill('1600');
  await expect(page.locator('[data-j-yield-badge="0"]')).toHaveText('Merma: 20 %');
  await expect(page.locator('[data-j-net-cost="0"]')).toHaveText(/22,50\s*\/ g/);
  await expect(page.locator('[data-j-base-cost="0"]')).toHaveText(/Compra:.*18\s*\/ g/);
  await expect(page.locator('[data-j-line-total="0"]')).toContainText('45.000');
  await expect(page.locator('[data-j-result=dailyBreakEven]')).toContainText('380.000');
  await expect(page.locator('[data-j-result=monthlyEstimate]')).toContainText('9.500.000');
  await expect(page.locator('[data-j-result=monthlyProfit]')).toContainText('5.500.000');
  await page.locator('[data-j-final="0"]').fill('2100');
  await expect(page.locator('[data-j-net-cost="0"]')).toHaveText('Pendiente');
  await page.locator('[data-j-final="0"]').fill('1600');
  await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText('Receta guardada');
  await page.reload();await expect(page.locator('[data-j-net-cost="0"]')).toHaveText(/22,50\s*\/ g/);
  await page.setViewportSize({width:1600,height:1100});
  const screenshotStyle='.demo-mode-banner,.admin-sidebar{visibility:hidden!important}';
  await page.locator('.jr-workbook').screenshot({path:`test-results/${branch}-net-cost-desktop.png`,style:screenshotStyle});
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const net=page.locator('[data-j-net-cost="0"]');await net.scrollIntoViewIfNeeded();await expect(net).toBeVisible();
  }
  await page.locator('.jr-operating').scrollIntoViewIfNeeded();
  await page.locator('.jr-operating-scroll').screenshot({path:`test-results/${branch}-monthly-close-mobile.png`,style:screenshotStyle});
  await page.locator('[data-j-final="0"]').fill('2000');await expect(page.locator('[data-j-net-cost="0"]')).toHaveText(/18\s*\/ g/);
  expect(errors).toEqual([]);
});
