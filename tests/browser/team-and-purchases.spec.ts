import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { backend, ready, branch, user, business } from './helpers/operational-backend';
import { roleTemplates, sections } from '../../packages/shared/administration';

test('Usuarios conserva la página y la sesión al crear y editar accesos', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await backend(page);
  const members: any[] = [{ id: user, name: 'Responsable de prueba', username: 'tester', active: true, protected: true, access: [] }];
  const writes: any[] = [];
  const location = { id: branch, business_id: business, slug: 'cocteleria', name: 'Coctelería de prueba', color: '#a47a47', active: true };
  await page.route(/\/api\/v1\/(?:file\/)?rpc$/, async route => {
    const request = route.request().postDataJSON();
    let data: any;
    if (request.path === '/admin/overview') {
      expect(request.method).toBe('GET');
      data = { locations: [location], users: members, roles: roleTemplates, sections };
    } else if (request.path === '/context') {
      data = { user: { id: user, business_id: business, business_slug: 'tc-alliance', username: 'tester', name: 'Responsable de prueba' }, locations: [location], is_owner: true, permissions: { [branch]: ['home.read', 'products.read', 'products.write', 'inventory.read', 'inventory.write', 'administration.manage'] } };
    } else if (request.path === '/admin/users' || request.path.startsWith('/admin/users/')) {
      expect(request.location_id).toBe(branch);
      expect(request.method).toBe(request.path === '/admin/users' ? 'POST' : 'PUT');
      writes.push(request);
      const member = { ...request.body, id: request.path === '/admin/users' ? randomUUID() : request.path.split('/').pop(), protected: false };
      const index = members.findIndex(m => m.id === member.id);
      if (index < 0) members.push(member); else members[index] = member;
      data = { ok: true };
    } else if (request.path === '/admin/activity') data = { items: [], hasMore: false };
    else { await route.fallback(); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 200, data }) });
  });
  await ready(page);
  const path = new URL(page.url()).pathname;
  await page.locator('.admin-sidebar [href="#users"]').click();
  await expect(page.getByRole('heading', { name: 'Usuarios y meseros', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(path);
  expect(new URL(page.url()).hash).toBe('#users');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.team-user')).toHaveCount(1);
  const quick=page.locator('.team-quick-form');await quick.locator('[name=name]').fill('Mesera de prueba');await quick.locator('[name=username]').fill('mesera.prueba');await quick.locator('[name=password]').fill('4826');await quick.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();await expect(quick.locator('[name=password]')).toHaveAttribute('type','text');await expect(quick.locator('[name=password]')).toHaveValue('4826');await quick.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();await quick.locator('[name=role]').selectOption('WAITER');await quick.getByRole('button',{name:'Guardar usuario'}).click();
  let editor=page.getByRole('dialog');
  await expect(page.locator('.team-user')).toHaveCount(2);
  expect(writes[0].body.access[0].location_id).toBe(branch);
  expect(writes[0].body.access[0].roles).toContain('WAITER');
  await page.locator('.team-user').filter({ hasText: 'Mesera de prueba' }).getByRole('button', { name: 'Editar accesos de Mesera de prueba' }).click();
  editor = page.getByRole('dialog');
  await editor.getByLabel('Nombre completo', { exact: true }).fill('Mesera actualizada');await editor.locator('[name=password]').fill('A7b!');await editor.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();await expect(editor.locator('[name=password]')).toHaveAttribute('type','text');await expect(editor.locator('[name=password]')).toHaveValue('A7b!');await editor.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();
  await editor.getByRole('button', { name: 'Guardar usuario' }).click();
  await expect(page.locator('.team-user')).toContainText(['Responsable de prueba', 'Mesera actualizada']);
  await expect(page.getByRole('button', { name: 'Seguimiento', exact: true })).toHaveCount(0);
  await expect(page.locator('.team-role-guide')).toContainText('Trabajador');
  await page.locator('.admin-sidebar [href="#inventory"]').click();
  await expect(page.locator('#inventory')).toBeVisible();
  await page.locator('.admin-sidebar [href="#users"]').click();
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page.locator('.team-role-guide')).toContainText('Jefe');
  await page.getByRole('button',{name:'Usuarios y permisos',exact:true}).click();await page.locator('.team-user').filter({hasText:'Mesera actualizada'}).getByRole('switch').uncheck();await expect(page.locator('.team-user').filter({hasText:'Mesera actualizada'})).toContainText('Acceso pausado');expect(writes[2].body.active).toBe(false);await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/team-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/team-mobile.png',fullPage:true});await page.getByRole('button',{name:'Retirar acceso de Mesera actualizada'}).click();await page.locator('#systemMessageDialog [value=accept]').click();await expect(page.locator('.team-user')).toHaveCount(1);expect(writes[3].body.access).toEqual([]);expect(writes).toHaveLength(4);
  expect(errors).toEqual([]);
});

for (const name of ['cocteleria', 'cafeteria', 'gcobarf', 'sucursal']) test(`compra directa sin proveedor ni insumos: ${name}`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve(`negocios/${name}/admin.html`)).href + `?demo=1&branch=${name}`);
  await expect(page.locator('#metricTables')).toHaveText('24');
  await page.locator('.admin-sidebar [href="#supplies"]').click();
  await page.getByRole('button', {name:'Compras',exact:true}).click();
  await page.getByRole('button',{name:'Agregar compra',exact:true}).click();const form=page.locator('#operationsDialog form[data-command=purchase_record]');
  await expect(form).toBeVisible();
  await expect(form.locator('input:not([type=hidden])')).toHaveCount(3);
  await expect(form.locator('select')).toHaveCount(0);
  await expect(page.locator('#supplies')).not.toContainText('Primero registra');
  await form.getByRole('button',{name:'Guardar compra'}).click();
  await expect(form.locator('[name=name]')).toBeFocused();
  await form.locator('[name=name]').fill('Cerveza');
  await form.locator('[name=quantity]').fill('30');
  await form.locator('[name=total]').fill('62000');
  await expect(form.locator('[name=total]')).toHaveValue('$62.000');
  await expect(form.locator('.op-direct-cost')).toContainText('$2.067');
  await expect(form.locator('.op-direct-cost')).toContainText('peso más cercano');
  await form.locator('[name=quantity]').fill('31');
  await expect(form.locator('.op-direct-cost')).toContainText('$2.000');
  await form.locator('[name=quantity]').fill('0');
  await expect(form.locator('.op-direct-cost')).toContainText('Completa');
  await form.locator('[name=quantity]').fill('30');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(name==='cocteleria')await page.screenshot({path:'test-results/direct-purchase-mobile.png',fullPage:true});
  await form.getByRole('button',{name:'Guardar compra'}).click();await expect(page.locator('#operationsDialog')).toBeHidden();
  const records=page.locator('#supplies .op-records');
  await expect(records.locator('.op-record')).toHaveCount(1);
  await expect(records).toContainText('Cerveza');await expect(records).toContainText('30 unidades');
  await expect(records).toContainText('$62.000');await expect(records).toContainText('$2.067');
  await expect(records).toContainText('Administrador de demostración');
  await expect(records).not.toContainText('Pendiente');
  await expect(page.locator('#supplies .op-tabs button')).toHaveCount(2);
  await page.getByRole('button',{name:'Proveedores',exact:true}).click();await expect(page.locator('#supplies .op-records .op-record')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Compras',exact:true}).click();await expect(page.locator('#supplies .op-records')).toContainText('Cerveza');
  expect(errors).toEqual([]);
});

test('compra directa autenticada sin conexión se confirma una sola vez',async({page,context})=>{
  const server=await backend(page);await ready(page);await context.setOffline(true);
  await page.locator('.admin-sidebar [href="#supplies"]').click();await page.getByRole('button',{name:'Compras',exact:true}).click();
  await page.getByRole('button',{name:'Agregar compra',exact:true}).click();const form=page.locator('#operationsDialog form[data-command=purchase_record]');
  await form.locator('[name=name]').fill('Cerveza');await form.locator('[name=quantity]').fill('30');await form.locator('[name=total]').fill('62000');
  await form.getByRole('button',{name:'Guardar compra'}).click();await expect(page.locator('#operationsDialog')).toBeHidden();
  await expect(page.locator('#supplies .op-records')).toContainText('$2.067');
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);
  expect(server.state.operations.purchases).toHaveLength(0);
  await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBe(0);
  expect(server.state.operations.purchases).toHaveLength(1);
  expect(server.state.operations.purchases[0]).toMatchObject({kind:'simple',name:'Cerveza',quantity:30,total:62000,actorName:'Responsable de prueba'});
  expect(server.state.operations.purchases[0].unitPrice).toBeCloseTo(62000/30,8);
  expect(server.state.operations.suppliers).toHaveLength(0);expect(server.state.operations.ingredients).toHaveLength(0);
});
