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

for(const branch of ['cafeteria','cocteleria'])test(`el buscador abierto recibe productos habilitados y nuevos del inventario · ${branch}`,async({page})=>{
  const server=await backend(page);server.context.locations[0].slug=branch;
  server.state.docs.menu_items[0].is_available=false;server.state.stock[product].isAvailable=false;
  await enter(page,branch);await page.locator('#tablesGrid [data-open-table]').first().click();
  await page.locator('#consumptionProductSearch').focus();await expect(page.locator('[data-consumption-product]')).toHaveCount(0);
  server.state.docs.menu_items[0].is_available=true;server.state.stock[product].isAvailable=true;
  const added='55555555-5555-4555-8555-555555555555';
  server.state.docs.menu_items.push({id:added,name:'Producto nuevo compartido',category_id:'category',price:8000,is_available:true});
  server.state.stock[added]={productId:added,name:'Producto nuevo compartido',code:'PNC',stock:5,costPrice:1000,salePrice:8000,minStock:0,isAvailable:true,version:1};
  server.state.docs.menu_items.push({id:'hidden',name:'Producto oculto intencional',category_id:'category',price:1,is_available:false});
  await page.evaluate(()=>void (window as any).AllianceOffline.prime(true));
  await expect(page.locator('[data-consumption-product]')).toHaveCount(2);
  await expect(page.locator('#consumptionProductOptions')).toContainText('Producto de prueba');
  await expect(page.locator('#consumptionProductOptions')).toContainText('Producto nuevo compartido');
  await expect(page.locator('#consumptionProductOptions')).not.toContainText('oculto intencional');
  await page.locator(`[data-consumption-product="${added}"]`).click();
  await expect(page.locator('#consumptionForm [name=menu_item_id]')).toHaveValue(added);
  await page.locator('#consumptionDialog').evaluate((d:HTMLDialogElement)=>d.close());
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await expect(page.locator('#inventoryList')).toContainText('Producto nuevo compartido');
});

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
  // A product created later has its own costing ingredient, but shares the same physical stock.
  await page.locator('#receiptResultDialog').evaluate((d:HTMLDialogElement)=>d.close());
  await page.evaluate(async()=>{
    const w=window as any,s=await w.OracleDb.remote('operations_snapshot'),raw=s.model.ingredients.find((i:any)=>i.id==='milk'),id=crypto.randomUUID();
    await w.OracleDb.remote('operations_apply',{id,command:'materials_save',payload:{id:raw.id,revision:raw.revision,name:'Leche entera central',unit:raw.unit,quantity:raw.quantity,minStock:raw.minStock}},id);
  });
  await page.locator('.admin-sidebar [href="#costing"]').click();
  await page.getByRole('button',{name:'+ Nuevo producto',exact:true}).click();
  await page.locator('[data-j-path=name]').fill('Receta futura');
  await page.locator('[data-j-ingredient=name]').fill('LECHE');
  await page.locator('[data-j-path="lines.0.unit"]').selectOption('ml');
  await page.locator('[data-j-path="lines.0.quantity"]').fill('80');
  await page.locator('[data-j-ingredient=purchasePrice]').fill('4000');
  await page.getByRole('button',{name:'Agregar al inventario',exact:true}).click();
  const futureForm=page.locator('#inventoryForm');
  await expect(futureForm.locator('[data-material-map]')).toHaveValue('milk');
  await expect(futureForm.locator('[data-material-inventory-status]')).toContainText('7 unidades disponibles');
  await futureForm.locator('button[type=submit]').click();
  await expect(page.locator('#inventoryDialog')).toBeHidden();
  const future=await page.evaluate(async()=>{
    const w=window as any,s=await w.OracleDb.remote('operations_snapshot'),product=s.docs.menu_items.find((p:any)=>p.name==='Receta futura'),id=crypto.randomUUID();
    const invoice={id,number:'FUTURE-'+id,sessionId:'walk-'+id,saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:crypto.randomUUID(),menu_item_id:product.id,item_name:product.name,quantity:2,unit_price:product.price}],totals:{subtotal:2*product.price,total:2*product.price,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:2*product.price}]};
    await w.OracleDb.remote('record_sale',{invoice},id);return w.OracleDb.remote('operations_snapshot');
  });
  expect(future.model.ingredients).toHaveLength(2);expect(future.model.recipes).toHaveLength(3);
  expect(future.model.ingredients.find((i:any)=>i.id==='milk').quantity).toBe(440);
  expect(future.model.ingredients.find((i:any)=>i.id==='sauce').quantity).toBeCloseTo(1-5*75/8/1000,8);
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.operations.ingredients.find((i:any)=>i.id==='milk').quantity).toBe(440);
  expect(errors).toEqual([]);
});
