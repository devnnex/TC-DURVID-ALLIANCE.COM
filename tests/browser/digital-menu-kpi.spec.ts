import {test,expect} from '@playwright/test';
import {backend,ready,product} from './helpers/operational-backend';
for(const slug of ['cafeteria','cocteleria'])test(slug+': costo del menú independiente de la macro y switch junto al nombre',async({page})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;server.state.stock[product].costPrice=1750;server.state.docs.menu_items[0].price=3435;
 server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
 server.state.operations.ingredients=[{id:'raw',name:'Harina',unit:'g',quantity:1230,unitCost:18,minStock:0,revision:1},{id:'other',name:'Otros insumos',unit:'u',quantity:1,unitCost:8085209,minStock:0,revision:1}];
 server.state.operations.recipes=[{id:'recipe',productId:product,name:'Producto de prueba',managed:true,lines:[{ingredientId:'raw',quantity:10,unit:'g'}]}];
 await page.setViewportSize({width:1600,height:1000});await ready(page,'',slug);await page.locator('.admin-sidebar [href="#inventory"]').click();
 const cost=page.locator('#inventoryMetrics article').nth(1);await expect(cost).toContainText('Costo de productos');await expect(cost.locator('strong')).toHaveText(/215\.250/);
 await expect(page.locator('#inventoryMetrics article').nth(2)).toContainText('422.505');
 const toggle=page.locator(`[data-menu-availability="${product}"]`),name=page.locator('.inventory-product-identity > div');
 const gap=await toggle.evaluate((element,name)=>element.getBoundingClientRect().left-(name as HTMLElement).getBoundingClientRect().right,await name.elementHandle());expect(gap).toBeLessThan(32);expect(gap).toBeGreaterThanOrEqual(0);
 await page.locator('#inventory').screenshot({path:`test-results/${slug}-digital-menu.png`,style:'.demo-mode-banner,.admin-sidebar{visibility:hidden!important}'});
 await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');await expect(cost.locator('strong')).toHaveText(/215\.250/);await expect(page.locator('#inventoryMetrics article').nth(2).locator('strong')).toHaveText(/0/);
 await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('.admin-sidebar [href="#materials"]').click();await expect(page.locator('.materials-value-summary')).toContainText('8.107.349');
});
