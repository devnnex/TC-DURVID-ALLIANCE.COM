import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

test('práctica en una pantalla en todas las sucursales: cambios inmediatos, ayudas y datos reales intactos',async({page,context})=>{
  test.setTimeout(120000);await context.setOffline(true);
  const requests:string[]=[];const errors:string[]=[];
  page.on('request',r=>{if(r.url().includes('/ords/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal']){
    await page.goto(pathToFileURL(resolve('negocios',branch,'admin.html')).href+'?demo=1#costing');
    await expect(page.locator('#costingStatus')).toContainText('Demostración');
    await expect(page.locator('#costingExample')).toBeEnabled();
    // A saved ingredient of the business must survive every practice operation.
    await page.locator('.cost-steps [data-tab=ingredients]').click();const form=page.locator('#costEditor');await form.locator('[name=name]').fill('Ingrediente del negocio');await form.locator('[name=quantity]').fill('1');await form.locator('[name=purchasePrice]').fill('9000');await form.getByRole('button',{name:'Agregar registro'}).click();
    await page.locator('#costingExample').click();
    await expect(page.locator('.cost-practice')).toContainText('datos ficticios');
    await expect(page.locator('.cost-example-check')).toContainText('$45');
    await expect(page.locator('.cost-steps')).toHaveCount(0);
    await expect(page.locator('#costingSave')).toBeHidden();
    await expect(page.locator('#costCalculated .metric-card').nth(0)).toContainText('5.500');
    await expect(page.locator('#costCalculated .metric-card').nth(1)).toContainText('7.858');
    await expect(page.locator('#costCalculated .metric-card').nth(2)).toContainText('4.500');
    const help=page.getByRole('button',{name:'Ayuda: De cada $100, quiero ganar…',exact:true});
    await help.hover();await expect(page.locator('#costingContent [role=tooltip]').filter({hasText:'$30 de cada'})).toBeVisible();
    await help.click();await expect(help).toHaveAttribute('aria-expanded','true');await help.press('Escape');await expect(help).toHaveAttribute('aria-expanded','false');
    expect(await page.locator('.cost-play-grid .cost-info').count()).toBe(await page.locator('[data-practice-field]').count());
    const cheese=page.locator('[name=cheesePrice]');await cheese.fill('30000');await expect(cheese).toBeFocused();
    await expect(page.locator('#costCalculated .metric-card').nth(0)).toContainText('6.500');await expect(page.locator('#costCalculated .metric-card').nth(1)).toContainText('9.286');await expect(page.locator('#costCalculated .metric-card').nth(2)).toContainText('3.500');
    await expect(page.locator('[data-practice-line="1"]')).toContainText('3.000');
    await page.locator('[data-example-exit]').click();await page.reload();await expect(page.locator('.cost-table').first()).toContainText('Ingrediente del negocio');await page.locator('#costingExample').click();
    await expect(cheese).toHaveValue('$30.000');await expect(page.locator('#costCalculated .metric-card').first()).toContainText('6.500');
    await page.locator('[data-example-reset]').click();await expect(page.locator('#costCalculated .metric-card').first()).toContainText('5.500');
    await page.locator('[data-example-exit]').click();await expect(page.locator('.cost-practice')).toHaveCount(0);await expect(page.locator('.cost-table').first()).toContainText('Ingrediente del negocio');await expect(page.locator('.cost-table').first()).not.toContainText('Harina');
    await page.reload();await expect(page.locator('.cost-table').first()).toContainText('Ingrediente del negocio');
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#costingExample').click();
  await page.locator('[name=cheesePrice]').fill('30000');await expect(page.locator('#costPracticePeek')).toBeInViewport();await expect(page.locator('#costPracticePeek')).toContainText('6.500');
  await page.locator('[data-example-reset]').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/friendly-costing-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/friendly-costing-desktop.png',fullPage:true});
  expect(requests).toEqual([]);expect(errors).toEqual([]);
});

test('práctica: cada campo recalcula, los datos incompletos pausan el resultado y Excel usa el escenario actual',async({page,context})=>{
  await context.setOffline(true);await page.goto(pathToFileURL(resolve('negocios/cocteleria/admin.html')).href+'?demo=1#costing');await expect(page.locator('#costingExample')).toBeEnabled();await page.locator('#costingExample').click();
  const cards=page.locator('#costCalculated .metric-card');
  // Inspect during the input event: no save, blur, request or timer is needed.
  const instant=await page.locator('[name=flourPrice]').evaluate((input:HTMLInputElement)=>{input.value='15000';input.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('#costCalculated .metric-card')?.textContent;});expect(instant).toContain('6.500');
  await page.locator('[name=flourGrams]').fill('100');await expect(cards.first()).toContainText('5.000');
  await page.locator('[name=cheeseGrams]').fill('200');await expect(cards.first()).toContainText('7.000');
  await page.locator('[name=practicePrice]').fill('12000');await expect(cards.nth(2)).toContainText('5.000');
  await page.locator('[name=practiceTarget]').fill('50');await expect(cards.nth(1)).toContainText('14.000');
  await page.locator('.cost-play-expenses summary').click();
  await page.locator('[name=practiceBox]').fill('1000');await expect(cards.first()).toContainText('7.500');
  await page.locator('[name=practiceRent]').fill('200000');await expect(cards.first()).toContainText('8.500');
  await page.locator('[name=practiceUnits]').fill('200');await expect(cards.first()).toContainText('7.500');
  for(const [field,bad] of [['flourPrice',''],['flourGrams','0'],['cheesePrice','-1'],['practiceTarget','100'],['practiceUnits','0']]){
    const control=page.locator(`[name=${field}]`),good=await control.inputValue();await control.fill(bad);await expect(control).toHaveAttribute('aria-invalid','true');await expect(cards).toHaveCount(0);await expect(page.locator('#costCalculated')).toContainText('Revisa');await expect(page.locator('#costingExcel')).toBeDisabled();await control.fill(good);await expect(cards.first()).toContainText('7.500');
  }
  await page.locator('[data-practice-action=loss]').click();await expect(cards.nth(2)).toContainText('Pierdes');await expect(cards.nth(2)).toContainText('500');await expect(page.locator('.cost-example-check')).toContainText('más barato');
  await page.locator('[data-practice-action=cheese]').click();await expect(cards.first()).toContainText('9.500');
  const downloaded=page.waitForEvent('download');await page.locator('#costingExcel').click();const file=await downloaded;expect(file.suggestedFilename()).toMatch(/^Ejemplo-Costeo-/);
  await file.saveAs('test-results/costing-practice.xlsx');
  const workbook=await page.evaluate(bytes=>{const X=(window as any).XLSX,wb=X.read(Uint8Array.from(bytes),{type:'array'});return {prices:X.utils.sheet_to_json(wb.Sheets.Ingredientes),results:X.utils.sheet_to_json(wb.Sheets.Rentabilidad),guide:X.utils.sheet_to_json(wb.Sheets.Guía)};},[...await readFile('test-results/costing-practice.xlsx')]);
  expect(workbook.prices[1]['Precio pagado COP']).toBe(30000);expect(workbook.results[0]['Costo unitario COP']).toBe(9500);expect(workbook.results[0]['Ganancia COP']).toBe(-2500);expect(workbook.results[0]['Precio sugerido COP']).toBe(19000);expect(JSON.stringify(workbook.guide)).toContain('datos ficticios');
  await page.locator('[data-example-reset]').click();await expect(cards.first()).toContainText('5.500');await expect(page.locator('[name=practiceTarget]')).toHaveValue('30');
});

test('primera receta: la forma de venta se crea en el mismo paso, sin saltos técnicos',async({page,context})=>{
  await context.setOffline(true);await page.goto(pathToFileURL(resolve('negocios/cocteleria/admin.html')).href+'?demo=1#costing');await expect(page.locator('#costingStatus')).toContainText('Demostración');
  await page.locator('.cost-steps [data-tab=ingredients]').click();let f=page.locator('#costEditor');await f.locator('[name=name]').fill('Harina');await f.locator('[name=quantity]').fill('1');await f.locator('[name=purchasePrice]').fill('10000');await f.locator('button[type=submit]').click();
  await page.locator('[data-tab=recipes]').click();f=page.locator('#costEditor');await f.locator('[name=name]').fill('Pan');await f.locator('[name=currentPrice]').fill('5000');await f.locator('[name=newChannelName]').fill('Salón · efectivo');await f.locator('[data-add-line]').click();await f.locator('.cost-line [name=quantity]').fill('200');await f.locator('.cost-line [name=unit]').selectOption('g');await f.locator('button[type=submit]').click();
  await page.locator('[data-tab=analysis]').click();await expect(page.locator('#costCalculated .metric-card').first()).toContainText('2.000');await expect(page.locator('[name=liveChannel]')).toContainText('Salón · efectivo');
});

test('formularios de ingreso: identidad fija y mostrar contraseña en las cuatro sucursales',async({page})=>{
  for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal']){
    await page.goto('/negocios/'+branch+'/admin.html');await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('[name=business]')).toHaveAttribute('readonly','');await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();await expect(page.locator('#loginForm [name=pin]')).toHaveAttribute('type','text');await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();await expect(page.locator('#loginForm [name=pin]')).toHaveAttribute('type','password');await expect(page.getByRole('link',{name:'Volver a negocios',exact:true})).toBeVisible();
  }
  await page.screenshot({path:'test-results/friendly-login-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/friendly-login-mobile.png',fullPage:true});
});
