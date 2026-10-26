import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal'])test(`productos aprobados y pesos dinámicos: ${branch}`,async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await context.setOffline(true);
  await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href+`?demo=1&branch=${branch}#costing`);
  await expect(page.locator('#costingStatus')).toContainText('Demostración');
  await page.locator('.cost-steps [data-tab=ingredients]').click();let form=page.locator('#costEditor');await form.locator('[name=name]').fill('Harina');await form.locator('[name=quantity]').fill('1');
  const price=form.locator('[name=purchasePrice]');await price.fill('1000');await expect(price).toHaveValue('$1.000');
  await price.press('End');await price.press('0');await expect(price).toHaveValue('$10.000');
  await price.fill('$10.000,00');await expect(price).toHaveValue('$10.000');
  await form.locator('button[type=submit]').click();await page.locator('[data-tab=recipes]').click();
  form=page.locator('#costEditor');await form.locator('[name=name]').fill('Pan');await form.locator('[name=size]').fill('Grande');await form.locator('[name=currentPrice]').fill('5000');await expect(form.locator('[name=currentPrice]')).toHaveValue('$5.000');await form.locator('[name=newChannelName]').fill('Salón');await form.locator('[data-add-line]').click();await form.locator('.cost-line [name=quantity]').fill('200');await form.locator('.cost-line [name=unit]').selectOption('g');await form.locator('button[type=submit]').click();
  await page.locator('[data-tab=history]').click();await expect(page.locator('.cost-product-card')).toHaveCount(0);await expect(page.locator('#costBody')).not.toContainText('Versión');
  await page.locator('.cost-steps [data-tab=analysis]').click();await expect(page.locator('[data-approve]')).toBeEnabled();
  await page.locator('[name=livePrice]').fill('1000');await expect(page.locator('[data-approve]')).toBeDisabled();await expect(page.locator('#costCalculated')).toContainText('Ajusta el precio');
  await page.locator('[data-use-price]').click();await expect(page.locator('[name=livePrice]')).toHaveValue('$2.858');await expect(page.locator('[data-approve]')).toBeEnabled();
  await page.locator('[data-approve]').click();await expect(page.locator('.cost-product-card')).toHaveCount(1);await expect(page.locator('.cost-product-card')).toContainText('Pan');await expect(page.locator('.cost-product-card')).toContainText('Meta alcanzada');await expect(page.locator('.cost-product-card')).toContainText('2.858');
  await page.locator('.cost-steps [data-tab=analysis]').click();await page.locator('[name=livePrice]').fill('5000');await expect(page.locator('[data-approve]')).toContainText('Actualizar');await page.locator('[data-approve]').click();await expect(page.locator('.cost-product-card')).toHaveCount(1);await expect(page.locator('.cost-product-card')).toContainText('5.000');
  await page.locator('.cost-steps [data-tab=analysis]').click();await page.locator('[name=livePrice]').fill('6000');await page.locator('[data-tab=history]').click();await page.locator('[data-approved-open]').click();await expect(page.locator('[name=livePrice]')).toHaveValue('$5.000');await expect(page.locator('#costingSave')).toBeDisabled();await page.locator('[data-current]').click();await expect(page.locator('[name=livePrice]')).toHaveValue('$6.000');await expect(page.locator('#costingSave')).toBeEnabled();
  await page.locator('#costingSave').click();await page.reload();await expect(page.locator('#costingStatus')).toContainText('Demostración');await page.locator('[data-tab=history]').click();await expect(page.locator('.cost-product-card')).toHaveCount(1);await expect(page.locator('.cost-product-card')).toContainText('5.000');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(branch==='cocteleria')await page.screenshot({path:'test-results/saved-products-mobile.png',fullPage:true});
  await page.locator('[data-approved-delete]').click();await page.locator('#systemMessageDialog [value=accept]').click();await expect(page.locator('.cost-product-card')).toHaveCount(0);await page.locator('[data-tab=recipes]').click();await expect(page.locator('.cost-table')).toContainText('Pan');
  await page.locator('.admin-sidebar [href="#inventory"]').click();await page.locator('#newInventoryProduct').click();
  const moneyFields=page.locator('#inventoryForm [data-currency-input]');
  if(await moneyFields.count()){await moneyFields.first().fill('1234567');await expect(moneyFields.first()).toHaveValue('$1.234.567');}
  expect(errors).toEqual([]);
});

test('el formato visual no redondea datos existentes al editar otro campo',async({page,context})=>{
  await context.setOffline(true);await page.goto(pathToFileURL(resolve('negocios/cocteleria/admin.html')).href+'?demo=1#costing');await expect(page.locator('#costingStatus')).toContainText('Demostración');
  await page.locator('.cost-steps [data-tab=ingredients]').click();let f=page.locator('#costEditor');await f.locator('[name=name]').fill('Compra');await f.locator('[name=quantity]').fill('1');await f.locator('[name=purchasePrice]').fill('1000,50');await expect(f.locator('[name=purchasePrice]')).toHaveValue('$1.001');await f.locator('button[type=submit]').click();
  await page.locator('[data-edit^="ingredients:"]').click();f=page.locator('#costEditor');await expect(f.locator('[name=purchasePrice]')).toHaveValue('$1.001');await f.locator('[name=name]').fill('Compra editada');await f.locator('button[type=submit]').click();
  const value=await page.evaluate(()=>JSON.parse((window as any).OracleDb.local.getItem('costing-saved')).model.ingredients[0].purchasePrice);expect(value).toBe(1000.5);
});
