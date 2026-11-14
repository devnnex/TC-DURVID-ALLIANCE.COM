import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

for(const branch of ['cafeteria','cocteleria'])test(branch+': unidades legibles y selector inmediato con actualización lenta',async({page})=>{
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('negocios/'+branch+'/admin.html')).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(branch=>{
    const w=window as any,m=w.AllianceCosting.empty(),sheet=w.AllianceJespresso.defaults();
    Object.assign(sheet,{date:'2026-11-14',operating:[],management:[],capitalMode:'manual'});
    m.ingredients=[{id:'eggs',stockId:'raw-eggs',name:'Huevos',unit:'unit',quantity:1,purchasePrice:600,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];
    m.recipes=[{id:'recipe',name:'Receta por unidades',size:'',category:'Recetas',output:1,wastePercent:0,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:null,pricingBasis:'production',minutes:null,monthlyUnits:null,sheet,lines:[{ingredientId:'eggs',quantity:40,unit:'unit',stage:'batch'}]}];
    w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
    const key='alliance-operational-demo-v1:'+branch,state=JSON.parse(localStorage.getItem(key)!);
    state.operations=w.AllianceOperationsEngine.empty();state.operations.ingredients=[{id:'raw-eggs',name:'Huevos',unit:'u',quantity:100,unitCost:600,minStock:0,revision:1}];
    localStorage.setItem(key,JSON.stringify(state));
  },branch);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect.poll(()=>page.evaluate(()=>(window as any).MaterialsPanel.stockOptions().length)).toBe(1);
  for(const width of [1366,1024,390]){
    await page.setViewportSize({width,height:900});
    const fit=await page.locator('.jr-ingredients').evaluate(table=>{
      const header=table.querySelector('th:nth-child(4)')!,range=document.createRange();range.selectNodeContents(header);
      const select=table.querySelector('td:nth-child(4) select') as HTMLSelectElement,style=getComputedStyle(select),ctx=document.createElement('canvas').getContext('2d')!;
      ctx.font=style.font;
      const packageLabel=table.querySelector('.jr-package-label')!,packageRange=document.createRange();packageRange.selectNode(packageLabel.firstChild!);
      return {lines:range.getClientRects().length,packageLines:packageRange.getClientRects().length,available:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-24,text:ctx.measureText(select.selectedOptions[0].textContent!).width,pageFits:document.documentElement.scrollWidth<=innerWidth};
    });
    expect(fit.lines).toBe(1);expect(fit.packageLines).toBe(1);expect(fit.available).toBeGreaterThanOrEqual(fit.text);expect(fit.pageFits).toBe(true);
  }
  await page.setViewportSize({width:1366,height:900});
  await page.locator('.jr-ingredients').screenshot({path:'test-results/recipe-units-'+branch+'.png'});
  const opened=await page.evaluate(()=>{
    const w=window as any;w.stockWaits=[];w.stockChoices=w.MaterialsPanel.stockOptions();
    w.MaterialsPanel.stockOptions=()=>w.stockChoices;
    w.MaterialsPanel.refresh=()=>new Promise(resolve=>w.stockWaits.push(resolve));
    (document.querySelector('[data-j-action=source]') as HTMLButtonElement).click();
    return !!document.querySelector('.cost-stock-menu:popover-open');
  });
  expect(opened).toBe(true);
  const arrow=page.locator('[data-j-action=source]'),menu=page.locator('.cost-stock-menu');
  await arrow.click();await expect(menu).toHaveCount(0);await expect(arrow).toHaveAttribute('aria-expanded','false');
  await page.evaluate(()=>{const w=window as any;w.stockWaits.splice(0).forEach((resolve:any)=>resolve());});await expect(menu).toHaveCount(0);
  await arrow.click();await expect(menu).toBeVisible();
  await page.locator('[data-j-path=name]').click();await expect(menu).toHaveCount(0);
  await page.evaluate(()=>{const w=window as any;w.stockWaits.splice(0).forEach((resolve:any)=>resolve());});await expect(menu).toHaveCount(0);
  await arrow.click();await menu.getByRole('searchbox').fill('nuevo');
  await page.evaluate(()=>{
    const w=window as any;w.stockChoices=[...w.stockChoices,{id:'raw-new',name:'Nuevo ingrediente',unit:'u',quantity:100,unitCost:500}];
    w.stockWaits.splice(0).forEach((resolve:any)=>resolve());
  });
  await expect(menu.getByRole('searchbox')).toHaveValue('nuevo');await expect(menu.getByRole('searchbox')).toBeFocused();
  await menu.getByRole('option',{name:'Nuevo ingrediente · unidades',exact:true}).click();
  await expect(menu).toHaveCount(0);await expect(page.locator('[data-j-ingredient=name]')).toHaveValue('Nuevo ingrediente');
  await arrow.click();await menu.getByRole('searchbox').press('Escape');await expect(menu).toHaveCount(0);await expect(arrow).toBeFocused();
  await arrow.click();const option=menu.getByRole('option',{name:'Nuevo ingrediente · unidades',exact:true});await option.focus();
  await page.evaluate(()=>{
    const w=window as any;w.stockChoices=w.stockChoices.map((item:any)=>({...item,unitCost:777}));
    w.stockWaits.splice(0).forEach((resolve:any)=>resolve());
  });
  await expect(option).toBeFocused();await option.press('Enter');await expect(menu).toHaveCount(0);
  expect(await page.locator('[data-j-ingredient=purchasePrice]').evaluate(input=>(window as any).AllianceMoney.number(input))).toBe(777);
});
