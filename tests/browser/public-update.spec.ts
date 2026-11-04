import {test,expect} from '@playwright/test';import {createServer} from 'node:http';import {readFileSync} from 'node:fs';import type {AddressInfo} from 'node:net';

test('una recarga obtiene la publicación nueva desde la caché anterior y conserva el acceso sin conexión',async({page,context})=>{
  test.setTimeout(60000);let release=1;
  const oldWorker=readFileSync('tests/browser/fixtures/public-worker-v1.js','utf8'),newWorker=readFileSync('service-worker.js','utf8');
  const worker=(source:string)=>source.replace(/const BUILD_VERSION='[^']*';/,"const BUILD_VERSION='test-"+release+"';").replace(/const DEVELOPMENT=[^;]+;/,'const DEVELOPMENT=false;').replace(/const PUBLIC_ASSETS=\[[\s\S]*?;\s*for\(const branch [\s\S]*?PUBLIC_ASSETS\.push\([^;]*;/,"const PUBLIC_ASSETS=['index.html','shell.js','style.css'];");
  const server=createServer((req,res)=>{
    const url=new URL(req.url||'/','http://localhost');res.setHeader('Cache-Control',url.pathname==='/service-worker.js'?'no-cache':'public, max-age=31536000');
    if(url.pathname==='/service-worker.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(worker(release===1?oldWorker:newWorker));}
    else if(url.pathname==='/shell.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end('window.release='+release+';document.querySelector("output").textContent="Versión '+release+'";');}
    else if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end('body{color:rgb('+release+',0,0)}');}
    else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head>'+(release===1?'':'<meta name="alliance-build" content="test-'+release+'">')+'<link rel="stylesheet" href="style.css?v='+release+'"></head><body><output></output><script src="shell.js?v='+release+'"></script><script>navigator.serviceWorker.register("service-worker.js",{updateViaCache:"none"}).then(r=>r.update());</script></body></html>');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  try{
    await page.goto(root+'/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await expect(page.locator('output')).toHaveText('Versión 1');
    release=2;await page.reload();await expect(page.locator('output')).toHaveText('Versión 2',{timeout:20000});await expect.poll(()=>page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state;})).toBe('activated');
    release=3;await page.reload();await expect(page.locator('output')).toHaveText('Versión 3');await expect(page.locator('body')).toHaveCSS('color','rgb(3, 0, 0)');
    await expect.poll(()=>page.evaluate(async()=>{const names=await caches.keys();return names.some(n=>n.endsWith('test-3'));}),{timeout:20000}).toBe(true);
    await context.setOffline(true);await page.reload();await expect(page.locator('output')).toHaveText('Versión 3');await expect(page.locator('body')).toHaveCSS('color','rgb(3, 0, 0)');
  }finally{await context.setOffline(false);await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
