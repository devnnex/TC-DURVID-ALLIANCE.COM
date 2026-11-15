import {test,expect} from '@playwright/test';
import {backend,ready,product} from './helpers/operational-backend';
import {chooseWaiterTable} from './helpers/waiter-flow';

for(const slug of ['cocteleria','cafeteria'])test(slug+': cantidades visibles, agotado y reposición sin salir de la búsqueda',async({page})=>{
  const server=await backend(page),shared='shared-product';
  server.context.locations[0].slug=slug;
  server.state.units.push({id:'g',dimension:'MASS',factor:1});
  server.state.operations.ingredients=[{id:'raw',name:'Base compartida',unit:'g',quantity:500,unitCost:10,minStock:0}];
  server.state.operations.recipes=[{productId:product,managed:true,lines:[{ingredientId:'raw',quantity:250,unit:'g'}]},{productId:shared,managed:true,lines:[{ingredientId:'raw',quantity:500,unit:'g'}]}];
  server.state.docs.menu_items.push({id:shared,name:'Producto compartido',price:20000,category_id:'category',is_available:true});
  await ready(page,'',slug);await page.goto('/negocios/'+slug+'/index.html');await chooseWaiterTable(page,'table-0');
  await page.setViewportSize({width:390,height:844});
  const tile=page.locator('.waiter-product-card').filter({has:page.locator('[data-product="'+product+'"]')}),other=page.locator('[data-product="'+shared+'"]');
  await tile.locator('[data-catalog-add]').click();await expect(tile.locator('output')).toHaveText('1');await expect(page.locator('#waiterProductFeedback')).toContainText('1 en esta comanda');
  await expect(other).toBeDisabled();await expect(other).toContainText('Agotado');
  await page.locator('[data-note="0"]').fill('Sin hielo');await tile.locator('[data-catalog-add]').click();await expect(tile.locator('output')).toHaveText('2');await expect(tile.locator('[data-catalog-add]')).toBeDisabled();
  await tile.locator('[data-catalog-minus]').click();await expect(tile.locator('output')).toHaveText('1');await expect(page.locator('[data-note="0"]')).toHaveValue('Sin hielo');
  await tile.locator('[data-catalog-minus]').click();await expect(tile.locator('output')).toHaveText('0');await expect(tile.locator('[data-catalog-minus]')).toBeDisabled();await expect(page.locator('[data-quantity]')).toHaveCount(0);await expect(other).toBeEnabled();
  // A sale from another device depletes the same raw material without changing ordersRevision.
  await page.evaluate(async product=>{const id=crypto.randomUUID(),invoice={id,number:'REMOTE-'+id.slice(0,8),sessionId:'walk-'+id,saleChannel:'walk_in',createdAt:new Date().toISOString(),table:'Venta individual',items:[{id:crypto.randomUUID(),menu_item_id:product,item_name:'Producto de prueba',quantity:2,unit_price:10000}],totals:{subtotal:20000,total:20000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:20000}]};await (window as any).OracleDb.networkPos('record_sale',{invoice},id);},product);
  expect(server.state.operations.ingredients[0].quantity).toBe(0);
  await page.locator('#waiterSearch').fill('producto');await expect(page.locator('#waiterSearch')).toBeFocused();
  await expect(tile.locator('[data-product]')).toBeDisabled({timeout:12000});await expect(other).toBeDisabled();
  await page.screenshot({path:'test-results/waiter-stock-'+slug+'-mobile.png',fullPage:true});
  // Less than a portion remains exhausted; one complete portion re-enables only its recipe.
  server.state.operations.ingredients[0].quantity=249;
  await page.evaluate(async()=>{await (window as any).AllianceOffline.prime(true);});await expect(tile.locator('[data-product]')).toBeDisabled();
  server.state.operations.ingredients[0].quantity=250;
  await expect(tile.locator('[data-product]')).toBeEnabled({timeout:12000});await expect(other).toBeDisabled();await expect(page.locator('#waiterSearch')).toBeFocused();
  server.state.operations.ingredients[0].quantity=2500;
  await expect(tile.locator('[data-product]')).toContainText('Puedes agregar 10 más',{timeout:12000});await expect(other).toContainText('Puedes agregar 5 más');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.screenshot({path:'test-results/waiter-catalog-'+slug+'-desktop.png',fullPage:true});
});

test('el aviso de faltantes muestra insumos y capacidades dentro del mismo modal en móvil',async({page})=>{
  const server=await backend(page);server.state.units.push({id:'g',dimension:'MASS',factor:1});
  server.state.operations.ingredients=Array.from({length:7},(_,i)=>({id:'raw-'+i,name:i===0?'Menta <fresca>':'Insumo '+i,unit:'g',quantity:100,unitCost:10,minStock:0}));
  server.state.operations.recipes=[{productId:product,managed:true,lines:server.state.operations.ingredients.map((raw:any)=>({ingredientId:raw.id,quantity:50,unit:'g'}))}];
  await ready(page);await page.goto('/negocios/cocteleria/index.html');await chooseWaiterTable(page,'table-0');await expect(page.locator('[data-product]')).toBeEnabled();
  // Simulate stock changing between drawing the enabled button and validating the tap.
  await page.evaluate(async product=>{const w=window as any,s=await w.OracleDb.remote('operations_snapshot');document.dispatchEvent(new CustomEvent('alliance-operations-updated',{detail:s}));for(const raw of s.model.ingredients)raw.quantity=0;document.querySelector<HTMLButtonElement>('[data-product="'+product+'"]')!.click();},product);
  const dialog=page.locator('#systemMessageDialog');await expect(dialog).toBeVisible();await expect(dialog.locator('.message-details article')).toHaveCount(7);await expect(dialog.locator('.message-details article').first()).toContainText('Menta <fresca>');await expect(dialog.locator('.message-details article').first()).toContainText('Disponible0 g');await expect(dialog.locator('.message-details article').first()).toContainText('Necesario50 g');await expect(dialog.locator('.message-details article').first()).toContainText('Faltante50 g');await expect(dialog.locator('.message-summaries')).toContainText('Agotado');await expect(page.locator('[data-quantity]')).toHaveCount(0);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(dialog.getByRole('button',{name:'Entendido'})).toBeVisible();await page.screenshot({path:'test-results/waiter-shortage-'+width+'.png'});}
  await dialog.getByRole('button',{name:'Entendido'}).click();await expect(dialog).toHaveCount(0);
});
