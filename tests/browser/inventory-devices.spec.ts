import {test,expect,type Page} from '@playwright/test';
import {backend,product,branch as branchId} from './helpers/operational-backend';

async function enter(page:Page,branch:string){
  await page.goto(`/negocios/${branch}/admin.html?branch=${branch}`);
  await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');
  await page.locator('#loginForm button[type=submit]').click();await expect(page.locator('#metricTables')).toHaveText('24');
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
  await page.locator('.admin-sidebar [href="#inventory"]').click();
}

for(const branch of ['cocteleria','cafeteria','gcobarf','sucursal'])test(`inventario y macro entre equipos, con permiso de consulta · ${branch}`,async({page,browser})=>{
  test.setTimeout(90000);const server=await backend(page);server.context.locations[0].slug=branch;
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
  await enter(page,branch);
  server.context.is_owner=false;server.context.user.id='66666666-6666-4666-8666-666666666666';server.context.user.username='reader';
  server.context.permissions[branchId]=['home.read','products.read','inventory.read','movements.read'];
  const reader=await browser.newContext();try{
    await server.attach(reader);const other=await reader.newPage();await enter(other,branch);
    await other.locator('[data-material-view=macro]').click();await expect(other.locator('[data-material-card]')).toHaveCount(0);
    let releaseHistory!:()=>void;const historyGate=new Promise<void>(resolve=>releaseHistory=resolve);
    await other.route('**/rpc',async route=>{
      const body=route.request().postDataJSON();if(body.path==='/pos'&&body.body?.action==='get_inventory_movements')await historyGate;
      await route.fallback();
    });
    try{
      await page.locator('[data-material-view=macro]').click();await page.locator('[data-material-action=new]').click();
      await page.locator('#materialsDialog [name=name]').fill('Insumo compartido');await page.locator('#materialsDialog [name=unit]').selectOption('g');
      await page.locator('#materialsDialog [name=quantity]').fill('1000');await page.locator('#materialsDialog button[type=submit]').click();
      await expect(page.locator('#materialsDialog')).toBeHidden();
      await expect.poll(()=>server.state.operations.ingredients.length).toBe(1);
      const raw=server.state.operations.ingredients[0];
      await other.locator('[data-material-refresh]').click();
      const card=other.locator('[data-material-card]');
      await expect(card).toContainText('Insumo compartido',{timeout:8000});
      await expect(card.locator('.material-balance strong')).toHaveText('1.000');
      await expect(other.locator('[data-material-action=new]')).toBeDisabled();
      // A sale or stock change on another device must arrive while history is still delayed.
      raw.quantity=600;raw.revision++;server.state.stock[product].stock=1234;
      server.state.docs.menu_items.push({id:'later',name:'Producto del otro equipo',category_id:'category',price:5000,is_available:true});
      server.state.stock.later={productId:'later',name:'Producto del otro equipo',code:'POE',stock:8,costPrice:1000,salePrice:5000,minStock:0,isAvailable:true,version:1};
      await other.locator('[data-material-refresh]').click();
      await expect(card.locator('.material-balance strong')).toHaveText('600',{timeout:8000});
      if(branch!=='gcobarf'){
        await other.locator('[data-material-view=products]').click();
        await expect(other.locator('#inventoryList')).toContainText('Producto del otro equipo');
        await expect(other.locator('#inventoryList')).toContainText('1.234');
      }
    }finally{releaseHistory();}
    await other.reload();await expect(other.locator('#metricTables')).toHaveText('24');
    await other.locator('[data-material-view=macro]').click();await expect(other.locator('.material-balance strong')).toHaveText('600');
  }finally{await reader.close();}
});
