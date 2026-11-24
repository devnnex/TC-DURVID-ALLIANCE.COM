import {test,expect} from '@playwright/test';
import {backend,ready,product} from './helpers/operational-backend';

for(const slug of ['cocteleria','cafeteria'])test(slug+': catálogo con fotos, capacidad compartida y traslado sin perder selección',async({page})=>{
  const server=await backend(page);server.context.locations[0].slug=slug;
  const second='55555555-5555-4555-8555-555555555555';
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
  server.state.docs.menu_items[0].name='Café de la casa';
  server.state.docs.menu_items.push({id:second,name:'Café doble',price:12000,is_available:true,category_id:'category'});
  server.state.stock[second]={...server.state.stock[product],productId:second};
  server.state.operations.ingredients=[{id:'coffee',name:'Café',unit:'g',quantity:20,unitCost:50,minStock:0,revision:1}];
  server.state.operations.recipes=[product,second].map((id,i)=>({id,productId:id,recipeId:'recipe-'+id,name:'Café',managed:true,salePortions:1,lines:[{ingredientId:'coffee',unit:'g',quantity:i?20:10}]}));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});await ready(page,'',slug);
  await expect(page.locator('#dashboard h1')).toHaveText('Mesas');
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await page.locator('[data-edit-inventory="'+product+'"]').click();
  const photo=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=2000;c.height=1500;const x=c.getContext('2d')!;x.fillStyle='#b98136';x.fillRect(0,0,c.width,c.height);x.fillStyle='#382215';x.fillRect(300,200,1200,1000);const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/png'));return Array.from(new Uint8Array(await b.arrayBuffer()));});
  await page.locator('[name=product_photo]').setInputFiles({name:'cafe.png',mimeType:'image/png',buffer:Buffer.from(photo)});
  await expect(page.locator('[data-product-photo-status]')).toContainText('Lista');
  await page.locator('#inventoryForm [type=submit]').click();await expect(page.locator('#inventoryDialog')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBe(0);
  expect(server.state.docs.menu_items[0].image_url).toMatch(/^data:image\/webp;base64,/);
  expect(Buffer.from(server.state.docs.menu_items[0].image_url.split(',')[1],'base64').length).toBeLessThanOrEqual(80*1024);
  await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');
  await page.locator('.admin-sidebar [href="#dashboard"]').click();await page.locator('[data-open-table="table-0"]').first().click();
  const first=page.locator('[data-catalog-product="'+product+'"]'),other=page.locator('[data-catalog-product="'+second+'"]');
  await expect(first.locator('img')).toBeVisible();await expect(first).toContainText('2 para preparar');await expect(other).toContainText('1 para preparar');
  await expect(page.locator('#consumptionProductOptions')).toBeHidden();await first.click();await page.locator('#consumptionForm [name=quantity]').fill('1');await page.locator('#consumptionQueueButton').click();
  await expect(first).toContainText('1 para preparar');await expect(other).toBeDisabled();await expect(other).toContainText('Agotado');
  await page.locator('#consumptionSubmitButton').click();await expect(page.locator('#consumptionDialog')).toBeHidden();
  await page.locator('[data-open-table="table-0"]').first().click();await expect(page.locator('#moveCurrentTable')).toBeVisible();await expect(page.locator('#printCurrentTable')).toBeVisible();
  await first.click();await page.locator('#consumptionForm [name=quantity]').fill('1');await page.locator('#consumptionQueueButton').click();
  await expect(page.locator('#consumptionSelectionTotal')).toBeInViewport();
  await expect(first).toBeDisabled();expect(await first.locator('.consumption-product-image').evaluate(el=>getComputedStyle(el).filter)).toBe('grayscale(1)');
  await page.locator('#moveCurrentTable').click();await page.locator('#moveTableOptions label').filter({has:page.locator('[value="table-1"]')}).click();await page.locator('#moveTableForm [type=submit]').click();
  await expect(page.locator('#moveTableDialog')).toBeHidden();await expect(page.locator('#consumptionDialogTitle')).toContainText('M2');await expect(page.locator('#consumptionSelectionLines')).toContainText('Café de la casa');
  await page.screenshot({path:'test-results/catalog-'+slug+'.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#consumptionSubmitButton')).toBeInViewport();expect(errors).toEqual([]);
});

test('una foto inválida conserva la anterior y permite retirarla sin cambiar existencias',async({page})=>{
  const server=await backend(page);server.state.docs.menu_items[0].image_url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  await ready(page);await page.locator('.admin-sidebar [href="#inventory"]').click();await page.locator('[data-edit-inventory]').first().click();
  await page.locator('[name=product_photo]').setInputFiles({name:'foto.webp',mimeType:'image/webp',buffer:Buffer.from('invalid')});await expect(page.locator('[data-product-photo-status]')).toContainText('No pudimos leer');await expect(page.locator('[data-product-photo-preview] img')).toBeVisible();
  await page.locator('[data-remove-product-photo]').click();await page.locator('#inventoryForm [type=submit]').click();await expect(page.locator('#inventoryDialog')).toBeHidden();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBe(0);expect(server.state.docs.menu_items[0].image_url).toBe('');expect(server.state.stock[product].stock).toBe(5000);
});

test('GCOBARF muestra fidelización por días y distingue compras de abonos',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-24T17:00:00Z'));
  const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.operations.customers=[{id:'ana',name:'Ana Frecuente',active:true,allowCredit:true,creditLimit:0}];
  server.state.operations.crmSaleDays=[{saleId:'one',customerId:'ana',day:'2026-11-02'},{saleId:'two',customerId:'ana',day:'2026-11-02'},{saleId:'three',customerId:'ana',day:'2026-11-20'}];
  server.state.operations.customerPayments=[{id:'payment',customerId:'ana',at:'2026-11-24T15:00:00Z',amount:1000}];
  await ready(page,'','gcobarf');await page.locator('.admin-sidebar [href="#customers"]').click();
  await expect(page.locator('[data-crm-visit-total]')).toHaveText('2');await expect(page.locator('[data-crm-visit-leader]')).toHaveText('Ana Frecuente');await expect(page.locator('[data-crm-ranked-customer=ana]')).toContainText('2 visitas');
  await page.locator('[data-crm-visit-type]').selectOption('year');await expect(page.locator('[data-crm-visit-total]')).toHaveText('2');
});

test('el login anticipa el desafío sin enviar contraseña y usa el logo ligero',async({page})=>{
  await backend(page);const challenges:any[]=[];
  await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{const r=route.request().postDataJSON();if(r.path!=='/auth/login/challenge'){await route.fallback();return;}challenges.push(r.body);await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{algorithm:'PASSWORD'}})});});
  await page.goto('/negocios/cocteleria/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');
  await expect.poll(()=>challenges.length).toBe(1);expect(JSON.stringify(challenges)).not.toContain('test-password');await expect(page.locator('.admin-login-logo')).toHaveAttribute('src',/pwa-192\.png/);
  await page.locator('#loginForm [type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');expect(challenges).toHaveLength(1);
});
