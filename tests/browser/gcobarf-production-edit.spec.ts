import {test,expect,type Page} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

async function open(page:Page,branch='gcobarf'){
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href+'?demo=1#costing');
  await expect(page.locator('#costingReload')).toBeEnabled();
}
async function seed(page:Page,branch='gcobarf'){
  await page.evaluate((branch:string)=>{
    const w=window as any,m=w.AllianceCosting.empty();
    m.ingredients=[{id:'chicken',name:'Pollo',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false,purchaseDate:'2026-10-20'}];
    m.channels=[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
    const r:any={id:'recipe',name:'Primera producción',size:'',category:'',output:2,wastePercent:0,currentPrice:10000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',minutes:null,monthlyUnits:null,lines:[{ingredientId:'chicken',quantity:1000,unit:'g'}]};
    if(branch!=='gcobarf'){r.sheet=w.AllianceJespresso.defaults();r.sheet.date='2026-10-20';r.sheet.unforeseenPercent=0;r.sheet.management=[];}
    m.recipes=[r];w.OracleDb.local.setItem('costing-saved',JSON.stringify({model:m,revision:1}));
  },branch);
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
}

test('GCOBARF: editar unidad y nombre, fecha automática, borrador, merma y hoja vacía',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await seed(page);
  await expect(page.getByRole('button',{name:'Editar producto',exact:true})).toHaveCount(0);
  await page.locator('[data-sheet-editor=ingredients][data-key=chicken]').click();
  let modal=page.locator('#costSheetEditor');
  await modal.locator('[name=name]').fill('Pollo por unidades');await modal.locator('[name=unit]').selectOption('unit');
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet-editor=ingredients][data-key=chicken]').click();
  await expect(modal.locator('[name=name]')).toHaveValue('Pollo por unidades');
  await expect(modal.locator('[name=unit]')).toHaveValue('unit');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await expect(modal.locator('[name=purchaseDate]')).toHaveValue(today);
  await expect(modal.locator('[name=purchaseDate]')).not.toBeEditable();
  await modal.locator('[type=submit]').click();await expect(modal).toHaveCount(0);
  await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  await expect(page.locator('[data-sheet-line]')).toHaveValue('1');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('5.000');
  await page.locator('[data-sheet-yield]').click();const yieldDialog=page.locator('#ingredientYieldDialog');
  await yieldDialog.locator('[name=clean]').fill('20');await yieldDialog.locator('[type=submit]').click();
  await expect(yieldDialog).not.toBeVisible();await expect(page.locator('[data-sheet-production-unit]')).toContainText('6.250');
  await page.getByRole('button',{name:'+ Nuevo producto',exact:true}).click();modal=page.locator('#costSheetEditor');
  await expect(modal.locator('.cost-line')).toHaveCount(0);await modal.locator('[name=name]').fill('Segunda producción');
  await modal.locator('[name=channelId]').selectOption('direct');await modal.locator('[type=submit]').click();
  await expect(modal).toHaveCount(0);await expect(page.locator('[data-sheet-line]')).toHaveCount(0);
  await expect(page.locator('.cost-excel-table').first().locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button',{name:'+ Agregar insumo',exact:true}).click();modal=page.locator('#costSheetEditor');
  await modal.locator('[name=name]').fill('Bolsas');await modal.locator('[name=unit]').selectOption('unit');
  await modal.locator('[name=quantity]').fill('10');await modal.locator('[name=purchasePrice]').fill('1000');
  await expect(modal.locator('[name=purchaseDate]')).toHaveValue(today);
  await modal.locator('[type=submit]').click();await expect(modal).toHaveCount(0);
  await expect(page.locator('[data-sheet-line]')).toHaveCount(1);await expect(page.locator('[data-sheet-production-unit]')).toContainText('1.000');
  await page.locator('[data-sheet-open=recipe]').click();
  await expect.poll(()=>page.locator('.cost-sheet-heading').evaluate(e=>e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(-1);
  expect(await page.locator('.cost-sheet-heading').evaluate(e=>e.getBoundingClientRect().top)).toBeLessThan(200);
  await expect(page.locator('[data-sheet-line]')).toHaveValue('1');await expect(page.locator('[data-sheet-production-unit]')).toContainText('6.250');
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();await expect(page.locator('[data-sheet-production-unit]')).toContainText('6.250');
  expect(errors).toEqual([]);
});

test('GCOBARF: fecha del guardado y recálculo al editar cada dato de la compra',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-31T04:59:00Z'));
  await open(page);await seed(page);
  const edit=page.locator('[data-sheet-editor=ingredients][data-key=chicken]'),modal=page.locator('#costSheetEditor');
  const saved=()=>page.evaluate(()=>JSON.parse((window as any).OracleDb.local.getItem('costing-saved')).model);
  await edit.click();await expect(modal.locator('[name=purchaseDate]')).toHaveValue('2026-10-30');
  await modal.locator('[name=name]').fill('Pollo actualizado');
  await page.clock.setFixedTime(new Date('2026-10-31T05:01:00Z'));
  await modal.locator('[type=submit]').click();await expect(modal).toHaveCount(0);
  await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  expect((await saved()).ingredients[0].purchaseDate).toBe('2026-10-31');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('5.000');
  await expect(page.locator('.cost-excel-table').first()).toContainText('Pollo actualizado');

  await page.clock.setFixedTime(new Date('2026-11-01T05:01:00Z'));
  for(const change of [
    {field:'purchasePrice',value:'18000',cost:'9.000'},
    {field:'quantity',value:'3',cost:'3.000'},
    {field:'unit',value:'unit',cost:'3.000'},
    {field:'unit',value:'l',cost:'3.000'},
    {field:'unit',value:'kg',cost:'3.000'},
    {field:'unit',value:'g',purchaseQuantity:'3000',cost:'3.000'}
  ]){
    await edit.click();await expect(modal.locator('[name=purchaseDate]')).toHaveValue('2026-11-01');
    const control=modal.locator(`[name=${change.field}]`);
    if(change.field==='unit')await control.selectOption(change.value);else await control.fill(change.value);
    if(change.purchaseQuantity)await modal.locator('[name=quantity]').fill(change.purchaseQuantity);
    await modal.locator('[type=submit]').click();await expect(modal).toHaveCount(0);
    await expect(page.locator('#costingStatus')).toContainText('Guardado local');
    await expect(page.locator('[data-sheet-production-unit]')).toContainText(change.cost);
    const model=await saved();expect(model.ingredients[0].purchaseDate).toBe('2026-11-01');
    expect(String(model.ingredients[0][change.field])).toBe(change.value);
  }
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('3.000');
  await page.getByRole('button',{name:'+ Agregar insumo',exact:true}).click();
  await expect(modal.locator('[name=purchaseDate]')).toHaveValue('2026-11-01');
  await modal.locator('[name=name]').fill('Bolsas nuevas');await modal.locator('[name=quantity]').fill('1');
  await modal.locator('[name=purchasePrice]').fill('2000');
  await page.clock.setFixedTime(new Date('2026-11-02T05:01:00Z'));
  await modal.locator('[type=submit]').click();await expect(modal).toHaveCount(0);
  await expect(page.locator('#costingStatus')).toContainText('Guardado local');
  expect((await saved()).ingredients.at(-1).purchaseDate).toBe('2026-11-02');
  await expect(page.locator('[data-sheet-production-unit]')).toContainText('4.000');
});

test('GCOBARF: Inicio sólo personas, secciones suspendidas y clientes disponibles',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.locator('.admin-sidebar [href="#dashboard"]').click();
  await expect(page.locator('#tablesGrid .lucide-user-round')).toHaveCount(24);
  await expect(page.locator('.dashboard-tables-panel h2')).toHaveText('Personas');
  for(const section of ['service','accounts','menu']){
    await expect(page.locator(`.admin-sidebar [href="#${section}"]`)).toHaveCount(0);
    await expect(page.locator(`template[data-gcobarf-suspended="${section}"]`)).toHaveCount(1);
  }
  await expect(page.locator('.admin-sidebar [href="#customers"]')).toBeVisible();
  await page.locator('.admin-sidebar [href="#customers"]').click();await expect(page.locator('#customers')).toBeVisible();
  await page.locator('.admin-sidebar [href="#dashboard"]').click();
  await page.locator('#tablesGrid [data-open-table]').first().click();await expect(page.locator('#consumptionContextIcon .lucide-user-round')).toBeVisible();
  await page.locator('[data-cancel-consumption]').first().click();
  await page.reload();await expect(page.locator('#tablesGrid .lucide-user-round')).toHaveCount(24);expect(errors).toEqual([]);
});

for(const branch of ['gcobarf','cocteleria','cafeteria','sucursal'])test(`borrador de merma al cerrar por accidente: ${branch}`,async({page})=>{
  await open(page,branch);await seed(page,branch);
  await page.getByRole('button',{name:'Configurar merma',exact:true}).first().click();
  const modal=page.locator('#ingredientYieldDialog');await modal.locator('[name=clean]').fill('15');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Configurar merma',exact:true}).first().click();await expect(modal.locator('[name=clean]')).toHaveValue('15');
  await modal.getByRole('button',{name:'Guardar y aplicar merma',exact:true}).click();await expect(modal).not.toBeVisible();
  await page.reload();await expect(page.locator('#costingReload')).toBeEnabled();await page.getByRole('button',{name:'Configurar merma',exact:true}).first().click();
  await expect(modal.locator('[name=clean]')).toHaveValue('15');
});
