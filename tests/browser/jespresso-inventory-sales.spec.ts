import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {backend,product} from './helpers/operational-backend';

const engine:any={};runInNewContext(readFileSync('operational/jespresso-engine.js','utf8'),engine);

async function enter(page:Page,branch:string){
  await page.goto(`/negocios/${branch}/admin.html?branch=${branch}`);
  await page.locator('#loginForm [name=username]').fill('tester');
  await page.locator('#loginForm [name=pin]').fill('test-password');
  await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#metricTables')).toHaveText('24');
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}

for(const branch of ['cafeteria','cocteleria'])test(`inventario y dos recetas comparten insumos; cinco ventas descuentan cinco porciones · ${branch}`,async({page,context})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const server=await backend(page,{lostAck:true,lostAckAction:'record_sale'});
  server.context.locations[0].slug=branch;
  server.state.stock[product].stock=4;
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1},{id:'kg',name:'Kilos',dimension:'MASS',factor:1000},{id:'ml',name:'Mililitros',dimension:'VOLUME',factor:1});
  server.state.operations.ingredients=[{id:'sauce',name:'Salsa tártara',unit:'kg',quantity:1,unitCost:10000,minStock:0,revision:1},{id:'milk',name:'Leche',unit:'ml',quantity:1000,unitCost:4,minStock:0,revision:1}];
  server.state.costing.revision=1;
  server.state.costing.model.channels=[{id:'direct',name:'Venta directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
  server.state.costing.model.ingredients=[{id:'sauce-cost',name:'Salsa tártara',unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false},{id:'milk-cost',name:'Leche',unit:'ml',quantity:1000,purchasePrice:4000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
  server.state.costing.model.recipes=['primera','segunda'].map(id=>({id,name:'Receta '+id,size:'',category:'Preparados',output:8,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:'direct',sheet:{...engine.AllianceJespresso.defaults(),date:'2026-11-02'},lines:[{ingredientId:'sauce-cost',quantity:75,unit:'g',stage:'batch'},{ingredientId:'milk-cost',quantity:80,unit:'ml',stage:'portion'}]}));
  await enter(page,branch);
  await page.locator('#tablesGrid [data-open-table]').first().click();
  await page.locator('#consumptionProductSearch').fill('Producto de prueba');
  await page.locator('[data-consumption-product]').first().click();
  await expect(page.locator('#consumptionForm [name=menu_item_id]')).toHaveValue(product);
  await page.locator('#consumptionDialog').evaluate((d:HTMLDialogElement)=>d.close());
  await page.locator('.admin-sidebar [href="#costing"]').click();
  await expect(page.locator('[data-j-select]')).toBeVisible();
  for(const id of ['primera','segunda']){
    await page.locator('[data-j-select]').selectOption(id);
    await page.getByRole('button',{name:'Agregar al inventario',exact:true}).click();
    await expect(page.locator('#inventoryDialog')).toBeVisible();
    const form=page.locator('#inventoryForm');
    await expect(form.locator('[name=stock]')).toBeHidden();
    await expect(form.locator('[data-material-inventory-status]')).toContainText('12 unidades disponibles');
    if(id==='primera'){
      await form.locator('[name=salePortions]').fill('20');
      await form.locator('button[type=submit]').click();
      await expect(page.locator('#inventoryDialog')).toBeVisible();
      await expect(form.locator('[data-material-inventory-status]')).toContainText('Abastece la macro');
      expect(server.state.docs.menu_items).toHaveLength(1);
      await form.locator('[name=salePortions]').fill('1');
    }
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#inventoryDialog')).toBeHidden();
  }
  const snapshot=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));
  expect(snapshot.model.ingredients).toHaveLength(2);
  expect(snapshot.model.recipes).toHaveLength(2);
  const prepared=snapshot.docs.menu_items.find((p:any)=>p.name==='Receta primera');
  expect(snapshot.inventory.find((p:any)=>p.productId===prepared.id).stock).toBe(0);
  await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');
  await page.locator('.admin-sidebar [href="#dashboard"]').click();
  await page.locator('#tablesGrid [data-open-table]').first().click();
  await page.locator('#consumptionProductSearch').fill('Receta primera');
  await expect(page.locator('[data-consumption-product]')).toContainText('12 disponibles según insumos');
  await page.locator('[data-consumption-product]').click();
  await page.locator('#consumptionForm [name=quantity]').fill('5');
  await page.locator('#consumptionQueueButton').click();
  await page.locator('#consumptionSubmitButton').click();
  await expect(page.locator('#consumptionDialog')).toBeHidden();
  await page.locator('#tablesGrid [data-open-table]').first().click();
  await page.locator('#chargeTableAccount').click();
  await context.setOffline(true);
  await page.locator('#paymentForm [name=cash_received]').fill('100000');
  await page.locator('#paymentForm button[value=save]').click();
  await expect(page.locator('#paymentDialog')).toBeHidden();
  const sold=await page.evaluate(async()=>await (window as any).OracleDb.remote('operations_snapshot'));
  expect(sold.model.ingredients.find((i:any)=>i.id==='sauce').quantity).toBeCloseTo(1-5*75/8/1000,8);
  expect(sold.model.ingredients.find((i:any)=>i.id==='milk').quantity).toBe(600);
  expect(sold.sales).toHaveLength(1);
  await context.setOffline(false);
  await page.evaluate(()=>void (window as any).AllianceOffline.flush());
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.operations.ingredients.find((i:any)=>i.id==='milk').quantity).toBe(600);
  expect(server.state.sales).toHaveLength(1);
  expect(server.counts().ackLost).toBe(true);
  expect(errors).toEqual([]);
});
