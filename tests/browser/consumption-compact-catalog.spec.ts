import {test,expect} from '@playwright/test';
import {backend,ready,product} from './helpers/operational-backend';

for(const slug of ['cafeteria','cocteleria'])test(slug+': catálogo principal, cantidades inmediatas y paneles plegables',async({page})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;
 server.state.docs.table_sessions=[{id:'existing',table_id:'table-0',status:'open',created_at:'2026-11-24T15:00:00Z'}];
 server.state.docs.session_items=[{id:'old-line',session_id:'existing',menu_item_id:product,item_name:'Producto de prueba',quantity:1,unit_price:10000,status:'pending',created_at:'2026-11-24T15:00:00Z'}];
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:900});await ready(page,'',slug);await page.locator('[data-open-table="table-0"]').first().click();
 await expect(page.locator('#consumptionCreditPanel')).toBeHidden();await expect(page.locator('#consumptionForm .consumption-quantity')).toBeHidden();
 await expect(page.locator('[data-catalog-product]')).toBeInViewport();
 const title=await page.locator('#consumptionDialogTitle').boundingBox(),charge=await page.locator('#chargeTableAccount').boundingBox(),catalog=await page.locator('#consumptionCatalog').boundingBox();
 expect(charge!.x).toBeGreaterThan(title!.x+title!.width);expect(catalog!.y).toBeLessThan(260);
 const plus=page.getByRole('button',{name:'Aumentar Producto de prueba',exact:true}),minus=page.getByRole('button',{name:'Disminuir Producto de prueba',exact:true});
 for(let i=0;i<3;i++)await plus.click();await expect(page.locator('.consumption-product-steps output')).toHaveText('3');await expect(page.locator('#consumptionSelectionTotal')).toContainText('30.000');
 await minus.click();await expect(page.locator('.consumption-product-steps output')).toHaveText('2');await expect(page.locator('#consumptionSelectionTotal')).toContainText('20.000');await expect(page.locator('#consumptionCatalogFeedback')).toContainText('−1');
 expect(server.state.docs.session_items).toHaveLength(1);
 const current=page.locator('#tableConsumptionPreview'),selection=page.locator('#consumptionSelection');
 await expect(page.getByRole('button',{name:'Expandir consumo actual',exact:true})).toBeVisible();await page.getByRole('button',{name:'Expandir consumo actual',exact:true}).click();
 const initialCurrent=(await current.boundingBox())!.height,initialSelection=(await selection.boundingBox())!.height;
 await page.getByRole('button',{name:'Encoger consumo actual',exact:true}).click();await expect(page.locator('.table-consumption-preview-lines')).toBeHidden();expect((await selection.boundingBox())!.height).toBeGreaterThan(initialSelection);
 await page.getByRole('button',{name:'Expandir consumo actual',exact:true}).click();
 await page.getByRole('button',{name:'Encoger selección actual',exact:true}).click();await expect(page.locator('#consumptionSelectionLines')).toBeHidden();expect((await current.boundingBox())!.height).toBeGreaterThan(initialCurrent);
 await page.getByRole('button',{name:'Expandir selección actual',exact:true}).click();await expect(page.locator('#consumptionSelectionLines')).toBeVisible();
 await page.screenshot({path:'test-results/compact-consumption-'+slug+'.png'});
 for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:width===1280?720:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#consumptionForm').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);}
 await page.setViewportSize({width:1280,height:720});await expect(page.locator('[data-catalog-product]')).toBeInViewport();
 await page.screenshot({path:'test-results/compact-consumption-short-'+slug+'.png'});
 // The existing two-space confirmation works after touching a product control.
 await plus.focus();await page.keyboard.press('Space');await page.keyboard.press('Space');await expect(page.locator('#consumptionDialog')).toBeHidden();
 await expect.poll(()=>server.state.docs.session_items.reduce((sum:number,row:any)=>sum+row.quantity,0)).toBe(3);
 expect(errors).toEqual([]);
});

for(const offline of [false,true])test('crédito desde el icono conserva datos y registro único '+(offline?'sin conexión':'con conexión'),async({page,context})=>{
 const server=await backend(page);server.state.operations.customers=[{id:'ana',name:'Ana Pérez',active:true,allowCredit:true,creditLimit:100000,revision:1}];
 await ready(page);if(offline)await context.setOffline(true);await page.locator('[data-open-table="table-0"]').first().click();await page.locator('[data-consumption-step="1"]').click();
 const toggle=page.getByRole('button',{name:'Abrir opciones de crédito',exact:true});await toggle.click();await expect(page.locator('#consumptionCreditPanel')).toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.locator('.op-customer-picker-toggle').click();await page.locator('[data-customer-choice="ana"]').click();await page.locator('[name=credit_consumption_due]').fill('2026-12-10');
 await page.getByRole('button',{name:'Cerrar opciones de crédito',exact:true}).click();await expect(page.locator('#consumptionCreditPanel')).toBeHidden();await expect(page.locator('#consumptionDialog')).toBeVisible();
 await toggle.click();await expect(page.locator('[name=credit_consumption_due]')).toHaveValue('2026-12-10');await page.locator('#addConsumptionToCredit').click();await expect(page.locator('#consumptionDialog')).toBeHidden();
 if(offline){await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());}await expect.poll(()=>server.state.operations.debts.length).toBe(1);expect(server.state.operations.debts[0].total).toBe(10000);
});

test('disminuir a cero permite recuperar insumos compartidos sin modificar el consumo registrado',async({page})=>{
 const server=await backend(page),other='55555555-5555-4555-8555-555555555555';
 server.state.units.push({id:'g',dimension:'MASS',factor:1});server.state.operations.ingredients=[{id:'raw',name:'Café',unit:'g',quantity:20,minStock:0}];
 server.state.docs.menu_items.push({id:other,name:'Café doble',price:15000,is_available:true,category_id:'category'});server.state.stock[other]={...server.state.stock[product],productId:other};
 server.state.operations.recipes=[product,other].map((id,i)=>({productId:id,managed:true,lines:[{ingredientId:'raw',unit:'g',quantity:i?20:10}]}));
 await ready(page);await page.locator('[data-open-table="table-0"]').first().click();
 const plus=page.locator('[data-step-product="'+product+'"][data-consumption-step="1"]'),minus=page.locator('[data-step-product="'+product+'"][data-consumption-step="-1"]');
 await plus.click();await expect(page.locator('[data-step-product="'+other+'"][data-consumption-step="1"]')).toBeDisabled();await plus.click();await expect(plus).toBeDisabled();await expect(minus).toBeEnabled();
 await minus.click();await minus.click();await expect(page.locator('#consumptionSelection')).toBeHidden();await expect(minus).toBeDisabled();await expect(page.locator('[data-step-product="'+other+'"][data-consumption-step="1"]')).toBeEnabled();
 expect(server.state.docs.session_items).toHaveLength(0);expect(server.state.operations.ingredients[0].quantity).toBe(20);
 await plus.click();await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');await page.locator('[data-open-table="table-0"]').first().click();await expect(page.locator('[data-consumption-card="'+product+'"] output')).toHaveText('1');await expect(page.locator('#consumptionSelectionTotal')).toContainText('10.000');
 await page.locator('[data-edit-consumption-price]').dblclick();await page.locator('.consumption-draft-price-editor').fill('7500');await page.locator('.consumption-draft-price-editor').press('Enter');await plus.click();await expect(page.locator('#consumptionSelectionTotal')).toContainText('15.000');await minus.click();await expect(page.locator('#consumptionSelectionTotal')).toContainText('7.500');
});

test('la selección por teclado conserva cantidad, Enter y la confirmación de doble espacio',async({page})=>{
 const server=await backend(page);await ready(page);await page.locator('[data-open-table="table-0"]').first().click();await page.locator('#consumptionProductSearch').fill('Producto');await page.locator('#consumptionProductSearch').press('ArrowDown');await page.locator('#consumptionProductSearch').press('Enter');
 const quantity=page.locator('#consumptionForm [name=quantity]');await expect(quantity).toBeFocused();await quantity.fill('4');await quantity.press('Enter');await expect(page.locator('#consumptionSelectionTotal')).toContainText('40.000');
 await page.locator('#consumptionProductSearch').focus();await page.keyboard.press('Space');await page.keyboard.press('Space');await expect(page.locator('#consumptionDialog')).toBeHidden();await expect.poll(()=>server.state.docs.session_items[0]?.quantity).toBe(4);
});
