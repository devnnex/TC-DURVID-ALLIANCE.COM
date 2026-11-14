import {test,expect} from '@playwright/test';
import {backend,ready,branch,user,product} from './helpers/operational-backend';
import {roleTemplates,sections} from '../../packages/shared/administration';
for(const slug of ['cocteleria','cafeteria'])test(slug+': resumen consulta cobros nuevos y distingue ventas de una mesa reutilizada',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const server=await backend(page),at=new Date(Date.now()-1000).toISOString();
 server.context.locations[0].slug=slug;
 server.state.docs.service_requests=[{id:'order-one',actor_user_id:'waiter',actor_name:'Mesera de prueba',created_at:at,request_type:'order',status:'resolved',session_id:'account-one',table_id:'table-0'}];
 server.state.docs.session_items=[{id:'line-one',order_id:'order-one',session_id:'account-one',quantity:1,unit_price:10000,status:'served'}];
 let reads=0;
 await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
   const r=route.request().postDataJSON();if(r.path==='/pos'&&r.body.action==='operations_snapshot')reads++;
   if(r.path!=='/admin/overview'){await route.fallback();return;}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data:{locations:server.context.locations,users:[{id:user,name:'Jefe',username:'tester',active:true,protected:true,access:[]},{id:'waiter',name:'Mesera de prueba',username:'mesera',active:true,protected:false,access:[{location_id:branch,roles:['WAITER'],overrides:[]}]}],roles:roleTemplates,sections}})});
 });
 await ready(page,'',slug);
 expect(await page.evaluate(async()=>((await(window as any).OracleDb.remote('operations_snapshot')).sales||[]).length)).toBe(0);
 // Another device takes payment after this browser downloaded its local snapshot.
 server.state.sales=[{id:'sale-one',sessionId:'account-one',createdAt:at,number:'TN-TEST-ONE',waiterName:'Cajera',totals:{subtotal:10000,total:11000,tip:1000},payments:[{method:'cash',amount:11000}],items:[{id:'line-one',quantity:1,unit_price:10000}]}];
 const before=reads;await page.locator('.admin-sidebar [href="#users"]').click();
 const panel=page.locator('.waiter-performance'),waiter=panel.locator('.waiter-performance-card').filter({hasText:'Mesera de prueba'});
 await expect(waiter.locator('.waiter-performance-amount')).toContainText('10.000');await expect.poll(()=>reads).toBeGreaterThan(before);
 await waiter.locator('summary').click();await waiter.getByRole('button',{name:'Ver desglose',exact:true}).click();
 await expect(waiter.locator('.waiter-order-heading')).toHaveText('MESA 1Venta TN-TEST-ONE');await expect(waiter.locator('.waiter-sale-reference')).toHaveAttribute('title','Identificador de venta: sale-one');
 await expect(waiter.locator('.waiter-person-tips')).toContainText('1.000');await expect(waiter.locator('.waiter-rating-label')).toContainText('1 de 1 cobradas');
 // Late events from the old cache must not erase a freshly confirmed payment.
 await page.evaluate(async()=>{const w=window as any,detail=await w.OracleDb.remote('operations_snapshot');detail.at='2026-01-01T00:00:00Z';detail.sales=[];document.dispatchEvent(new CustomEvent('alliance-operations-updated',{detail}));});
 await expect(waiter.locator('.waiter-performance-amount')).toContainText('10.000');
 // Even the transport's one-second read cache must not mask a subsequent payment.
 await page.evaluate(()=>(window as any).OracleDb.networkPos('operations_snapshot',{},undefined,{fresh:true}));
 server.state.docs.service_requests.push({id:'order-two',actor_user_id:'waiter',actor_name:'Mesera de prueba',created_at:at,request_type:'order',status:'resolved',session_id:'account-two',table_id:'table-0'});
 server.state.docs.session_items.push({id:'line-two',order_id:'order-two',session_id:'account-two',quantity:2,unit_price:10000,status:'served'});
 server.state.sales.push({id:'sale-two',sessionId:'account-two',createdAt:at,number:'TN-TEST-TWO',waiterName:'Otra cajera',totals:{subtotal:20000,total:22000,tip:2000},payments:[{method:'transfer',amount:22000}],items:[{id:'line-two',quantity:2,unit_price:10000}]});
 await panel.getByRole('button',{name:'Actualizar rendimiento'}).click();
 await expect(waiter.locator('.waiter-performance-amount')).toContainText('30.000');await expect(waiter.locator('.waiter-person-tips')).toContainText('3.000');await expect(waiter.locator('.waiter-rating-label')).toContainText('2 de 2 cobradas');
 await expect(waiter.locator('.waiter-sale-reference')).toHaveText(['Venta TN-TEST-ONE','Venta TN-TEST-TWO']);
 await expect(waiter.locator('.waiter-order-heading>b')).toHaveText(['MESA 1','MESA 1']);
 await context.setOffline(true);await panel.getByRole('button',{name:'Actualizar rendimiento'}).click();await expect(waiter.locator('.waiter-performance-amount')).toContainText('30.000');await context.setOffline(false);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.screenshot({path:'test-results/waiter-sale-references-'+slug+'.png',fullPage:true});expect(errors).toEqual([]);
});
