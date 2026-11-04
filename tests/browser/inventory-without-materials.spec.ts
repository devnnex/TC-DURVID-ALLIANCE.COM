import {test,expect,type Page} from '@playwright/test';
import {backend} from './helpers/operational-backend';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

async function enter(page:Page,slug:string){
  await page.goto('/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.goto('/negocios/'+slug+'/admin.html');await page.locator('#loginForm [name=username]').fill('tester');await page.locator('#loginForm [name=pin]').fill('test-password');await page.locator('#loginForm button[type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().lastSync)).not.toBeNull();
}
for(const slug of ['cafeteria','cocteleria'])test(slug+': abastece según las porciones y los cambios guardados, sin duplicar entradas',async({page,browser,context})=>{
  test.setTimeout(90000);const server=await backend(page,{lostAck:true,lostAckAction:'operations_apply'});server.context.locations[0].slug=slug;
  server.state.units.push({id:'g',name:'Gramos',dimension:'MASS',factor:1});
  server.state.operations.ingredients=[{id:'existing-nachos',name:'NACHOS',unit:'u',quantity:0,unitCost:3000,minStock:0,revision:1}];
  const engine:any={};runInNewContext(readFileSync('operational/jespresso-engine.js','utf8'),engine);
  server.state.costing.revision=1;
  server.state.costing.model.channels=[{id:'direct',name:'Venta directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];
  server.state.costing.model.ingredients=[['nachos','NACHOS','unit',1,3000],['cheese','TAJADA DE QUESO','unit',1,500],['dough','MASA','g',1000,10000],['dough-copy',' masa ','g',1000,10000]].map(([id,name,unit,quantity,purchasePrice])=>({id,name,unit,quantity,purchasePrice,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}));
  const lines=[{ingredientId:'nachos',quantity:1/3,unit:'unit',stage:'portion'},{ingredientId:'cheese',quantity:7,unit:'unit',stage:'portion'},{ingredientId:'dough',quantity:200,unit:'g',stage:'portion'},{ingredientId:'dough-copy',quantity:50,unit:'g',stage:'portion'}];
  server.state.costing.model.recipes=['original','manual'].map(id=>({id,name:'Producto '+id,size:'',category:'Preparados',output:3,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:20000,targetPercent:0,marginMode:'margin',channelId:'direct',sheet:{...engine.AllianceJespresso.defaults(),date:'2026-11-04'},lines}));
  await enter(page,slug);await page.locator('.admin-sidebar [href="#costing"]').click();await expect(page.locator('[data-j-select]')).toBeVisible();
  for(const recipe of ['original','manual']){
    await page.locator('[data-j-select]').selectOption(recipe);
    if(recipe==='manual'){await page.locator('[data-j-path=output]').fill('4');await page.locator('#costingSave').click();await expect(page.locator('#costingStatus')).toContainText(/Receta guardada|Receta confirmada/);await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:20000}).toBe(0);await context.setOffline(true);}
    await page.locator('[data-j-action=inventory]').click();const form=page.locator('#inventoryForm');
    await expect(form.locator('[data-material-inventory-status]')).toContainText('No tienes que agregarlos uno por uno');await expect(form.locator('[data-material-inventory-status]')).toContainText(recipe==='manual'?'4 porciones':'3 porciones');
    if(recipe==='manual'){
      await form.locator('details').first().locator('summary').click();await form.locator('[name=product_name]').fill('Producto modificado manualmente');await form.locator('[name=sale_price]').fill('25000');
    }
    await form.locator('button[type=submit]').click();await expect(page.locator('#inventoryDialog')).toBeHidden();
  }
  await context.setOffline(false);await page.evaluate(()=>void (window as any).AllianceOffline.flush());await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:30000}).toBe(0);
  await expect.poll(()=>server.state.operations.recipes.length).toBe(2);expect(server.state.operations.ingredients).toHaveLength(3);expect(server.counts().ackLost).toBe(true);
  const first=server.state.docs.menu_items.find((p:any)=>p.name==='Producto original'),second=server.state.docs.menu_items.find((p:any)=>p.name==='Producto modificado manualmente');expect(second.price).toBe(25000);
  const linked=server.state.operations.recipes.find((r:any)=>r.productId===first.id),dough=server.state.operations.ingredients.find((i:any)=>i.name==='MASA');expect(linked.lines.find((l:any)=>l.ingredientId===dough.id).quantity).toBe(250);
  expect(dough.quantity).toBe(1000);expect(server.state.operations.ingredients.find((i:any)=>i.id==='existing-nachos').quantity).toBeCloseTo(4/3,8);expect(server.state.operations.ingredients.find((i:any)=>i.name==='TAJADA DE QUESO').quantity).toBe(28);
  await page.locator('.admin-sidebar [href="#inventory"]').click();await expect(page.locator('#inventoryList')).toContainText('Producto original');await expect(page.locator('#inventoryList')).toContainText('Puedes preparar 4');
  await page.locator('[data-material-view=macro]').click();await expect(page.locator('[data-material-card]')).toHaveCount(3);
  await page.evaluate(async productId=>{const w=window as any;await w.OracleDb.from('table_sessions').insert({id:'account',status:'open',sale_channel:'walk_in'});const r=await w.OracleDb.from('session_items').insert({id:'ready',session_id:'account',menu_item_id:productId,item_name:'Producto original',quantity:4,unit_price:20000});if(r.error)throw r.error;},first.id);
  await expect.poll(()=>page.evaluate(id=>(window as any).MaterialsPanel.available(id),second.id)).toBe(0);
  // Re-adding the other recipe after these sales does not replenish the ingredients already used.
  await page.evaluate(async productId=>{const w=window as any,s=await w.OracleDb.remote('operations_snapshot'),r=s.model.recipes.find((r:any)=>r.productId===productId),c=await w.OracleDb.remote('costing_load'),id=crypto.randomUUID();await w.OracleDb.remote('operations_apply',{id,command:'materials_link',payload:{productId,recipeId:r.recipeId,revision:c.revision,salePortions:1,mappings:r.mappings,supplyRecipe:true}},id);},second.id);
  await expect.poll(()=>page.evaluate(id=>(window as any).MaterialsPanel.available(id),second.id)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).AllianceOffline.status().pending),{timeout:20000}).toBe(0);
  const otherContext=await browser.newContext({baseURL:'http://127.0.0.1:4177',serviceWorkers:'allow'});try{await server.attach(otherContext);const other=await otherContext.newPage();await enter(other,slug);const snapshot=await other.evaluate(async()=>(window as any).OracleDb.remote('operations_snapshot'));expect(snapshot.model.ingredients).toHaveLength(3);expect(snapshot.model.recipes).toHaveLength(2);expect(snapshot.docs.menu_items.some((p:any)=>p.id===second.id)).toBe(true);}finally{await otherContext.close();}
});
