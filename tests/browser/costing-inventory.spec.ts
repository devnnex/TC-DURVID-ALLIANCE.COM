import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { backend, ready } from './helpers/operational-backend';

const model = () => ({
  settings: { monthlyUnits: null, monthlyMinutes: null, taxRate: 0, taxMode: 'included' },
  ingredients: [{ id: 'flour', name: 'Harina', unit: 'kg', quantity: 1, purchasePrice: 10000, yieldPercent: 100, purchaseTaxRate: 0, recoverableTax: false }],
  expenses: [], channels: [{ id: 'salon', name: 'Salón', salesPercent: 0, paymentPercent: 0, flatFee: 0, feeBase: 'net' }],
  recipes: [{ id: 'pizza', name: 'Pizza', size: 'Grande', category: 'Pizza', output: 1, wastePercent: 0, minutes: null, monthlyUnits: null, currentPrice: 5000, targetPercent: 50, marginMode: 'margin', channelId: 'salon', lines: [{ ingredientId: 'flour', quantity: 200, unit: 'g' }] }]
});
async function seedCosting(page: Page, value = model()) {
  await expect(page.locator('#costingReload')).toBeEnabled();
  await page.evaluate(value => (window as any).OracleDb.local.setItem('costing-saved', JSON.stringify({ model: value, revision: 1, approved: [] })), value);
  await page.locator('#costingReload').click();
  await page.locator('.cost-steps [data-tab=production]').click();
}
async function openDemo(page: Page, branch = 'cocteleria', value = model()) {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href + `?demo=1&branch=${branch}#costing`);
  await seedCosting(page, value);
}
const inventory = (page: Page) => page.locator('#inventoryForm');

for (const branch of ['cocteleria', 'cafeteria', 'gcobarf', 'sucursal']) test(`costeo a inventario, historial y sin duplicados: ${branch}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openDemo(page, branch);
  await page.locator('[data-costing-inventory]').click();
  const form = inventory(page);
  await expect(page.locator('#inventoryDialog')).toBeVisible();
  await expect(form.locator('[name=product_name]')).toHaveValue('Pizza Grande');
  await expect(form.locator('[name=product_code]')).toHaveValue('PG');
  await expect(form.locator('[name=new_category]')).toHaveValue('Pizza');
  await expect(form.locator('[name=cost_price]')).toHaveValue('$2.000');
  await expect(form.locator('[name=sale_price]')).toHaveValue('$5.000');
  await form.locator('[aria-label="Editar precio de venta"]').click();await form.locator('[aria-label="Precio de venta desde costeo"]').fill('7000');await expect(form.locator('[name=sale_price]')).toHaveValue('$7.000');await expect(form.locator('#inventoryLiveCalculation')).toContainText(/\$\s*5\.000/);await form.locator('summary').click();await form.locator('[name=sale_price]').fill('5000');await expect(form.locator('[aria-label="Precio de venta desde costeo"]')).toHaveValue('$5.000');await form.locator('summary').click();
  await expect(form.locator('[name=stock]')).toBeEmpty();
  await expect(form.locator('[name=min_stock]')).toBeEmpty();
  // Both quantities must be supplied; zero is allowed. Opening/canceling has no inventory side effect.
  await form.locator('button[type=submit]').click();
  await expect(form.locator('[name=stock]')).toBeFocused();
  await form.locator('[name=stock]').fill('10');
  await form.locator('button[type=submit]').click();
  await expect(form.locator('[name=min_stock]')).toBeFocused();
  await form.locator('[name=min_stock]').fill('5');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (branch === 'cocteleria') await page.screenshot({ path: 'test-results/costing-inventory-mobile.png' });
  await form.locator('button[type=submit]').click();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[data-costing-inventory-note]')).toContainText('ya está en tu inventario');
  await expect(form.locator('[name=stock]')).toHaveValue('10');
  await expect(form.locator('[name=min_stock]')).toHaveValue('5');
  await expect(form.locator('[name=new_category]')).toBeEmpty();
  await expect(form.locator('[name=category_id] option:checked')).toHaveText('Pizza');
  const productId = await form.locator('[name=product_id]').inputValue();
  await form.locator('#cancelInventoryEdit').click();
  // A saved sheet is used for inventory while an unfinished product editor stays in its draft.
  await page.locator('[data-sheet-save]').click();await page.getByRole('button',{name:'Editar producto',exact:true}).click();await page.locator('#costSheetEditor [name=currentPrice]').fill('6000');await page.locator('#costSheetEditor [data-sheet-close]').click();
  await page.locator('.cost-steps [data-tab=history]').click();
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[name=sale_price]')).toHaveValue('$5.000');
  await expect(form.locator('[name=product_id]')).toHaveValue(productId);
  await form.locator('button[type=submit]').dblclick();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  const products = await page.evaluate(async () => {
    const { data } = await (window as any).OracleDb.from('menu_items').select('*');
    return data.filter((p: any) => p.name === 'Pizza Grande');
  });
  expect(products).toHaveLength(1);
  await page.reload(); await expect(page.locator('#costingReload')).toBeEnabled();
  await page.locator('[data-tab=history]').click();
  await page.locator('[data-sheet-open]').click();
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[name=stock]')).toHaveValue('10');
  await form.locator('#cancelInventoryEdit').click();
  await expect(page.locator('#costingExample')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('categoría relacionada, categoría existente y empates sin decisiones arbitrarias', async ({ page }) => {
  await openDemo(page);
  // Create an ordinary inventory product using the normal editor, not the costing shortcut.
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await page.locator('#newInventoryProduct').click();
  const form = inventory(page);
  await form.locator('[name=product_name]').fill('Pizza Hawaiana');
  await form.locator('[name=new_category]').fill('Platos preparados');
  await form.locator('[name=cost_price]').fill('1000');
  await form.locator('[name=sale_price]').fill('5000');
  await form.locator('[name=stock]').fill('5');
  await form.locator('button[type=submit]').click();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  await page.locator('.admin-sidebar [href="#costing"]').click();
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[name=category_id] option:checked')).toHaveText('Platos preparados');
  await expect(form.locator('[name=new_category]')).toBeEmpty();
  await form.locator('#cancelInventoryEdit').click();
  // A declared existing category takes precedence over inferred related products.
  const next = model(); next.recipes[0].category = 'BEBIDAS';
  await seedCosting(page, next);
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[name=category_id] option:checked')).toHaveText('Bebidas');
  await form.locator('#cancelInventoryEdit').click();
  // Same family in two categories is ambiguous: use the declared new category.
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await page.locator('#newInventoryProduct').click();
  await form.locator('[name=product_name]').fill('Pizza Jamón');
  await form.locator('[name=new_category]').fill('Especiales');
  await form.locator('[name=cost_price]').fill('1000');
  await form.locator('[name=sale_price]').fill('5000');
  await form.locator('button[type=submit]').click();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  await page.locator('.admin-sidebar [href="#costing"]').click();
  await seedCosting(page);
  await page.locator('[data-costing-inventory]').click();
  await expect(form.locator('[name=category_id]')).toHaveValue('');
  await expect(form.locator('[name=new_category]')).toHaveValue('Pizza');
});

test('impuesto adicional una sola vez, cálculo incompleto y permisos', async ({ page }) => {
  const next = model(); next.settings.taxRate = 19; next.settings.taxMode = 'added';
  await openDemo(page, 'cocteleria', next);
  await page.locator('[data-costing-inventory]').click();
  await expect(inventory(page).locator('[name=sale_price]')).toHaveValue('$5.950');
  await expect(inventory(page).locator('[name=cost_price]')).toHaveValue('$2.000');
  await inventory(page).locator('[name=stock]').fill('0');
  await inventory(page).locator('[name=min_stock]').fill('0');
  await inventory(page).locator('button[type=submit]').click();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  await page.locator('[name=sheetOutput]').fill('');
  await expect(page.locator('[data-costing-inventory]')).toBeDisabled();
  await page.locator('[name=sheetOutput]').fill('1');
  const denied = await page.evaluate(() => {
    const w = window as any, original = w.OracleDb.permission;
    w.OracleDb.permission = (p: string) => p !== 'inventory.write';
    try { w.App; (window as any).eval('App.openCostedInventory({name:"No autorizado",cost:1,price:2})'); return false; }
    catch { return true; } finally { w.OracleDb.permission = original; }
  });
  expect(denied).toBe(true);
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
});

test('registro autenticado sin conexión conserva una sola alta para sincronizar', async ({ page }) => {
  const server = await backend(page);
  await ready(page);
  await page.context().setOffline(true);
  // The normal authenticated inventory form remains backed by the durable queue.
  await page.evaluate(() => (window as any).eval('App.openCostedInventory({recipeId:"offline-recipe",productName:"Pizza",name:"Pizza Offline",category:"Pizza",cost:2000,price:5000})'));
  const form = inventory(page);
  await form.locator('[name=stock]').fill('8');
  await form.locator('[name=min_stock]').fill('2');
  await form.locator('button[type=submit]').dblclick();
  await expect(page.locator('#inventoryDialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await page.evaluate(() => (window as any).AllianceOffline.flush());
  await expect.poll(() => page.evaluate(() => (window as any).AllianceOffline.status().pending)).toBe(0);
  const products = server.state.docs.menu_items.filter((p: any) => p.name === 'Pizza Offline');
  expect(products).toHaveLength(1);
  const stock = server.state.stock[products[0].id];
  expect(stock).toMatchObject({ stock: 8, minStock: 2, costPrice: 2000, salePrice: 5000 });
});
