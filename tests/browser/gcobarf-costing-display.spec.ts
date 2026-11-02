import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

async function open(page:any,section='costing'){
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/gcobarf/admin.html')).href+'?demo=1#'+section);
  await expect(page.locator(section==='costing'?'#costingReload':'[data-material-action=new]')).toBeEnabled();
}
const model=()=>({settings:{monthlyUnits:null,monthlyMinutes:null,taxRate:0,taxMode:'included'},
  ingredients:[{id:'meat',name:'Carne',unit:'kg',quantity:1,purchasePrice:1543.94,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[],
  channels:[{id:'direct',name:'Directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],
  recipes:[{id:'batch',name:'POLLO PET DIET',size:'200LIBRAS',category:'',output:1,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:3000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',productionRows:[{name:'POLLO PET DIET',quantity:1}],lines:[{ingredientId:'meat',unit:'kg',initialQuantity:1,quantity:1}]}]});

test('GCOBARF presenta un decimal y pesos enteros en las tarjetas sin cambiar sus costos exactos',async({page})=>{
  await open(page,'inventory');
  await page.evaluate(async()=>{const db=(window as any).OracleDb,id=crypto.randomUUID();await db.remote('operations_apply',{id,command:'materials_save',payload:{id:'precise',revision:0,name:'Insumo preciso',unit:'g',quantity:6080,totalCost:18725.999997,minStock:0}},id);await (window as any).MaterialsPanel.refresh();});
  const card=page.locator('[data-material-card=precise]');
  await expect(card.locator('.material-unit-cost b')).toHaveText(/\$\s*3,0$/);
  await expect(card.locator('.material-details')).toContainText(/Valor de existencias:\s*\$\s*18\.725/);
  const raw=await page.evaluate(()=>(window as any).MaterialsPanel.stockById('precise'));
  expect(raw.unitCost).toBeCloseTo(18725.999997/6080,12);expect(raw.quantity*raw.unitCost).toBeCloseTo(18725.999997,8);
  await page.reload();await expect(card.locator('.material-unit-cost b')).toHaveText(/\$\s*3,0$/);
});

test('GCOBARF redondea el resultado y sincroniza el nombre exacto en tarjeta, selector y producción real',async({page})=>{
  await open(page);
  await page.evaluate(value=>(window as any).OracleDb.local.setItem('costing-saved',JSON.stringify({model:value,revision:1})),model());
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-production-unit]')).toHaveText(/\$\s*1\.544$/);
  await expect(page.locator('[data-sheet-total-without-loss]')).toHaveText(/\$\s*1\.544$/);
  await expect(page.locator('[data-sheet-total]')).toHaveText(/\$\s*1\.544$/);
  const card=page.locator('.cost-product-card');await card.locator('[data-sheet-rename]').click();
  const name='POLLO PET DIET - 200LIBRAS';await page.locator('#systemMessageDialog [name=answer]').fill(name);
  await page.locator('#systemMessageDialog [value=accept]').click();await expect(page.locator('#costingStatus')).toContainText('Nombre del producto guardado');
  await expect(page.locator('[data-production-name="0"]')).toHaveValue(name);
  await expect(page.locator('[name=analysisRecipe] option:checked')).toHaveText(name);
  await expect(card.locator('h3')).toContainText('Costo producción '+name);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-production-name="0"]')).toHaveValue(name);
  await expect(page.locator('[name=analysisRecipe] option:checked')).toHaveText(name);
  const saved=await page.evaluate(()=>JSON.parse((window as any).OracleDb.local.getItem('costing-saved')).model);
  expect(saved.ingredients[0].purchasePrice).toBe(1543.94);expect(saved.recipes[0].productionRows[0].name).toBe(name);
});

for(const name of ['Carne','Bolsa 500G'])test(`GCOBARF conserva el inicial y recalcula valor y merma al editar el final: ${name}`,async({page})=>{
  await open(page);const value=model();value.ingredients[0].name=name;
  await page.evaluate(value=>(window as any).OracleDb.local.setItem('costing-saved',JSON.stringify({model:value,revision:1})),value);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  const initial=page.locator('[data-sheet-line]'),final=page.locator('[data-sheet-final-weight]');
  await final.fill('0.8');await expect(initial).toHaveValue('1');await expect(page.locator('[data-sheet-loss]')).toContainText('20 %');
  await expect(page.locator('[data-sheet-line-cost]')).toContainText('1.235');
  const footer=page.locator('.cost-excel-table').first().locator('tfoot');
  await expect(footer.locator('th')).toHaveText(['Total costo insumos sin merma','Total costo insumos con merma']);
  await expect(footer.locator('[data-sheet-total-without-loss]')).toHaveText(/\$\s*1\.544$/);
  await expect(footer.locator('[data-sheet-total]')).toHaveText(/\$\s*1\.235$/);
  await initial.fill('2');await expect(final).toHaveValue('0.8');await expect(page.locator('[data-sheet-line-cost]')).toContainText('1.235');
  await final.fill('1.5');await expect(initial).toHaveValue('2');await expect(page.locator('[data-sheet-line-cost]')).toContainText('2.316');
  await expect(footer.locator('[data-sheet-total-without-loss]')).toHaveText(/\$\s*3\.088$/);
  await expect(footer.locator('[data-sheet-total]')).toHaveText(/\$\s*2\.316$/);
  await page.locator('[data-sheet-save]').click();await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();await expect(initial).toHaveValue('2');await expect(final).toHaveValue('1.5');
  await expect(page.locator('[data-sheet-line-cost]')).toContainText('2.316');
});
