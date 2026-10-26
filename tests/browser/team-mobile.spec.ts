import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

async function noOverflow(page:import('@playwright/test').Page){
  const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('.admin-sidebar,.cost-table-wrap');}).slice(0,8).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right])}));
  expect(result.scroll,JSON.stringify(result)).toBeLessThanOrEqual(result.width+1);
}
test('portal e instalación empiezan en la elección de negocios, sin recortes móviles',async({page})=>{
  await page.goto('/index.html');const manifest=await page.locator('link[rel=manifest]').getAttribute('href');expect(manifest).toBe('manifest.webmanifest');
  const data=await (await page.request.get('/manifest.webmanifest')).json();expect(data.start_url).toBe('./index.html');expect(data.scope).toBe('./');
  for(const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:844,height:390}]){await page.setViewportSize(size);await noOverflow(page);await expect(page.getByRole('link',{name:'CENTRO OPERATIVO'})).toBeVisible();}
  await page.screenshot({path:'test-results/portal-responsive.png',fullPage:true});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.context().setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Cada negocio, una experiencia.'})).toBeVisible();await page.goto('/negocios/cocteleria/admin.html?demo=1');await expect(page.locator('#metricTables')).toHaveText('24');
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href',/pwa-manifest.webmanifest/);
  const branchManifest=await page.evaluate(async()=>{const url=document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href;const response=await fetch(url);return {status:response.status,data:await response.json()};});
  expect(branchManifest.status).toBe(200);expect(branchManifest.data.name).toContain('Coctelería');await page.context().setOffline(false);
});

for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal'])test('todas las secciones y el centro operativo en móvil: '+branch,async({page,context})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await context.setOffline(true);
  await page.setViewportSize({width:320,height:568});await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href);await expect(page.locator('#adminLogin')).toBeVisible();await noOverflow(page);
  await page.goto(pathToFileURL(resolve(`negocios/${branch}/admin.html`)).href+`?demo=1&branch=${branch==='sucursal'?'cocteleria':branch}`);await expect(page.locator('#metricTables')).toHaveText('24');
  for(const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:844,height:390}]){
    await page.setViewportSize(size);for(const section of ['dashboard','service','accounts','inventory','costing','movements','income','menu','brand']){await page.locator('.admin-sidebar a[href="#'+section+'"]').click();await expect(page.locator('[data-admin-section="'+section+'"]').first()).toBeVisible();if(section==='costing')await expect(page.locator('#costingStatus')).toContainText('Demostración');await noOverflow(page);}
  }
  await page.locator('.admin-sidebar [href="#users"]').click();await expect(page.getByRole('heading',{name:'Usuarios y meseros',exact:true})).toBeVisible();
  for(const size of [{width:1440,height:1000},{width:320,height:568},{width:390,height:844},{width:768,height:1024}]){
    await page.setViewportSize(size);await noOverflow(page);await page.getByRole('button',{name:'Nuevo usuario con permisos por sucursal',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page);await page.getByRole('dialog').getByLabel('Nombre completo',{exact:true}).fill('Una persona del equipo');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.getByRole('button',{name:'Seguimiento',exact:true})).toHaveCount(0);await expect(page.locator('.team-role-guide')).toContainText('Trabajador');await noOverflow(page);
  if(branch==='cocteleria'){await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Usuarios y permisos'}).click();await page.screenshot({path:'test-results/users-premium-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/users-premium-mobile.png',fullPage:true});}
  expect(errors).toEqual([]);
});
