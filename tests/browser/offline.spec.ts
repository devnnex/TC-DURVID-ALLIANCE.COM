import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
test('portal, regreso a negocios y demostración con el mismo panel operativo',async({page})=>{
  const oracleCalls:string[]=[];page.on('request',r=>{if(r.url().includes('/ords/'))oracleCalls.push(r.url());});
  await page.goto('/index.html');await expect(page.getByRole('link',{name:'CENTRO OPERATIVO'})).toBeVisible();
  await page.getByRole('link',{name:'Ingresar a Jespresso Olivia Coctelería'}).click();await expect(page.getByRole('link',{name:'Volver a negocios',exact:true})).toBeVisible();await page.getByRole('link',{name:'Volver a negocios',exact:true}).click();
  await page.getByRole('link',{name:'CENTRO OPERATIVO'}).click();await page.getByRole('button',{name:'Abrir demostración local'}).click();
  await expect(page.locator('.demo-mode-banner')).toContainText('Demostración local');await expect(page.locator('#metricTables')).toHaveText('24');
  for(const section of ['service','accounts','inventory','movements','income','menu']){await page.locator('.admin-sidebar a[href="#'+section+'"]').click();await expect(page.locator('[data-admin-section="'+section+'"]').first()).toBeVisible();}
  await expect(page.locator('.qr-mini img').first()).toBeVisible({timeout:15000});await page.locator('.admin-sidebar a[href="#inventory"]').click();await expect(page.locator('#inventoryList')).toContainText('Mojito clásico');
  await page.reload();await expect(page.locator('#inventoryList')).toContainText('Mojito clásico');
  await page.locator('.admin-sidebar a[href="#dashboard"]').click();await page.locator('#newWalkInSale').click();await page.locator('#paymentAddItem').click();await page.locator('#consumptionProductSearch').fill('Mojito');await page.locator('#consumptionProductOptions [role="option"]').first().click();await page.locator('#consumptionForm [name="quantity"]').fill('2');await page.locator('#consumptionSubmitButton').click();await expect(page.locator('#paymentDialog')).toBeVisible();await page.locator('#paymentForm [name="cash_received"]').fill('56000');await page.locator('#paymentForm button[value="save"]').click();await expect(page.locator('#paymentDialog')).not.toBeVisible();
  expect(await page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('alliance-operational-demo-v1:cocteleria')!);return {stock:(Object.values(data.stock) as any[]).find(p=>p.name==='Mojito clásico').stock,sales:data.sales.length,total:data.sales[0].totals.total};})).toEqual({stock:18,sales:1,total:56000});
  await page.locator('.admin-sidebar a[href="#users"]').click();await expect(page.getByRole('heading',{name:'Usuarios y accesos',exact:true})).toBeVisible();await expect(page.getByText('Gestiona las personas, sus permisos y el seguimiento desde tu negocio.')).toBeVisible();
  await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click();await expect(page.getByRole('button',{name:'Guardar usuario'})).toBeDisabled();await page.getByRole('button',{name:'Cerrar editor',exact:true}).click();
  await page.locator('.admin-sidebar a[href="#dashboard"]').click();await expect(page.locator('#metricTables')).toHaveText('24');await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/demo-operation-mobile.png',fullPage:true});
  expect(oracleCalls).toEqual([]);
});

test('doble clic del portal abre el panel sin servidor y permite recargar rutas',async({page})=>{
  await page.route('**/ords/**/rpc',route=>{
    const req=route.request().postDataJSON();const data=req.path==='/health'?{ok:true,provider:'oracle-ords'}:req.path==='/installation'?{provider:'oracle-ords',setup_required:true,setup_available:true}:{error:{code:'UNAUTHORIZED',message:'Inicia sesion.'}};
    return route.fulfill({status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'null'},body:JSON.stringify({status:req.path==='/auth/refresh'?401:200,data})});
  });
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await expect(page).toHaveURL(pathToFileURL(resolve('index.html')).href);
  await page.getByRole('link',{name:'CENTRO OPERATIVO'}).click();
  await page.getByRole('link',{name:'Configurar por primera vez'}).click();
  await expect(page).toHaveURL(pathToFileURL(resolve('admin/index.html')).href+'#/setup');
  await page.reload();await expect(page.getByRole('heading',{name:'Tu alianza y sus sucursales.'})).toBeVisible();
  await page.getByRole('link',{name:'Volver al acceso'}).click();
  await page.getByRole('link',{name:'Portal de negocios'}).click();
  await expect(page).toHaveURL(pathToFileURL(resolve('index.html')).href);
});
test('PWA offline → producto → cerrar página → reabrir → sync único',async({page,context,request})=>{
  test.setTimeout(60000);
  const slug='test-'+randomUUID().slice(0,8);const password=randomUUID()+randomUUID();
  await page.goto('/admin/#/setup');await page.getByLabel('Nombre del negocio').fill('Alliance de prueba');await page.getByLabel('Identificador',{exact:true}).first().fill(slug);
  for(let i=1;i<=4;i++)await expect(page.getByLabel(`Nombre de sucursal ${i}`,{exact:true})).toBeVisible();
  await page.getByLabel('Nombre del propietario').fill('Owner prueba');await page.getByLabel('Usuario',{exact:true}).fill('owner');await page.getByLabel('Contraseña · mínimo 12 caracteres').fill(password);await page.getByLabel('Token de instalación').fill(process.env.TEST_SETUP_TOKEN!);await page.getByRole('button',{name:'Crear alianza y sucursales'}).click();await expect(page.getByText('Sucursales y propietario guardados.')).toBeVisible();
  await page.reload();await expect(page.getByText('El negocio ya está configurado.')).toBeVisible();await expect(page.getByRole('button',{name:'Crear alianza y sucursales'})).toHaveCount(0);
  await page.goto('/admin/');await page.locator('input[name=business]').evaluate((input,value)=>{(input as HTMLInputElement).value=value;},slug);await page.getByLabel('Usuario',{exact:true}).fill('owner');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar a mi espacio'}).click();
  await expect(page.getByRole('heading',{name:'Un día bien organizado.'})).toBeVisible();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.waitForFunction(async()=>{const dbs=await indexedDB.databases();return dbs.some(d=>d.name?.startsWith('tc-alliance-v1-'));});
  await expect(page.getByText('Necesitas descargar el catálogo')).toHaveCount(0);await page.waitForTimeout(500);
  await context.setOffline(true);await page.getByRole('link',{name:'Catálogo',exact:false}).first().click();await page.getByRole('button',{name:'Nuevo producto'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Producto offline');await page.getByLabel('Referencia',{exact:true}).fill('OFF-001');await page.getByLabel('Categoría',{exact:true}).fill('Prueba');await page.getByLabel('Precio de venta · COP').fill('25000');await page.getByRole('button',{name:'Guardar producto'}).click();await expect(page.getByRole('heading',{name:'Producto offline'})).toBeVisible();
  await page.close();const reopened=await context.newPage();await reopened.goto('/admin/#/catalogo');await expect(reopened.getByRole('heading',{name:'Producto offline'})).toBeVisible();await expect(reopened.getByText('Guardado local')).toBeVisible();
  await context.setOffline(false);await expect(reopened.getByText('Confirmado',{exact:true})).toBeVisible({timeout:20000});await reopened.getByRole('link',{name:'Actividad',exact:false}).first().click();await expect(reopened.getByText('Cambio de producto',{exact:true})).toHaveCount(1);
  await reopened.reload();await expect(reopened.getByText('Confirmado',{exact:true})).toHaveCount(1);
  // Administration is exercised with the same isolated API after offline sync.
  await reopened.getByRole('link',{name:'Administración',exact:true}).click();await reopened.getByRole('button',{name:'Nueva sucursal',exact:true}).click();
  await reopened.getByLabel('Nombre',{exact:true}).fill('Sucursal Norte');await reopened.getByLabel('Identificador').fill('norte');await reopened.getByRole('button',{name:'Guardar sucursal'}).click();await expect(reopened.locator('.admin-list').getByText('Sucursal Norte',{exact:true})).toBeVisible();
  await reopened.getByRole('button',{name:'Usuarios y permisos'}).click();await reopened.getByRole('button',{name:'Nuevo usuario',exact:true}).click();
  await reopened.getByLabel('Nombre completo').fill('Ana de prueba');await reopened.getByLabel('Usuario',{exact:true}).fill('ana');await reopened.getByLabel('Contraseña · mínimo 12 caracteres').fill(password);
  await reopened.getByLabel('Sucursal Norte',{exact:true}).check();await reopened.getByLabel('Actividad del dispositivo en Sucursal Norte').selectOption('DENY');await reopened.getByRole('button',{name:'Guardar usuario'}).click();await expect(reopened.getByText('Ana de prueba',{exact:true})).toBeVisible();
  await reopened.setViewportSize({width:390,height:844});expect(await reopened.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await reopened.screenshot({path:'test-results/administration-mobile.png',fullPage:true});
  await reopened.getByRole('button',{name:'Menú de usuario'}).click();await reopened.getByRole('button',{name:'Cerrar sesión'}).last().click();
  await reopened.locator('input[name=business]').evaluate((input,value)=>{(input as HTMLInputElement).value=value;},slug);await reopened.getByLabel('Usuario',{exact:true}).fill('ana');await reopened.getByLabel('Contraseña',{exact:true}).fill(password);await reopened.getByRole('button',{name:'Entrar a mi espacio'}).click();
  await expect(reopened.getByRole('heading',{name:'Un día bien organizado.'})).toBeVisible();await expect(reopened.getByLabel('Sucursal').locator('option')).toHaveCount(1);await expect(reopened.getByLabel('Sucursal').locator('option')).toHaveText('Sucursal Norte');
  await expect(reopened.getByRole('link',{name:'Administración',exact:true})).toHaveCount(0);await expect(reopened.getByRole('link',{name:'Actividad',exact:false})).toHaveCount(0);
  await reopened.goto('/admin/#/administracion');await expect(reopened.getByRole('heading',{name:'Sección sin acceso'})).toBeVisible();await reopened.goto('/admin/#/actividad');await expect(reopened.getByRole('heading',{name:'Sección sin acceso'})).toBeVisible();
  const ownerLogin=await request.post('/api/v1/auth/login',{data:{business_slug:slug,username:'owner',password}});expect(ownerLogin.ok()).toBe(true);const ownerAuth={authorization:`Bearer ${(await ownerLogin.json()).access_token}`};
  const overview=await request.get('/api/v1/admin/overview',{headers:ownerAuth});const ana=(await overview.json()).users.find((u:any)=>u.username==='ana');
  const suspended=await request.put(`/api/v1/admin/users/${ana.id}`,{headers:ownerAuth,data:{name:ana.name,username:ana.username,active:false,access:ana.access}});expect(suspended.ok()).toBe(true);
  await expect(reopened.getByRole('button',{name:'Entrar a mi espacio'})).toBeVisible({timeout:15000});
});
