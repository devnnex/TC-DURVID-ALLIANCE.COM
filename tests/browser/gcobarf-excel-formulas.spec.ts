import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

function excelModel(){
  const x:any={};runInNewContext(readFileSync('operational/vendor/xlsx.js','utf8'),x);
  const wb=x.XLSX.read(readFileSync(readdirSync('.').find(p=>p.startsWith('Excel base')&&p.endsWith('.xlsx'))!),{type:'buffer'}),s=wb.Sheets['Dia Producción'];
  const ingredients=Array.from({length:7},(_,i)=>({id:'i'+i,name:s['F'+(i+8)].v,unit:'unit',quantity:1,purchasePrice:s['H'+(i+8)].v,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}));
  const expenses=Array.from({length:6},(_,i)=>({id:'e'+i,name:s['J'+(i+8)].v,amount:s['K'+(i+8)].v,periodMonths:1,kind:'fixed',allocation:'units',recipeId:'',includedElsewhere:false}));
  expenses.push({id:'labor',name:'Mano de obra',amount:s.H15.v,periodMonths:1,kind:'batch',allocation:'units',recipeId:'batch',includedElsewhere:false});
  const recipe={id:'batch',name:'Producción Excel',size:'',category:'',output:s.F30.v,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:6000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',lines:ingredients.map(i=>({ingredientId:i.id,quantity:1,unit:'unit'}))};
  return {settings:{monthlyUnits:s.K18.v,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients,expenses,channels:[{id:'direct',name:'Directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[recipe,{...structuredClone(recipe),id:'other',name:'Otra hoja'}]};
}

test('GCOBARF reproduce las fórmulas del Excel y la X quita sólo la línea seleccionada',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/gcobarf/admin.html')).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(model=>(window as any).OracleDb.local.setItem('costing-saved',JSON.stringify({model,revision:1})),excelModel());
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-total]')).toContainText('610.931');
  await expect(page.locator('[data-sheet-output]')).toHaveText('248');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('2.463');
  await expect(page.locator('#costSheetResult')).toContainText('2.463,431452');
  await expect(page.locator('[data-sheet-monthly-total]')).toContainText('736.667');
  await expect(page.locator('[data-sheet-monthly-unit]')).toContainText('1.485');
  await expect(page.locator('[data-sheet-final]')).toContainText('3.948,65');
  await page.locator('[data-production-name="0"]').fill('Pollo');await page.locator('[name=sheetOutput]').fill('191');
  await page.locator('[data-production-add]').click();await page.locator('[data-production-name="1"]').fill('Mixta');
  await page.locator('[data-production-add]').click();await page.locator('[data-production-name="2"]').fill('Carne');
  await page.locator('[data-production-quantity="2"]').fill('57');
  await expect(page.locator('[data-sheet-output]')).toHaveText('248');
  await expect(page.locator('[data-sheet-line]')).toHaveCount(7);
  await page.locator('[data-sheet-save]').click();await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-production-quantity="0"]')).toHaveValue('191');
  await expect(page.locator('[data-production-quantity="1"]')).toHaveValue('0');
  await expect(page.locator('[data-production-quantity="2"]')).toHaveValue('57');
  await page.screenshot({path:'test-results/gcobarf-excel-production.png',fullPage:true});
  await page.locator('[data-sheet-remove="0"]').click();await page.locator('#systemMessageDialog [value=cancel]').click();
  await expect(page.locator('[data-sheet-line]')).toHaveCount(7);
  await page.locator('[data-sheet-remove="0"]').click();await page.locator('#systemMessageDialog [value=accept]').click();
  await expect(page.locator('[data-sheet-line]')).toHaveCount(6);await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  await expect(page.locator('[data-sheet-total]')).toContainText('409.931');
  await expect(page.locator('[data-sheet-output]')).toHaveText('248');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('1.652,95');
  const saved=await page.evaluate(()=>JSON.parse((window as any).OracleDb.local.getItem('costing-saved')).model);
  expect(saved.ingredients).toHaveLength(7);expect(saved.recipes[1].lines).toHaveLength(7);
  expect(saved.recipes[0].productionRows.map((r:any)=>r.quantity)).toEqual([191,0,57]);
  expect(saved.recipes[0].lines.every((l:any)=>l.quantity===1)).toBe(true);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-total]')).toContainText('409.931');
  await page.locator('[name=sheetOutput]').fill('0');await page.locator('[data-production-quantity="2"]').fill('0');
  await expect(page.locator('[data-sheet-production-unit]')).toHaveText('Pendiente');await expect(page.locator('[data-sheet-save]')).toBeDisabled();
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-production-unit]')).toHaveText('Pendiente');await expect(page.locator('[data-sheet-save]')).toBeDisabled();
  await page.locator('[name=sheetOutput]').fill('191');await expect(page.locator('[data-sheet-save]')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('GCOBARF suma los gastos por unidad al lote y recalcula sin redondeo intermedio',async({page})=>{
  await page.context().setOffline(true);await page.goto(pathToFileURL(resolve('negocios/gcobarf/admin.html')).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  const model=excelModel();model.expenses.push({id:'package',name:'Empaque por unidad',amount:100,periodMonths:1,kind:'unit',allocation:'units',recipeId:'batch',includedElsewhere:false});
  await page.evaluate(model=>(window as any).OracleDb.local.setItem('costing-saved',JSON.stringify({model,revision:1})),model);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-expense=package]')).toContainText('24.800');
  await expect(page.locator('[data-sheet-total]')).toContainText('635.731');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('2.563,43');
  await page.locator('[name=sheetOutput]').fill('250');
  await expect(page.locator('[data-sheet-expense=package]')).toContainText('25.000');
  await expect(page.locator('[data-sheet-total]')).toContainText('635.931');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('2.543,72');
});
