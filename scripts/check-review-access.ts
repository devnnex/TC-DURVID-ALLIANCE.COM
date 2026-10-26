// Read-only verification of the requested review account; never deletes it.
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import './ords-sql.js'; // Loads the private environment without printing it.
const password=process.env.TEMPORARY_REVIEW_PASSWORD;
if(!password)throw new Error('Falta la contraseña de revisión en .env privado.');
const root=resolve('dist'),prefix='/TC-DURVID-ALLIANCE';
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);if(!pathname.startsWith(prefix+'/'))return res.writeHead(404).end();const target=resolve(root,pathname.slice(prefix.length+1));if(!target.startsWith(root+sep))return res.writeHead(403).end();const data=await readFile(target);const types:Record<string,string>={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const port=(server.address() as {port:number}).port;
const browser=await chromium.launch({channel:'chrome'});await mkdir('test-results',{recursive:true});
try{
  for(const mode of ['web','file']){
    const context=await browser.newContext(),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const base=mode==='web'?`http://127.0.0.1:${port}${prefix}/`:pathToFileURL(resolve('index.html')).href.replace(/index.html$/,'');
    for(const branch of ['gcobarf','cocteleria','cafeteria']){
      await page.goto(base+'negocios/'+branch+'/admin.html');
      await expect(page.locator('body')).not.toHaveClass(/is-loading/,{timeout:30000});
      if(await page.locator('#adminLogin').isVisible()){
        await expect(page.getByRole('link',{name:'Volver a negocios',exact:true})).toBeVisible();
        await page.locator('#loginForm [name="username"]').fill('admin');await page.locator('#loginForm [name="pin"]').fill(password!);await page.locator('#loginForm button[type="submit"]').click();
      }
      await expect(page.locator('#metricTables')).toHaveText('24',{timeout:30000});await expect(page.locator('#currentUserName')).toHaveText('Administrador temporal');
      await page.locator('.admin-sidebar a[href="#costing"]').click();await expect(page.locator('#costingStatus')).toHaveText('Datos confirmados en Oracle.',{timeout:30000});await expect(page.getByRole('heading',{name:'Costo de productos',exact:true})).toBeVisible();
    }
    await page.locator('.admin-sidebar a[href="#users"]').click();
    await expect(page.locator('.splash')).not.toBeVisible({timeout:30000});
    if(await page.locator('.login-card form').isVisible()){await page.locator('.login-card [name="username"]').fill('admin');await page.locator('.login-card [name="password"]').fill(password!);await page.locator('.login-card button[type="submit"]').click();}
    await expect(page.getByRole('heading',{name:'Usuarios y accesos',exact:true})).toBeVisible({timeout:30000});await expect(page.getByRole('button',{name:'Nuevo usuario',exact:true})).toBeVisible();
    expect(errors).toEqual([]);await page.screenshot({path:`test-results/review-admin-${mode}.png`,fullPage:true});await context.close();console.log(`${mode}: cuenta temporal, tres sucursales, regreso y centro operativo verificados.`);
  }
  const context=await browser.newContext();await context.setOffline(true);const page=await context.newPage();let oracleRequests=0;page.on('request',r=>{if(r.url().includes('/ords/'))oracleRequests++;});
  await page.goto(pathToFileURL(resolve('negocios/cocteleria/admin.html')).href+'?demo=1');await expect(page.locator('#metricTables')).toHaveText('24');await page.locator('.admin-sidebar a[href="#inventory"]').click();await expect(page.locator('#inventoryList')).toContainText('Mojito clásico');await page.reload();await expect(page.locator('#inventoryList')).toContainText('Mojito clásico');expect(oracleRequests).toBe(0);await context.close();console.log('Demostración por doble clic sin internet ni llamadas a Oracle verificada.');
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
