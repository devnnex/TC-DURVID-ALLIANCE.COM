import {test,expect} from '@playwright/test';

test('el enlace general conserva los negocios y la elección de rol',async({page})=>{
  await page.goto('/index.html');
  await expect(page.locator('a.system-card')).toHaveCount(3);
  await expect(page.locator('.system-future')).toBeVisible();
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
