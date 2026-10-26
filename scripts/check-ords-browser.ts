// Read-only checks against the deployed API. Never submits setup or login.
import { chromium,expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root=resolve('dist');
const prefix='/TC-DURVID-ALLIANCE';
const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname);
    if(!pathname.startsWith(prefix+'/')){res.writeHead(404).end();return;}
    const target=resolve(root,pathname.slice(prefix.length+1));
    if(!target.startsWith(root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
const port=(server.address() as {port:number}).port;
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try{
  for(const [kind,url] of [
    ['web',`http://127.0.0.1:${port}${prefix}/index.html`],
    ['file',pathToFileURL(resolve('index.html')).href],
  ]){
    const context=await browser.newContext();const page=await context.newPage();
    const failures:string[]=[];
    page.on('pageerror',error=>failures.push(error.message));
    await page.goto(url!);await page.getByRole('link',{name:'CENTRO OPERATIVO'}).click();
    await expect(page.getByText('Conectado a Oracle',{exact:true})).toBeVisible({timeout:30000});
    await page.getByRole('link',{name:'Configurar por primera vez'}).click();
    await expect(page.getByRole('heading',{name:'Tu alianza y sus sucursales.'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Crear alianza y sucursales'})).toBeEnabled({timeout:30000});
    await expect(page.getByLabel('Nombre de sucursal 4',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByText('Conectado a Oracle',{exact:true})).toBeVisible({timeout:30000});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(failures).toEqual([]);
    await page.screenshot({path:`test-results/oracle-${kind}-setup-mobile.png`,fullPage:true});
    await context.close();console.log(`${kind}: Oracle real, formulario inicial, recarga y vista móvil correctos.`);
  }
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
