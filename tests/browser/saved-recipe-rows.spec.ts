import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

for(const branch of ['cafeteria','cocteleria'])test(branch+': recetas guardadas en filas, mismo contenido y desglose persistente',async({page})=>{
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/'+branch+'/admin.html')).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(()=>{
    const w=window as any,m=w.AllianceCosting.empty(),sheet=w.AllianceJespresso.defaults();
    Object.assign(sheet,{date:'2026-11-14',operating:[],management:[],unforeseenPercent:0,capitalMode:'manual',capitalPercent:0,consumptionPercent:0,ivaPercent:0});
    m.ingredients=[{id:'sugar',name:'Azúcar',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
    m.recipes=['Limonada de coco','Masa para empanadas con nombre largo'].map((name,i)=>({id:'recipe-'+i,name,size:i?'Familiar':'',category:'Recetas',output:i?4:2,wastePercent:0,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:null,pricingBasis:'production',minutes:null,monthlyUnits:null,sheet:structuredClone(sheet),lines:[{ingredientId:'sugar',quantity:200,unit:'g',stage:'batch'}]}));
    w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
  });
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  const list=page.locator('.jr-saved-section .jr-recipe-list'),rows=list.locator('.jr-recipe-row'),first=rows.nth(0),second=rows.nth(1),details=first.locator('details');
  await expect(rows).toHaveCount(2);await expect(list.locator('.cost-product-card')).toHaveCount(0);
  await expect(first.locator('h3')).toHaveText('Limonada de coco');await expect(first.locator('dd')).toHaveText(['2',/1\.000/,/1\.500/]);
  await expect(second.locator('h3')).toHaveText('Masa para empanadas con nombre largo · Familiar');
  await expect(first.getByRole('button',{name:'Ver y editar receta',exact:true})).toBeVisible();await expect(first.getByRole('button',{name:'Eliminar',exact:true})).toBeVisible();
  const a=await first.boundingBox(),b=await second.boundingBox();expect(b!.x).toBeCloseTo(a!.x,0);expect(b!.width).toBeCloseTo(a!.width,0);expect(b!.y).toBeGreaterThanOrEqual(a!.y+a!.height);
  await details.locator('summary').click();await expect(details).toHaveAttribute('open','');await expect(details.locator('ul')).toContainText('Azúcar · 200 g');await expect(details.locator('ul')).toContainText('2.000');
  await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText('Receta guardada');await expect(details).toHaveAttribute('open','');
  await page.locator('.jr-saved-section').screenshot({path:'test-results/saved-recipe-rows-'+branch+'.png'});
  await details.locator('summary').click();await page.locator('#costingSave').click();await expect(details).not.toHaveAttribute('open','');
  await second.getByRole('button',{name:'Ver y editar receta',exact:true}).click();await expect(page.locator('[data-j-path=name]')).toHaveValue('Masa para empanadas con nombre largo');await expect(page.locator('[data-j-path=output]')).toHaveValue('4');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await details.locator('summary').click();await expect(details.locator('ul')).toBeVisible();
  await page.locator('.jr-saved-section').screenshot({path:'test-results/saved-recipe-rows-mobile-'+branch+'.png'});
  await page.locator('[data-j-tab=history]').click();await page.getByRole('searchbox',{name:'Buscar receta guardada'}).fill('Familiar');
  await expect(page.locator('.jr-recipe-row')).toHaveCount(1);await expect(page.locator('.jr-recipe-row')).toContainText('Masa para empanadas');
  await page.locator('.jr-recipe-row').getByRole('button',{name:'Eliminar',exact:true}).click();await page.locator('#systemMessageDialog [value=accept]').click();
  await page.getByRole('searchbox',{name:'Buscar receta guardada'}).fill('');await expect(page.locator('.jr-recipe-row')).toHaveCount(1);await expect(page.locator('.jr-recipe-row')).toContainText('Limonada de coco');
});
