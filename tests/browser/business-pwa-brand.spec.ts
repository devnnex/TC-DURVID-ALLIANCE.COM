import {test,expect} from '@playwright/test';
import {backend,ready} from './helpers/operational-backend';
for(const [index,slug]of ['cocteleria','cafeteria','gcobarf','sucursal'].entries())test(slug+': la PWA toma el logo del negocio y conserva su identidad',async({page})=>{
 const server=await backend(page);server.context.locations[0].slug=slug;
 const color=index%2?'#1d64bf':'#cd1133';server.state.docs.business_settings[0].logo_url='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="'+color+'"/></svg>').toString('base64');
 await ready(page,'',slug);
 const branded=()=>page.evaluate(async slug=>{const cache=await caches.open('alliance-'+slug+'-pwa-brand-v1'),response=await cache.match(new URL('pwa-manifest.webmanifest',location.href));return response?response.json():null;},slug);
 await expect.poll(branded).toMatchObject({id:'./admin.html',start_url:'./admin.html'});
 const pixel=await page.evaluate(async slug=>{const cache=await caches.open('alliance-'+slug+'-pwa-brand-v1'),res=await cache.match(new URL('pwa-icon-192.png',location.href)),bitmap=await createImageBitmap(await res!.blob()),c=document.createElement('canvas');c.width=c.height=192;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);return [...ctx.getImageData(96,96,1,1).data];},slug);
 expect(pixel).toEqual(index%2?[29,100,191,255]:[205,17,51,255]);
 const corner=await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector<HTMLLinkElement>('#appFavicon')!.href;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,192,192);return [...ctx.getImageData(0,0,1,1).data];});
 expect(corner).toEqual(['cafeteria','cocteleria'].includes(slug)?[0,0,0,255]:[255,255,255,255]);
 if(['cafeteria','cocteleria'].includes(slug)){
  await page.goto('/negocios/'+slug+'/index.html');await expect(page.locator('#waiterApp')).toBeVisible();await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href',/pwa-waiter-manifest/);
  const identity=await page.evaluate(async()=>fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href).then(r=>r.json()));expect(identity.id).toBe('./index.html');expect(identity.start_url).toBe('./index.html');
 }
});
