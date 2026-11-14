import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {backend,ready,branch,user} from './helpers/operational-backend';
import {roleTemplates,sections} from '../../packages/shared/administration';
for(const slug of ['cocteleria','cafeteria','gcobarf','sucursal'])test(slug+': eliminar y recrear las mismas credenciales inicia el progreso de cero',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const server=await backend(page);server.context.locations[0].slug=slug;
 const old=randomUUID(),at=new Date(Date.now()-1000).toISOString(),grants=[{location_id:branch,roles:['WAITER'],overrides:{}}];
 const members:any[]=[{id:user,name:'Responsable',username:'tester',active:true,protected:true,access:[]},{id:old,name:'Empleado anterior',username:'misma.cuenta',active:true,protected:false,access:grants}];
 server.state.docs.service_requests=[{id:'historical-order',actor_user_id:old,actor_name:'Empleado anterior',created_at:at,request_type:'order',status:'resolved',session_id:'historical-account',table_id:'table-0'}];
 server.state.docs.session_items=[{id:'historical-line',order_id:'historical-order',session_id:'historical-account',quantity:1,unit_price:10000,status:'served'}];
 server.state.sales=[{id:'historical-sale',sessionId:'historical-account',number:'TN-HISTORICAL',createdAt:at,totals:{subtotal:10000,total:11000,tip:1000},payments:[{method:'cash',amount:11000}],items:[{id:'historical-line',quantity:1,unit_price:10000}]}];
 let removed='',created='';
 await page.route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
   const r=route.request().postDataJSON();let data:any;
   if(r.path==='/admin/overview')data={locations:server.context.locations,users:members,roles:roleTemplates,sections};
   else if(r.path.startsWith('/admin/users/')){expect(r.method).toBe('DELETE');expect(r.location_id).toBe(branch);removed=r.path.split('/').pop();members.splice(members.findIndex(m=>m.id===removed),1);data={ok:true};}
   else if(r.path==='/admin/users'){
     expect(r.method).toBe('POST');expect(r.location_id).toBe(branch);
     if(members.some(m=>m.username===r.body.username)){await route.fulfill({contentType:'application/json',body:JSON.stringify({status:409,data:{error:{message:'Ya existe'}}})});return;}
     created=randomUUID();members.push({...r.body,id:created,protected:false});data={ok:true};
   }else{await route.fallback();return;}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({status:200,data})});
 });
 await ready(page,'',slug);await page.locator('.admin-sidebar [href="#users"]').click();
 await expect(page.locator('.waiter-performance-card').filter({hasText:'Empleado anterior'}).locator('.waiter-performance-amount')).toContainText('10.000');
 await page.getByRole('button',{name:'Retirar acceso de Empleado anterior',exact:true}).click();await page.locator('#systemMessageDialog [value=accept]').click();
 await expect(page.locator('.team-user').filter({hasText:'Empleado anterior'})).toHaveCount(0);expect(removed).toBe(old);
 const form=page.locator('.team-quick-form');await form.locator('[name=name]').fill('Empleado nuevo');await form.locator('[name=username]').fill('misma.cuenta');await form.locator('[name=password]').fill('4826');await form.locator('[name=role]').selectOption('WAITER');await form.getByRole('button',{name:'Guardar usuario',exact:true}).click();
 await expect(page.locator('.team-user').filter({hasText:'Empleado nuevo'})).toHaveCount(1);expect(created).not.toBe(old);
 const report=page.locator('.waiter-performance-card').filter({hasText:'Empleado nuevo'});await expect(report.locator('.waiter-performance-amount')).toContainText(/\$\s*0/);await expect(report.locator('.waiter-person-name')).toContainText('0 comandas · 0 cobradas');await expect(report.locator('.waiter-person-tips')).toContainText(/\$\s*0/);
 await report.locator('summary').click();await expect(report.locator('.waiter-performance-numbers b')).toHaveText(['0','0','0']);
 expect(server.state.sales).toHaveLength(1);expect(server.state.docs.service_requests[0].actor_user_id).toBe(old);expect(server.state.sales[0].id).toBe('historical-sale');
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(errors).toEqual([]);
});
