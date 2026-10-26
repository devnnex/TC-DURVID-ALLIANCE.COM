import {test,expect} from '@playwright/test';
import {backend,branch,business} from './helpers/operational-backend';
import {roleTemplates,sections} from '../../packages/shared/administration';

for(const slug of ['gcobarf','cocteleria','cafeteria','sucursal'])test('copiar acceso para WhatsApp después de crear y actualizar: '+slug,async({page})=>{
  const server=await backend(page);server.context.locations[0].slug=slug;
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedAccess=text;}}}));
  const members:any[]=[];let reject=false;
  const location={id:branch,business_id:business,slug,name:'Negocio '+slug,active:true,color:'#407dd6'};
  await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
    const r=route.request().postDataJSON();let status=200,data:any;
    if(r.path==='/admin/overview')data={locations:[location],users:members,roles:roleTemplates,sections};
    else if(r.path==='/admin/users'||r.path.startsWith('/admin/users/')){
      if(reject){reject=false;status=409;data={error:{message:'No se guardó el cambio.'}};}
      else{const {password,...member}=r.body,id=r.path==='/admin/users'?crypto.randomUUID():r.path.split('/').pop();const existing=members.find(m=>m.id===id);if(existing)Object.assign(existing,member);else members.push({...member,id,protected:false});data={ok:true};}
    }else{await route.fallback();return;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({status,data})});
  });
  await page.goto('/negocios/'+slug+'/admin.html?branch='+slug);
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm [type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');await page.locator('.admin-sidebar [href="#users"]').click();
  const quick=page.locator('.team-quick-form'),notice=page.locator('.team-save-notice');
  await quick.locator('[name=name]').fill('María de prueba');await quick.locator('[name=username]').fill('María Caja');await quick.locator('[name=password]').fill('4826');await quick.getByRole('button',{name:'Guardar usuario'}).click();
  await notice.getByRole('button',{name:'Copiar acceso y contraseña',exact:true}).click();
  const copied=()=>page.evaluate(()=>(window as any).copiedAccess as string);
  const checkPortal=async(mode:string)=>{
    const link=(await copied()).split('\n').find(line=>line.startsWith('http'))!;
    const url=new URL(link);expect(url.pathname).toBe('/index.html');expect(url.searchParams.get('branch')).toBe(slug);expect(url.searchParams.get('mode')).toBe(mode);expect(url.searchParams.has('password')).toBe(false);
    const recipient=await page.context().newPage();
    try{await recipient.goto(link);await expect(recipient.locator('.portal-mode')).toBeHidden();await expect(recipient.locator('.system-card')).toHaveCount(1);await recipient.locator('a.system-card').click();await expect(recipient).toHaveURL(new RegExp('/negocios/'+slug+'/'+(mode==='waiter'?'index':'admin')+'\\.html\\?branch='+slug));}finally{await recipient.close();}
  };
  const text=await copied();expect(text).toContain('*TC-DURVID');expect(text).toContain('Hola, María de prueba.');expect(text).toContain('*Negocio:* Negocio '+slug);expect(text).toContain('*Usuario:* María Caja');expect(text).toContain('*Contraseña:* 4826');await checkPortal('waiter');
  const card=page.locator('.team-user').filter({hasText:'María de prueba'});await card.getByRole('button',{name:'Copiar acceso',exact:true}).click();expect(await copied()).toBe(text);
  await card.getByRole('button',{name:'Editar accesos de María de prueba'}).click();const editor=page.getByRole('dialog');await editor.locator('[name=username]').fill('María Nueva');await editor.locator('[name=password]').fill('X9b!');reject=true;await editor.getByRole('button',{name:'Guardar usuario'}).click();await expect(editor.getByRole('alert')).toContainText('No se guardó');
  await notice.getByRole('button',{name:/Copiar acceso y contraseña|Copiado/}).evaluate((button:HTMLButtonElement)=>button.click());expect(await copied()).toContain('*Contraseña:* 4826');
  await editor.getByRole('button',{name:'Guardar usuario'}).click();await expect(editor).toBeHidden();await notice.getByRole('button',{name:'Copiar acceso y contraseña'}).click();expect(await copied()).toContain('*Contraseña:* X9b!');expect(await copied()).toContain('*Usuario:* María Nueva');
  await card.getByRole('button',{name:'Editar accesos de María de prueba'}).click();await editor.locator('[name=name]').fill('María actualizada');await editor.getByRole('button',{name:'Guardar usuario'}).click();await expect(editor).toBeHidden();await notice.getByRole('button',{name:'Copiar acceso y contraseña'}).click();expect(await copied()).toContain('*Contraseña:* X9b!');
  await page.reload();await expect(page.locator('.team-user')).toContainText('María actualizada');await page.locator('.team-user').getByRole('button',{name:'Copiar acceso'}).click();expect(await copied()).toContain('usa tu contraseña actual');expect(await copied()).not.toContain('X9b!');
  await page.getByRole('button',{name:'Nuevo usuario con permisos por sucursal'}).click();await editor.locator('[name=name]').fill('Admin nuevo');await editor.locator('[name=username]').fill('admin nuevo');await editor.locator('[name=password]').fill('K7p2');await editor.locator('select').selectOption('BOSS');await editor.getByRole('button',{name:'Guardar usuario'}).click();await expect(editor).toBeHidden();await notice.getByRole('button',{name:'Copiar acceso y contraseña'}).click();expect(await copied()).toContain('*Contraseña:* K7p2');await checkPortal('panel');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
