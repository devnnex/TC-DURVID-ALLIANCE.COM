// Exercises the actual forms and Oracle writes in a temporary business only.
import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {executeSql} from './ords-sql.js';
import {exerciseCostingForms} from '../tests/browser/helpers/costing-flow.js';

const business=randomUUID(),owner=randomUUID(),slug='cost-forms-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const salt=randomBytes(16).toString('hex'),hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
const branches=['cocteleria','cafeteria','gcobarf','sucursal'].map(name=>({name,id:randomUUID()}));
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  await executeSql(`BEGIN INSERT INTO businesses(id,slug,name)VALUES('${business}','${slug}','Prueba aislada de formularios');INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES('${owner}','${business}','owner','Prueba de costeo','${hash}');${branches.map(b=>`INSERT INTO locations(id,business_id,slug,name,color)VALUES('${b.id}','${business}','${b.name}','${b.name}','#a47a47');INSERT INTO user_location_roles VALUES('${business}','${owner}','${b.id}','OWNER');`).join('')}COMMIT;END;`);
  browser=await chromium.launch({channel:'chrome'});
  for(const branch of branches){
    const context=await browser.newContext(),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(pathToFileURL(resolve(`negocios/${branch.name}/admin.html`)).href+(branch.name==='sucursal'?'?branch=sucursal':''));
      await page.evaluate(testSlug=>{(window as any).ALLIANCE_CONFIG.BUSINESS_SLUG=testSlug;(document.querySelector('#loginForm [name=business]') as HTMLInputElement).value=testSlug;},slug);
      await page.locator('#loginForm [name=username]').fill('owner');await page.locator('#loginForm [name=pin]').fill(password);await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24',{timeout:45000});
      await page.locator('.admin-sidebar a[href="#costing"]').click();await expect(page.locator('#costingStatus')).toHaveText('Datos confirmados en Oracle.',{timeout:30000});
      await exerciseCostingForms(page);expect(errors).toEqual([]);
      const saved=await page.evaluate(async()=>(window as any).OracleDb.remote('costing_load'));expect(saved.model.recipes[0].currentPrice).toBe(50000);expect(saved.model.recipes[0].targetPercent).toBe(40);expect(saved.model.expenses).toHaveLength(1);expect(saved.history).toHaveLength(0);
      expect(saved.approved).toHaveLength(0);
      await expect(page.locator('[data-approve]')).toBeDisabled();
      await page.locator('[data-use-price]').click();await expect(page.locator('[data-approve]')).toBeEnabled();
      await page.locator('[data-approve]').click();await expect(page.locator('.cost-product-card')).toHaveCount(1,{timeout:30000});
      await expect(page.locator('.cost-product-card')).toContainText('Meta alcanzada');
      const history=await page.evaluate(async()=>(window as any).OracleDb.remote('costing_load'));
      expect(history.approved).toHaveLength(1);expect(history.approved[0].actualPercent).toBeGreaterThanOrEqual(40);
      await page.locator('[data-approved-open]').click();
      await expect(page.locator('[name=livePrice]')).toHaveValue('$'+history.approved[0].price.toLocaleString('es-CO'));
      await page.locator('[data-current]').click();expect(errors).toEqual([]);
      console.log(branch.name+': formularios y ficha aprobada en Oracle comprobados.');
    }finally{await context.close();}
  }
}finally{
  await browser?.close();
  await executeSql(`BEGIN FOR x IN(SELECT id FROM businesses WHERE id='${business}' AND slug='${slug}') LOOP DELETE FROM alliance_pos_receipts WHERE business_id=x.id;DELETE FROM alliance_pos_sales WHERE business_id=x.id;DELETE FROM alliance_pos_movements WHERE business_id=x.id;DELETE FROM alliance_pos_stock WHERE business_id=x.id;DELETE FROM alliance_pos_documents WHERE business_id=x.id;DELETE FROM alliance_activity_events WHERE business_id=x.id;DELETE FROM administration_audit WHERE business_id=x.id;DELETE FROM alliance_api_sessions WHERE business_id=x.id;DELETE FROM user_location_permissions WHERE business_id=x.id;DELETE FROM user_location_roles WHERE business_id=x.id;DELETE FROM products WHERE business_id=x.id;DELETE FROM product_categories WHERE business_id=x.id;DELETE FROM locations WHERE business_id=x.id;DELETE FROM users WHERE business_id=x.id;DELETE FROM businesses WHERE id=x.id;END LOOP;COMMIT;END;`);
  console.log('Se retiraron exclusivamente los datos de la prueba aislada; los negocios y el administrador del usuario se conservaron.');
}
