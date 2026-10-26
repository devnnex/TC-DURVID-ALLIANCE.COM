import {test,expect} from '@playwright/test';
import {backend,ready,sell,product} from './helpers/operational-backend.js';

test('100 ventas offline sobreviven a cerrar la página y se confirman sin duplicar pagos o inventario',async({page,context})=>{
  test.setTimeout(120000);const server=await backend(page);await ready(page);await context.setOffline(true);const before=server.counts().requests;const status=await sell(page,100);expect(status.pending).toBeGreaterThanOrEqual(100);expect(server.state.sales).toHaveLength(0);expect(server.counts().requests).toBe(before);
  const local=await page.evaluate(async()=>{const r=await (window as any).OracleDb.remote('get_inventory');return r.items[0].stock;});expect(local).toBe(4900);
  const url=page.url();await page.close();const next=await context.newPage();const sameServer=server;
  await next.goto(url);await expect(next.locator('#metricTables')).toHaveText('24');await expect.poll(()=>next.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThanOrEqual(100);
  const batchBefore=server.counts().batches;await context.setOffline(false);await next.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>next.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:60000}).toBe(0);expect(server.counts().batches-batchBefore).toBeLessThanOrEqual(7);expect(sameServer.state.sales).toHaveLength(100);expect(sameServer.state.stock[product].stock).toBe(4900);expect(sameServer.state.movements.filter((m:any)=>m.type==='SALIDA_VENTA')).toHaveLength(100);
});

test('ACK perdido: el reintento confirma la misma venta una sola vez',async({page})=>{
  test.setTimeout(60000);const server=await backend(page,{lostAck:true});await ready(page);await sell(page);await expect.poll(()=>server.counts().ackLost).toBe(true);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.sales).toHaveLength(1);expect(server.state.stock[product].stock).toBe(4999);expect(server.counts().retries).toBeGreaterThan(0);
});
test('un conflicto entre equipos queda visible y conserva la venta pendiente',async({page,context})=>{
  const server=await backend(page,{conflict:true});await ready(page);await context.setOffline(true);await sell(page);await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().conflicts)).toBe(1);await page.locator('#operationalSyncNotice button').click();await expect(page.locator('#offlineReviewDialog')).toContainText('Otro equipo vendió');await expect(page.locator('#offlineReviewDialog')).toContainText('Venta y pago');expect(server.state.sales).toHaveLength(0);expect(server.state.stock[product].stock).toBe(5000);expect(await page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);
});


test('entrar sin internet verifica la contraseña local y conserva los pendientes después de salir',async({page,context})=>{
  test.setTimeout(60000);const server=await backend(page);await ready(page);await context.setOffline(true);await sell(page);await page.locator('#logoutButton').click();await expect(page.locator('#adminLogin')).toBeVisible();await expect.poll(()=>page.evaluate(async()=>{const key='credential:'+(window as any).ALLIANCE_CONFIG.API_URL+':tc-alliance:tester';return !!((await (window as any).AllianceOffline.authStore.get(key))?.requireOnlineLogin||localStorage.getItem('alliance-offline-revoked:'+key));})).toBe(true);
  // A navigation can interrupt IndexedDB cleanup; the immediate revocation marker remains authoritative.
  await page.evaluate(async()=>{const w=window as any,key='credential:'+w.ALLIANCE_CONFIG.API_URL+':tc-alliance:tester',profile=await w.AllianceOffline.authStore.get(key);profile.requireOnlineLogin=false;await w.AllianceOffline.authStore.put(profile);});
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('incorrecta');await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#adminLogin')).toBeVisible();await expect(page.locator('#loginForm button[type=submit]')).toBeEnabled();expect(server.state.sales).toHaveLength(0);
  await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#adminLogin')).not.toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('alliance-ords-refresh'))).toBeNull();
  const stored=await page.evaluate(async()=>JSON.stringify(await (window as any).AllianceOffline.authStore.get('credential:'+(window as any).ALLIANCE_CONFIG.API_URL+':tc-alliance:tester')));expect(stored).not.toContain('test-password');expect(stored).not.toContain('b'.repeat(64));
  await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.sales).toHaveLength(1);
});


test('al reconectar descarga también los cambios confirmados desde otro equipo',async({page,context})=>{
 const server=await backend(page);await ready(page);await context.setOffline(true);await sell(page);server.state.stock[product].stock-=7;server.state.docs.menu_items[0].name='Nombre actualizado en otra caja';server.state.docVersions.menu_items[product]++;
 await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(async()=>page.evaluate(async()=>{const r=await (window as any).OracleDb.remote('get_inventory');return r.items[0].stock;}),{timeout:30000}).toBe(4992);const rows=await page.evaluate(async(product)=>await (window as any).OracleDb.from('menu_items').select('*').eq('id',product),product);expect(rows.data[0].name).toBe('Nombre actualizado en otra caja');expect(server.state.sales).toHaveLength(1);
});

test('revisar un conflicto conserva el cambio anterior y vuelve a descargar los datos',async({page,context})=>{
 const server=await backend(page);await ready(page);await context.setOffline(true);await page.evaluate(async(product)=>{await (window as any).OracleDb.from('menu_items').update({name:'Nombre que confirmé yo'}).eq('id',product);},product);server.state.docs.menu_items[0].name='Cambio de otra caja';server.state.docVersions.menu_items[product]=2;await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().conflicts)).toBe(1);await page.locator('#operationalSyncNotice button').click();await page.getByRole('button',{name:'Revisar este registro'}).click();await expect(page.locator('#offlineReviewDialog')).toContainText('Nombre que confirmé yo');await page.getByRole('button',{name:'Confirmar revisión'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.docs.menu_items[0].name).toBe('Nombre que confirmé yo');server.state.stock[product].stock=4321;await page.evaluate(async()=>await (window as any).AllianceOffline.prime(true));await expect.poll(async()=>page.evaluate(async()=>{await (window as any).AllianceOffline.prime(true);return (await (window as any).OracleDb.remote('get_inventory')).items[0].stock;}),{timeout:20000}).toBe(4321);const retained=await page.evaluate(async()=>{const request=indexedDB.open('alliance-operational-v2',1);const db=await new Promise<any>(resolve=>request.onsuccess=()=>resolve(request.result));const list=db.transaction('jobs').objectStore('jobs').getAll();return await new Promise<any[]>(resolve=>list.onsuccess=()=>resolve(list.result));});expect(retained.some(j=>j.status==='superseded'&&j.replacementId)).toBe(true);
});

test('si el wifi sigue conectado pero Oracle no responde, reabre y sigue guardando localmente',async({page})=>{
 test.setTimeout(60000);const server=await backend(page);await ready(page);server.unavailable(true);await page.reload();await expect(page.locator('#metricTables')).toHaveText('24',{timeout:15000});await sell(page);await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);expect(server.state.sales).toHaveLength(0);await expect(page.locator('#operationalSyncNotice')).toContainText('sin conexión');server.unavailable(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.sales).toHaveLength(1);
});


test('una receta cambiada mientras no había internet se revisa antes de descontar otros ingredientes',async({page,context})=>{
 const server=await backend(page);server.state.units.push({id:'g',dimension:'MASS',factor:1});server.state.operations.ingredients.push({id:'flour',name:'Harina',unit:'g',quantity:1000,unitCost:12.5,minStock:0,revision:1});server.state.operations.recipes.push({productId:product,recipeId:'recipe',lines:[{ingredientId:'flour',quantity:100,unit:'g'}]});await ready(page);await context.setOffline(true);await sell(page);server.state.operations.recipes[0].lines[0].quantity=200;await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().conflicts)).toBe(1);expect(server.state.sales).toHaveLength(0);expect(server.state.operations.ingredients[0].quantity).toBe(1000);await page.locator('#operationalSyncNotice button').click();await page.getByRole('button',{name:'Revisar este registro'}).click();await expect(page.locator('#offlineReviewDialog')).toContainText('200 g de Harina');await page.getByRole('button',{name:'Confirmar revisión'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.sales).toHaveLength(1);expect(server.state.operations.ingredients[0].quantity).toBe(800);expect(server.state.sales[0].items[0].unit_cost).toBe(2500);
});


test('el registro local responde sin esperar una confirmación lenta de Oracle',async({page})=>{
 const server=await backend(page,{syncDelay:1200});await ready(page);const started=Date.now();await sell(page);expect(Date.now()-started).toBeLessThan(350);expect(await page.evaluate(()=>(window as any).AllianceOffline.status().pending)).toBeGreaterThan(0);await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);expect(server.state.sales).toHaveLength(1);
});


test('una renovación que termina después de salir no reactiva la cuenta local',async({page})=>{
 await backend(page);await ready(page);
 await page.evaluate(async()=>{
   const w=window as any,store=w.AllianceOffline.authStore,put=store.put.bind(store);let release:any;
   const hold=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>{
     let held=false;store.put=async(profile:any)=>{if(!held&&profile.scope.startsWith('credential:')){held=true;resolve();await hold;}return put(profile);};
   });
   w.releaseCredentialWrite=release;
   w.pendingCredentialWrite=w.AllianceOfflineAuth.cacheSession({context:JSON.parse(localStorage.getItem('tc-alliance-session-view-v1')!).context,refresh_token:'b'.repeat(64)});
   await started;
 });
 await page.evaluate(async()=>await (window as any).OracleDb.rpc('logout'));
 await page.evaluate(async()=>{const w=window as any;w.releaseCredentialWrite();await w.pendingCredentialWrite;});
 await expect.poll(()=>page.evaluate(async()=>{const w=window as any,p=await w.AllianceOffline.authStore.get('credential:'+w.ALLIANCE_CONFIG.API_URL+':tc-alliance:tester');return p?.requireOnlineLogin===true&&!p?.activeWrap&&!w.AllianceOfflineAuth.ready(p.context.user.id);})).toBe(true);
});
