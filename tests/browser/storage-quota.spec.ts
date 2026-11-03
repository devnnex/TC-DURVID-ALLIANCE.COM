import {test,expect} from '@playwright/test';
import {backend,ready,sell,branch,user,business} from './helpers/operational-backend';
import {roleTemplates,sections} from '../../packages/shared/administration';

function fillStorage(){
  if(localStorage.getItem('quota-fixture-filled'))return;
  localStorage.setItem('quota-fixture-filled','1');
  for(const size of [256*1024,4096,128])for(let index=0;index<2048;index++){
    try{localStorage.setItem(`quota-fixture:${size}:${index}`,'x'.repeat(size));}catch{break;}
  }
}

test('Centro Operativo permite entrar y recargar con la cuota local agotada',async({page})=>{
  const server=await backend(page);let signedIn=false;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rpc',async route=>{
    const request=route.request().postDataJSON();
    if(request.path==='/auth/login')signedIn=true;
    if(request.path==='/auth/refresh'&&!signedIn){await route.fulfill({contentType:'application/json',body:JSON.stringify({status:401,data:{error:{message:'Inicia sesión'}}})});return;}
    if(request.path==='/admin/overview'){await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{locations:server.context.locations,users:[],roles:roleTemplates,sections}})});return;}
    await route.fallback();
  });
  await page.addInitScript(fillStorage);await page.goto('/admin/index.html');
  await page.locator('[name=username]').fill('tester');await page.locator('[name=password]').fill('test-password');
  await page.getByRole('button',{name:'Entrar a mi espacio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Usuarios y accesos',exact:true,level:1})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Usuarios y accesos',exact:true,level:1})).toBeVisible();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.locator('[name=password]')).toBeVisible();
  expect(errors).toEqual([]);
});

for(const slug of ['cocteleria','cafeteria','gcobarf','sucursal'])test(`ingreso, recarga y salida con localStorage lleno · ${slug}`,async({page})=>{
  test.setTimeout(60000);const server=await backend(page);server.context.locations[0].slug=slug;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const protectedKey=`alliance-pos:${business}:${branch}:${user}:form-draft:v1:keep-this-draft`;
  await page.addInitScript(({protectedKey})=>localStorage.setItem(protectedKey,'borrador pendiente que se conserva'),{protectedKey});
  await page.addInitScript(fillStorage);
  await page.goto(`/negocios/${slug}/admin.html?branch=${slug}`);
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');
  await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');
  await expect(page.locator('#adminLogin')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
  expect(await page.evaluate(()=>sessionStorage.getItem('alliance-cache-fallback:tc-alliance-session-view-v1'))).not.toBeNull();
  expect(await page.evaluate(key=>localStorage.getItem(key),protectedKey)).toBe('borrador pendiente que se conserva');
  await page.reload();await expect(page.locator('#metricTables')).toHaveText('24');await expect(page.locator('#adminLogin')).toBeHidden();
  await page.locator('#logoutButton').click();await expect(page.locator('#adminLogin')).toBeVisible();
  await page.reload();await expect(page.locator('#adminLogin')).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),protectedKey)).toBe('borrador pendiente que se conserva');
  expect(errors).toEqual([]);
});

test('la cuota de Web Storage no borra una venta pendiente guardada en IndexedDB',async({page,context})=>{
  test.setTimeout(90000);const server=await backend(page);await ready(page);await context.setOffline(true);await sell(page);
  await page.evaluate(fillStorage);
  await page.locator('#logoutButton').click();await expect(page.locator('#adminLogin')).toBeVisible();
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');
  await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#adminLogin')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);
  await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  expect(server.state.sales).toHaveLength(1);
});
