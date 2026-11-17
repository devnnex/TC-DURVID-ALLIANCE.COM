import {test,expect} from '@playwright/test';

test('el enlace general conserva los negocios y la elección de rol',async({page})=>{
  await page.goto('/index.html');
  await expect(page.locator('a.system-card')).toHaveCount(3);
  await expect(page.locator('.system-future')).toHaveCount(0);
  await expect(page.locator('.portal-mode')).toBeVisible();
  await page.getByRole('radio',{name:'Mesero · Tomar pedidos'}).check();
  for(const card of await page.locator('a.system-card').all())await expect(card).toHaveAttribute('href',/\/index\.html$/);
  await page.getByRole('radio',{name:'Administrar / atender'}).check();
  for(const card of await page.locator('a.system-card').all())await expect(card).toHaveAttribute('href',/\/admin\.html$/);
});

for(const width of [1440,390])for(const slug of ['gcobarf','cocteleria','cafeteria','nueva-sede'])for(const mode of ['panel','waiter'])test(`acceso asignado centrado: ${slug}, ${mode}, ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`/index.html?branch=${slug}&mode=${mode}&name=${encodeURIComponent('Nueva sede <café>')}`);
  await expect(page.locator('.portal-mode')).toBeHidden();
  await expect(page.locator('.system-card')).toHaveCount(1);
  await expect(page.locator('.system-future')).toHaveCount(0);
  const card=page.locator('a.system-card'),folder=slug==='nueva-sede'?'sucursal':slug;
  await expect(card).toHaveAttribute('href',`negocios/${folder}/${mode==='waiter'?'index':'admin'}.html?branch=${slug}`);
  if(slug==='nueva-sede')await expect(card.locator('.card-content')).toHaveText('Nueva sede <café>');
  const box=await card.boundingBox();expect(box).not.toBeNull();expect(Math.abs(box!.x+box!.width/2-width/2)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/index.html');await expect(page.locator('a.system-card')).toHaveCount(3);await expect(page.locator('.portal-mode')).toBeVisible();
});

test('portada completa sin scroll ni contenido recortado en escritorio, tableta y móvil',async({page})=>{
  test.setTimeout(90000);await page.goto('/index.html');await page.evaluate(()=>document.fonts.ready);
  for(const viewport of [{width:1920,height:900},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:360,height:640},{width:320,height:568},{width:320,height:480},{width:844,height:390},{width:667,height:375},{width:568,height:320},{width:480,height:320}]){
   await page.setViewportSize(viewport);
   for(const mode of ['panel','waiter']){
    await page.locator('[name=portalMode][value='+mode+']').check();
    const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cards:Array.from(document.querySelectorAll<HTMLAnchorElement>('a.system-card')).map(card=>{const box=card.getBoundingClientRect(),parts=['.card-index','.card-content','.card-bottom'].map(q=>card.querySelector(q)!.getBoundingClientRect());return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,overlap:parts[0].bottom>parts[1].top+1||parts[1].bottom>parts[2].top+1,inside:parts.every(p=>p.top>=box.top&&p.bottom<=box.bottom&&p.left>=box.left-1&&p.right<=box.right+1)};})}));
    expect(layout.scrollWidth,JSON.stringify({viewport,mode,layout})).toBeLessThanOrEqual(viewport.width);expect(layout.scrollHeight,JSON.stringify({viewport,mode,layout})).toBeLessThanOrEqual(viewport.height+1);expect(layout.cards).toHaveLength(3);
    for(const card of layout.cards){expect(card.bottom,JSON.stringify({viewport,mode,card})).toBeLessThanOrEqual(viewport.height);expect(card.overlap,JSON.stringify({viewport,mode,card})).toBe(false);expect(card.inside,JSON.stringify({viewport,mode,card})).toBe(true);}
   }
   if([1920,390,320,844].includes(viewport.width))await page.screenshot({path:'test-results/portal-compact-'+viewport.width+'x'+viewport.height+'.png',fullPage:true});
  }
});
