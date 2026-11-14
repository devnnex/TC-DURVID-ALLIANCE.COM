import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

for(const branch of ['cocteleria','cafeteria'])test(branch+': la celda avisa al seleccionar un insumo insuficiente y se limpia al abastecer',async({page})=>{
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/'+branch+'/admin.html')).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(branch=>{
    const w=window as any,m=w.AllianceCosting.empty(),sheet=w.AllianceJespresso.defaults();
    Object.assign(sheet,{date:'2026-11-13',operating:[],management:[],unforeseenPercent:0,capitalMode:'manual',capitalPercent:0,ivaPercent:0,consumptionPercent:0});
    m.ingredients=[{id:'milk',name:'Leche',unit:'l',quantity:1,purchasePrice:4000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false},{id:'sugar',stockId:'raw-sugar',name:'Azúcar',unit:'g',quantity:1,purchasePrice:5,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
    m.recipes=[{id:'recipe',name:'Bebida de prueba',size:'',category:'Recetas',output:2,wastePercent:0,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:null,pricingBasis:'production',minutes:null,monthlyUnits:null,sheet,lines:[{ingredientId:'milk',quantity:1,unit:'l',stage:'batch'},{ingredientId:'sugar',quantity:10,unit:'g',stage:'batch'}]}];
    w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
    const key='alliance-operational-demo-v1:'+branch,state=JSON.parse(localStorage.getItem(key)!);
    state.operations=w.AllianceOperationsEngine.empty();state.operations.ingredients=[{id:'raw-milk',name:'Leche',unit:'ml',quantity:500,unitCost:4,minStock:0,revision:1},{id:'raw-sugar',name:'Azúcar',unit:'g',quantity:100,unitCost:5,minStock:0,revision:1}];
    localStorage.setItem(key,JSON.stringify(state));
  },branch);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  const row=page.locator('[data-j-line="0"]'),cell=row.locator('td').first(),warning=row.locator('[data-j-stock-warning]');
  await row.locator('[data-j-action=source]').click();await page.getByRole('option',{name:'Leche · ml',exact:true}).click();
  await expect(cell).toHaveClass(/jr-stock-insufficient/);await expect(cell).toHaveCSS('animation-name','jr-stock-pulse');
  await expect(warning).toContainText('Disponible: 500 ml. Necesitas: 1.000 ml. Faltan: 500 ml. Debes abastecer');
  await expect(page.locator('[data-j-line="1"] td').first()).not.toHaveClass(/jr-stock-insufficient/);
  await expect(row.locator('textarea')).toHaveAttribute('aria-describedby','jr-stock-warning-0');
  await page.locator('[data-j-path=name]').fill('Otro nombre');await expect(warning).toBeVisible();
  await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText('Receta guardada');await expect(warning).toBeVisible();
  await page.reload();await expect(warning).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});await expect(cell).toHaveCSS('animation-name','none');await expect(warning).toBeVisible();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/costing-stock-warning-'+branch+'.png',fullPage:true});
  await page.evaluate(async branch=>{
    const key='alliance-operational-demo-v1:'+branch,state=JSON.parse(localStorage.getItem(key)!);
    state.operations.ingredients.find((i:any)=>i.id==='raw-milk').quantity=1500;localStorage.setItem(key,JSON.stringify(state));
    await (window as any).MaterialsPanel.refresh();
  },branch);
  await expect(warning).toBeHidden();await expect(cell).not.toHaveClass(/jr-stock-insufficient/);
  await expect(row.locator('textarea')).not.toHaveAttribute('aria-describedby');
  await row.locator('[data-j-final]').fill('500');await expect(warning).toContainText('Necesitas: 2.000 ml. Faltan: 500 ml.');
  await row.locator('[data-j-final]').fill('1000');await expect(warning).toBeHidden();
  await page.locator('[data-j-path="lines.0.stage"]').selectOption('portion');await expect(warning).toBeVisible();
  await page.locator('[data-j-path=output]').fill('1');await expect(warning).toBeHidden();
});
