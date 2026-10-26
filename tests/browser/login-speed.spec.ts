import {test,expect} from '@playwright/test';

test('ingreso responde al clic, usa la vista autorizada de Oracle y salir no espera la red',async({page})=>{
  await page.route('**/api-config.js*',route=>route.fulfill({contentType:'application/javascript',body:"window.ALLIANCE_CONFIG={API_URL:'https://example.oraclecloudapps.com/ords/admin/alliance/api/v1'};"}));
  const branchId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
  const initial={business:{business_name:'Sucursal de prueba',subtitle:'Prueba de velocidad',accent_color:'#a47a47',currency:'COP'},tables:Array.from({length:24},(_,i)=>({id:'table-'+i,name:'M'+(i+1),sort_order:i,is_active:true})),categories:[],items:[]};
  const permissions=['home.read','service.read','service.write','accounts.read','sales.read','inventory.read','products.read','products.write','movements.read','tables.manage','brand.manage','administration.manage'];
  const context={user:{id:userId,business_id:'33333333-3333-4333-8333-333333333333',business_slug:'tc-alliance',name:'Prueba de acceso',username:'tester'},locations:[{id:branchId,slug:'cocteleria',name:'Coctelería',active:true}],permissions:{[branchId]:permissions},is_owner:true};
  let bootstrapRequests=0,authenticatedAt=0,logoutStarted=false,releaseLogout!:()=>void;const exitGate=new Promise<void>(resolve=>releaseLogout=resolve);
  await page.route('**/ords/**',async route=>{
    const body=route.request().postDataJSON();let data:any={ok:true};let status=200;
    if(body.path==='/auth/login/challenge'){status=404;data={error:{message:'Legacy test transport'}};}
    else if(body.path==='/auth/login'){await new Promise(resolve=>setTimeout(resolve,800));authenticatedAt=Date.now();data={access_token:'a'.repeat(64),refresh_token:'b'.repeat(64),provider:'oracle-ords',context,bootstrap:initial};}
    else if(body.path==='/auth/logout'){logoutStarted=true;await exitGate;}
    else if(body.path==='/auth/refresh'){status=401;data={error:{message:'Inicia sesión'}};}
    else if(body.path==='/pos'){
      const action=body.body.action;
      if(action==='bootstrap'){bootstrapRequests++;data={value:initial};}
      else if(action==='query')data={value:[]};
      else if(action==='getAdminSnapshot')data={value:{sessions:[],requests:[],sessionItems:[]}};
      else if(action==='getEvents')data={value:{events:[]}};
      else data={value:{items:[],movements:[],sales:[],syncedAt:new Date().toISOString(),ok:true}};
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify({status,data})});
  });
  await page.goto('/negocios/cocteleria/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');
  const pressed=Date.now();await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#loginForm button[type=submit]')).toBeDisabled();expect(Date.now()-pressed).toBeLessThan(500);await expect(page.locator('#metricTables')).toHaveText('24');expect(Date.now()-authenticatedAt).toBeLessThan(1000);expect(bootstrapRequests).toBe(0);
  const started=Date.now();await page.locator('#logoutButton').click();await expect(page.locator('#adminLogin')).toBeVisible();expect(Date.now()-started).toBeLessThan(1500);expect(logoutStarted).toBe(true);expect(await page.evaluate(()=>sessionStorage.getItem('alliance-ords-refresh'))).toBeNull();releaseLogout();
});
