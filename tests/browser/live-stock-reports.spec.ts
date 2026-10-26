import {test,expect,type Page} from '@playwright/test';
import {backend,product} from './helpers/operational-backend';

async function enter(page:Page,slug:string){
 await page.goto('/negocios/'+slug+'/admin.html?branch='+slug);
 await page.locator('#loginForm [name=username]').fill('tester');
 await page.locator('#loginForm [name=pin]').fill('test-password');
 await page.locator('#loginForm button[type=submit]').click();
 await expect(page.locator('#metricTables')).toHaveText('24');
 await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}
async function invoice(page:Page,number:string,quantity=1){
 return page.evaluate(async({product,number,quantity})=>{
  const id=crypto.randomUUID(),invoice={id,sessionId:'walk-'+id,number,saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:crypto.randomUUID(),menu_item_id:product,item_name:'Producto de prueba',quantity,unit_price:10000}],totals:{subtotal:quantity*10000,total:quantity*10000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:quantity*10000}]};
  await (window as any).OracleDb.remote('record_sale',{invoice},id);return invoice;
 },{product,number,quantity});
}
async function sales(page:Page){
 await page.locator('.admin-sidebar [href="#income"]').click();
 await page.locator('#incomeDateFrom').fill('2026-01-01');
 await page.locator('#incomeDateTo').fill('2027-12-31');
 await page.locator('#incomeFilterForm button[type=submit]').click();
}
for(const slug of ['gcobarf','cocteleria','cafeteria','sucursal'])test('receta: salidas y ventas visibles al guardar y al sincronizar sin descontar dos veces · '+slug,async({page,context})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;
 server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
 server.state.operations.ingredients.push({id:'raw',name:'Ingrediente',unit:'g',quantity:1000,unitCost:10,minStock:0,archived:false});
 server.state.operations.recipes.push({productId:product,recipeId:'recipe',managed:true,overheadCost:0,lines:[{ingredientId:'raw',name:'Ingrediente',quantity:50,unit:'g'}]});
 await enter(page,slug);await page.locator('.admin-sidebar [href="#movements"]').click();
 await expect(page.locator('#inventoryMovementList')).toContainText('Sin movimientos');
 await context.setOffline(true);const first=await invoice(page,'LIVE-1',2);
 await expect(page.locator('#inventoryMovementList .movement-row')).toHaveCount(1);
 await expect(page.locator('#inventoryMovementList')).toContainText('LIVE-1');
 await expect(page.locator('#inventoryMovementList')).toContainText('Según insumos');
 await page.locator('#inventoryMovementList .movement-breakdown summary').click();
 await expect(page.locator('#inventoryMovementList .movement-breakdown-list')).toContainText('Ingrediente');
 await expect(page.locator('#inventoryMovementList .movement-breakdown-list')).toContainText('−100 g');
 await expect(page.locator('#inventoryMovementList .movement-row')).toHaveCount(1);
 if(slug==='gcobarf'){await page.screenshot({path:'test-results/movement-breakdown-desktop.png'});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/movement-breakdown-mobile.png'});await page.setViewportSize({width:1280,height:720});}
 await page.evaluate(async invoice=>{await (window as any).OracleDb.remote('record_sale',{invoice},invoice.id);},first);
 await expect(page.locator('#inventoryMovementList .movement-row')).toHaveCount(1);
 await sales(page);await expect(page.locator('#incomeRecords')).toContainText('LIVE-1');
 await invoice(page,'LIVE-2');await expect(page.locator('#incomeRecords')).toContainText('LIVE-2');
 const local=await page.evaluate(async()=>({stock:(await (window as any).OracleDb.remote('get_inventory')).items[0].stock,model:(await (window as any).OracleDb.remote('operations_snapshot')).model}));
 expect(local.stock).toBe(5000);expect(local.model.ingredients[0].quantity).toBe(850);
 await context.setOffline(false);
 await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
 expect(server.state.stock[product].stock).toBe(5000);expect(server.state.operations.ingredients[0].quantity).toBe(850);
 expect(server.state.sales).toHaveLength(2);expect(server.state.movements).toHaveLength(2);
 await page.locator('.admin-sidebar [href="#movements"]').click();
 await expect(page.locator('#inventoryMovementList .movement-row')).toHaveCount(2);
});
test('una venta de otro dispositivo actualiza Ventas sin recargar la página',async({page,browser})=>{
 const server=await backend(page);await enter(page,'cocteleria');await sales(page);
 const second=await browser.newContext();try{
  await server.attach(second);const other=await second.newPage();await enter(other,'cocteleria');
  await invoice(other,'OTRO-EQUIPO');
  await expect.poll(()=>server.state.sales.length).toBe(1);
  await expect(page.locator('#incomeRecords')).toContainText('OTRO-EQUIPO',{timeout:20000});
  await page.locator('.admin-sidebar [href="#movements"]').click();
  await expect(page.locator('#inventoryMovementList')).toContainText('OTRO-EQUIPO',{timeout:20000});
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await expect(page.locator('#inventoryList')).toContainText('4.999',{timeout:10000});
 }finally{await second.close();}
});
