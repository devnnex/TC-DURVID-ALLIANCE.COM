import{test,expect,type Page}from'@playwright/test';
import{backend,product}from'./helpers/operational-backend';

async function enter(page:Page){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.goto('/negocios/gcobarf/admin.html');
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}

test('GCOBARF alinea los pesos y mantiene Editar y quitar en la misma fila',async({page})=>{
  const server=await backend(page);server.context.locations[0].slug='gcobarf';server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
  server.state.costing.model={settings:{monthlyUnits:null,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients:[{id:'spinach',name:'Espinaca',unit:'g',quantity:505,purchasePrice:3171,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[],channels:[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[{id:'batch',name:'Producción',size:'',category:'',output:196,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:10000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',lines:[{ingredientId:'spinach',quantity:505,initialQuantity:505,unit:'g'}]}]};
  await enter(page);await page.locator('.admin-sidebar [href="#costing"]').click();await expect(page.locator('[data-sheet-final-weight="0"]')).toHaveValue('505');
  for(const width of [1600,1280,390]){
    await page.setViewportSize({width,height:900});
    const row=page.locator('.gcobarf-production-ingredient').first(),initial=await row.locator('[data-sheet-line]').boundingBox(),final=await row.locator('[data-sheet-final-weight]').boundingBox(),note=await row.locator('.cost-line-loss').boundingBox(),edit=await row.locator('[data-sheet-editor]').boundingBox(),remove=await row.locator('[data-sheet-remove]').boundingBox();
    expect(Math.abs(initial!.y-final!.y)).toBeLessThan(2);expect(note!.y).toBeGreaterThan(final!.y+final!.height+5);expect(Math.abs(edit!.y+edit!.height/2-remove!.y-remove!.height/2)).toBeLessThan(2);expect(remove!.x).toBeGreaterThan(edit!.x+edit!.width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/gcobarf-weights-'+width+'.png',fullPage:true});
  }
});

test('el botón Inventario muestra los productos terminados y permite asignarlos desde el calendario',async({page})=>{
  test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const server=await backend(page);server.context.locations[0].slug='gcobarf';server.state.stock[product].stock=196;
  server.state.operations.customers=[{id:'customer',name:'María Fernanda Rodríguez',active:true,allowCredit:true,creditLimit:1000000,revision:1}];
  await enter(page);await page.locator('.admin-sidebar [href="#inventory"]').click();const inventory=page.locator('[data-material-view=products]'),macro=page.locator('[data-material-view=macro]'),history=page.locator('[data-material-view=history]');
  await expect(page.locator('#materialsContent')).toBeVisible();await expect(page.locator('#inventoryList')).toBeHidden();await expect(inventory).toHaveText('Inventario');await inventory.click();
  await expect(inventory).toHaveClass(/primary/);await expect(page.locator('#materialsContent')).toBeHidden();await expect(page.locator('#inventoryList')).toContainText('Producto de prueba');await expect(page.locator('#inventoryMetrics')).toContainText('196');
  await macro.click();await expect(page.locator('#inventoryList')).toBeHidden();await history.click();await expect(page.locator('#materialsContent')).toContainText('Historial de insumos');await expect(page.locator('#inventoryList')).toBeHidden();await inventory.click();await expect(page.locator('#inventoryList')).toBeVisible();
  await page.screenshot({path:'test-results/gcobarf-inventory.png',fullPage:true});
  await page.locator('.admin-sidebar [href="#dashboard"]').click();const day=page.locator('[data-delivery-day]').first(),date=await day.getAttribute('data-delivery-day');await day.click();const dialog=page.locator('#deliveryDialog');
  await dialog.getByRole('combobox').fill('María');await dialog.getByRole('option',{name:'María Fernanda Rodríguez',exact:true}).click();await dialog.locator('[type=submit]').click();await expect(dialog).toBeHidden();await page.locator('[data-delivery-day="'+date+'"]').click();
  await dialog.locator('[data-delivery-open]').click();await page.locator('#consumptionProductSearch').fill('Producto de prueba');await page.locator('[data-consumption-product]').first().click();await page.locator('#consumptionForm [name=quantity]').fill('2');await page.locator('#consumptionQueueButton').click();await page.locator('#consumptionSubmitButton').click();await expect(page.locator('#consumptionDialog')).toBeHidden();
  await expect.poll(()=>server.state.docs.session_items.filter((i:any)=>i.menu_item_id===product).reduce((n:number,i:any)=>n+i.quantity,0)).toBe(2);
  for(const width of [1600,1280,390]){
    await page.setViewportSize({width,height:900});const target=page.locator('[data-delivery-day="'+date+'"]');await expect(target.locator('.delivery-customer-name')).toHaveText('María Fernanda Rodríguez');await expect(target.locator('.delivery-customer-name')).toBeVisible();expect((await target.locator('.delivery-customer-name').boundingBox())!.height).toBeGreaterThan(24);const box=await target.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(width===390?112:126);expect(await page.locator('.delivery-grid').evaluate(e=>getComputedStyle(e).gap)).toBe('0px');expect(await target.evaluate(e=>getComputedStyle(e).borderRadius)).toBe('0px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/gcobarf-calendar-joined-'+width+'.png',fullPage:true});
  }
  expect(errors).toEqual([]);
});
