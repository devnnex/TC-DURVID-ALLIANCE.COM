import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {backend,ready,product,sell} from './helpers/operational-backend';

for(const branch of ['gcobarf','cocteleria','cafeteria','sucursal'])test(branch+': merma automática, resultados redondeados y precisión al guardar',async({page})=>{
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/'+branch+'/admin.html')).href+'?demo=1&branch='+branch+'#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(branch=>{
    const w=window as any,E=w.AllianceCosting,m=E.empty();
    m.ingredients=[{id:'chicken',name:'Pollo',unit:'kg',quantity:75,purchasePrice:203000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
    m.channels=[{id:'direct',name:'Venta directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
    const recipe:any={id:'recipe',name:'Producción de pollo',size:'',category:'Recetas',output:204,wastePercent:0,currentPrice:5000,targetPercent:0,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,lines:[{ingredientId:'chicken',quantity:75,unit:'kg',stage:'batch'}]};
    if(branch!=='gcobarf'){recipe.sheet=w.AllianceJespresso.defaults();Object.assign(recipe.sheet,{date:'2026-11-13',unforeseenPercent:0,capitalMode:'manual',capitalPercent:0,consumptionPercent:0,ivaPercent:0});}
    if(branch==='gcobarf'){
      delete recipe.lines[0].stage;
      m.ingredients[0].stockId='raw';
      const key='alliance-operational-demo-v1:'+branch,state=JSON.parse(localStorage.getItem(key)!);
      state.operations=w.AllianceOperationsEngine.empty();
      state.operations.ingredients=[{id:'raw',name:'Pollo',unit:'kg',quantity:1000,unitCost:203000/75,minStock:0,revision:1}];
      localStorage.setItem(key,JSON.stringify(state));
    }
    m.recipes=[recipe];w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
  },branch);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.getByRole('button',{name:'Configurar merma',exact:true})).toHaveCount(0);
  const weight=page.locator(branch==='gcobarf'?'[data-sheet-final-weight="0"]':'[data-j-final="0"]');
  const loss=page.locator(branch==='gcobarf'?'[data-sheet-loss="0"]':'[data-j-yield-badge="0"]');
  const lossOnly=['cafeteria','cocteleria'].includes(branch);
  await expect(loss).toHaveText(lossOnly?'':'Sin merma');if(lossOnly)await expect(loss).toBeHidden();await weight.fill('71.234567');
  await expect(loss).toBeVisible();await expect(loss).toHaveText(branch==='gcobarf'?'Merma: 3,77 kg (5,02 %)':lossOnly?'Merma: 5,02 %':'Merma 5,02 %');
  if(branch==='gcobarf')await expect(loss.locator('..')).toHaveClass('cost-ingredient-cell');
  await page.locator(branch==='gcobarf'?'[data-sheet-save]':'#costingSave').click();
  await expect(page.locator('#costingStatus')).toContainText(branch==='gcobarf'?'Guardado local':'Receta guardada');
  const stored=await page.evaluate(()=>JSON.parse((window as any).OracleDb.local.getItem('costing-saved')).model.recipes[0].lines[0]);
  if(branch==='gcobarf'){expect(stored.quantity).toBe(71.234567);expect(stored.initialQuantity).toBe(75);}
  else expect(stored.processing.clean).toBeCloseTo((1-71.234567/75)*100,10);
  await page.reload();await expect(loss).toContainText('5,02 %');
  await weight.fill('75');await expect(loss).toHaveText(lossOnly?'':'Sin merma');if(lossOnly)await expect(loss).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('guardar merma offline sincroniza el consumo equivalente antes de vender y sin duplicarlo',async({page})=>{
  test.setTimeout(90000);const server=await backend(page,{lostAck:true,lostAckAction:'costing_save'}),m=server.state.costing.model;
  server.state.costing.revision=1;m.ingredients=[{id:'chicken',name:'Pollo congelado',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];m.channels=[{id:'direct',name:'Directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
  m.recipes=[{id:'yield-source',name:'Pollo por porción',size:'',category:'Recetas',output:1,wastePercent:0,currentPrice:10000,targetPercent:0,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,lines:[{ingredientId:'chicken',quantity:150,unit:'g',stage:'batch'}],sheet:{version:1,responsible:'Responsable',date:'2026-10-23',code:'P',quantity:null,workingDays:26,closingDays:26,monthlySales:null,operating:[],management:[],unforeseenPercent:0,factorPercent:150,capitalMode:'manual',capitalPercent:0,consumptionPercent:0,ivaPercent:0,source:''}}];
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1},{id:'kg',name:'Kilos',dimension:'MASS',factor:1000});server.state.operations.ingredients=[{id:'raw-chicken',name:'Pollo congelado',unit:'g',quantity:1000,unitCost:12,minStock:0,revision:1}];server.state.operations.recipes=[{id:product,productId:product,recipeId:'yield-source',managed:true,salePortions:1,mappings:[{ingredientId:'chicken',stockId:'raw-chicken'}],overheadCost:0,lines:[{ingredientId:'raw-chicken',name:'Pollo congelado',unit:'g',quantity:150}]}];
  await ready(page);await page.locator('a[href="#costing"]').click();await expect(page.locator('#costingReload')).toBeEnabled();await page.context().setOffline(true);await page.locator('[data-j-final="0"]').fill('142.5');await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText('Receta guardada');
  const local=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));expect(local.model.recipes[0].lines[0].quantity).toBeCloseTo(150/.95,10);expect(local.model.ingredients[0].quantity).toBe(1000);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();await expect(page.locator('[data-j-final="0"]')).toHaveValue('142.5');await page.context().setOffline(false);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>server.counts().ackLost).toBe(true);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.operations.recipes[0].lines[0].quantity).toBeCloseTo(150/.95,10);expect(server.state.costing.model.ingredients[0].purchasePrice).toBe(12000);expect(server.state.operations.materialMovements).toHaveLength(0);await sell(page);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.operations.ingredients[0].quantity).toBeCloseTo(1000-150/.95,7);expect(server.state.operations.materialMovements).toHaveLength(1);
  await page.context().setOffline(true);await page.locator('[data-j-final="0"]').fill('150');await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText('Receta guardada');const removed=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));expect(removed.model.recipes[0].lines[0].quantity).toBe(150);expect(removed.model.ingredients[0].quantity).toBeCloseTo(1000-150/.95,7);
  await page.context().setOffline(false);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.operations.recipes[0].lines[0].quantity).toBe(150);expect(server.state.operations.materialMovements).toHaveLength(1);await sell(page);await page.evaluate(()=>(window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.operations.ingredients[0].quantity).toBeCloseTo(1000-150/.95-150,7);expect(server.state.operations.materialMovements).toHaveLength(2);

});
