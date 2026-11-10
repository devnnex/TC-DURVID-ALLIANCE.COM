import {test,expect,type Page} from '@playwright/test';
import {backend,product} from './helpers/operational-backend';

async function storefront(page:Page,{lostAck=false,rejectStock=false}={}){
  const server=await backend(page);server.context.locations[0].slug='gcobarf';
  server.state.stock[product].stock=5;
  let rows=[{id:product,name:'GCOBARF · Pollo',category:'Alimento',price:10000,stock:5,unit:'unidad',available:true,description:'Su porción favorita',image:null},{id:'exhausted',name:'GCOBARF · Pavo',category:'Alimento',price:12000,stock:0,unit:'unidad',available:false,image:null}];
  const orders=new Map<string,any>(),creates:any[]=[];let lost=false;
  await page.context().route(/\/api\/v1\/(?:file\/)?rpc$/,async route=>{
    const request=route.request().postDataJSON();if(request.path!=='/gcobarf/public')return route.fallback();
    const body=request.body;let status=200,data:any;
    if(body.action==='catalog')data={products:rows};
    else if(body.action==='status'){data=orders.get(body.token);if(!data){status=404;data={error:{code:'ORDER_NOT_FOUND',message:'No encontramos esta programación.'}};}}
    else{
      creates.push(body);
      if(rejectStock){status=409;data={error:{code:'INSUFFICIENT_STOCK',message:'No quedan suficientes unidades. Revisa tu pedido.'}};}
      else if(orders.has(body.token))data=orders.get(body.token);
      else{
        const order=body.order,id='public-delivery',customerId='online-client';
        server.state.operations.customers.push({id:customerId,name:order.name,phone:order.phone,active:true,allowCredit:true,creditLimit:0,revision:1});
        server.state.docs.table_sessions.push({id,status:'open',table_id:null,sale_channel:'walk_in',customer_id:customerId,payer_name:order.name,delivery_date:order.date,delivery_time:order.time,source:'online',order_phone:order.phone,delivery_mode:order.mode,delivery_address:order.address,delivery_city:order.city,order_notes:order.notes});
        server.state.docs.session_items.push(...order.items.map((item:any,index:number)=>({id:'online-line-'+index,session_id:id,menu_item_id:item.productId,item_name:'GCOBARF · Pollo',quantity:item.quantity,unit_price:item.unitPrice,status:'confirmed'})));
        server.state.stock[product].stock-=order.items[0].quantity;rows[0].stock=server.state.stock[product].stock;
        server.state.operations.deliveryHolds=[{id,products:{[product]:order.items[0].quantity}}];
        data={id,number:'GCO-TEST',date:order.date,time:order.time,items:order.items.map((item:any)=>({name:'GCOBARF · Pollo',quantity:item.quantity,unitPrice:item.unitPrice})),total:order.items.reduce((sum:number,item:any)=>sum+item.quantity*item.unitPrice,0),pending:order.items.reduce((sum:number,item:any)=>sum+item.quantity*item.unitPrice,0),status:'Pendiente de pago'};orders.set(body.token,data);
        if(lostAck&&!lost){lost=true;return route.abort('failed');}
      }
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify({status,data})});
  });
  return {...server,creates,orders,changeCatalog:(next:typeof rows)=>{rows=next;},rows};
}
async function checkout(page:Page,quantity=2){
  await page.goto('/negocios/gcobarf/pedidos.html');
  await expect(page.locator('[data-product]')).toHaveCount(2);
  await page.getByRole('button',{name:'Agregar GCOBARF · Pollo',exact:true}).click();
  await expect(page.locator('#product-dialog')).toBeVisible();
  await page.locator('#detail-quantity').fill(String(quantity));await page.locator('#add-product').click();
  await page.getByRole('button',{name:'Abrir mi pedido'}).click();
  await page.locator('#confirm-order').click();
  await page.locator('[name=name]').fill('Ana Pérez');await page.locator('[name=phone]').fill('3001234567');
  await page.locator('[name=city]').fill('Bogotá');await page.locator('[name=address]').fill('Calle 10 # 20-30, Apto 2');
  await page.locator('[name=notes]').fill('Llamar al llegar');await page.locator('[name=consent]').check();
}

test('pedido público reserva productos y aparece en el calendario existente con dirección y pago pendiente',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const server=await storefront(page);
  await checkout(page);await expect(page.getByRole('button',{name:'Agregar GCOBARF · Pavo',exact:true})).toBeDisabled();
  await page.locator('#confirm-order').click();await expect(page.locator('#success-dialog')).toBeVisible();await expect(page.locator('#success-detail')).toContainText('Pendiente de pago');
  expect(server.creates).toHaveLength(1);expect(server.state.stock[product].stock).toBe(3);
  expect(server.creates[0].order.items).toEqual([{productId:product,quantity:2,unitPrice:10000}]);
  await page.locator('#view-deliveries').click();await expect(page.locator('#my-orders')).toContainText('GCO-TEST');await page.reload();await expect(page.locator('#my-orders')).toContainText('2 × GCOBARF · Pollo');
  const admin=await context.newPage();await admin.goto('/negocios/gcobarf/admin.html');
  await admin.locator('#loginForm [name=username]').fill('tester');await admin.locator('#loginForm [name=pin]').fill('test-password');await admin.locator('#loginForm button[type=submit]').click();
  const day=server.creates[0].order.date;
  await admin.locator('[data-delivery-day="'+day+'"]').click();
  const card=admin.locator('[data-delivery-card="public-delivery"]');await expect(card).toContainText('Ana Pérez');await expect(card).toContainText('Pedido en línea');await expect(card).toContainText('Calle 10 # 20-30');await expect(card).toContainText('3001234567');await expect(card).toContainText('Llamar al llegar');
  await expect(card).toContainText('Pendiente de pago');await expect(admin.getByRole('link',{name:'Abrir pedidos en línea'})).toHaveAttribute('href','pedidos.html');
  expect(errors).toEqual([]);
});

test('actualiza inventario, bloquea agotados y respeta límites en móvil',async({page})=>{
  const server=await storefront(page);await page.setViewportSize({width:390,height:844});await page.goto('/negocios/gcobarf/pedidos.html');
  await expect(page.locator('[data-product="exhausted"]')).toHaveClass(/unavailable/);await expect(page.locator('[data-product="exhausted"] [data-add]')).toBeDisabled();
  await page.locator('[data-add="'+product+'"]').click();await page.locator('#add-product').click();await page.getByRole('button',{name:'Abrir mi pedido'}).click();
  await page.locator('[data-quantity]').fill('6');await page.locator('[data-quantity]').dispatchEvent('change');await expect(page.locator('#confirm-order')).toBeDisabled();await expect(page.locator('.cart-warning')).toContainText('Solo quedan 5');
  await page.locator('[data-quantity]').fill('2');await page.locator('[data-quantity]').dispatchEvent('change');await page.locator('#cart-close').click();
  server.rows[0].stock=0;server.rows[0].available=false;
  await expect(page.locator('[data-product="'+product+'"]')).toHaveClass(/unavailable/,{timeout:10000});await page.getByRole('button',{name:'Abrir mi pedido'}).click();
  await expect(page.locator('#confirm-order')).toBeDisabled();await expect(page.locator('.cart-warning')).toContainText('Producto no disponible');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#cart-close').click();
  await page.screenshot({path:'test-results/gcobarf-public-mobile.png',fullPage:true});
});

test('recupera una respuesta perdida sin duplicar entregas ni descuentos',async({page})=>{
  const server=await storefront(page,{lostAck:true});await checkout(page);await page.locator('#confirm-order').click();
  await expect(page.locator('#checkout-status')).toContainText('Reintentar envío');expect(server.state.stock[product].stock).toBe(3);
  await page.locator('#confirm-order').click();await expect(page.locator('#success-dialog')).toBeVisible();
  expect(server.creates).toHaveLength(2);expect(server.creates[0].token).toBe(server.creates[1].token);expect(server.state.docs.table_sessions).toHaveLength(1);expect(server.state.stock[product].stock).toBe(3);
});

test('si otro cliente agota el producto informa el rechazo y conserva los datos para corregir',async({page})=>{
  const server=await storefront(page,{rejectStock:true});await checkout(page);await page.locator('#confirm-order').click();
  await expect(page.locator('#checkout-status')).toContainText('No quedan suficientes');await expect(page.locator('#success-dialog')).not.toBeVisible();await expect(page.locator('[name=name]')).toHaveValue('Ana Pérez');await expect(page.locator('[name=name]')).toBeEnabled();
  expect(server.state.docs.table_sessions).toHaveLength(0);expect(server.state.stock[product].stock).toBe(5);
  expect(await page.evaluate(()=>localStorage.getItem('gcobarf-public-pending-v1'))).toBeNull();
});

test('abre la ficha al instante, elige cantidad y confirma con carrito visible',async({page})=>{
  await storefront(page);await page.setViewportSize({width:390,height:844});await page.goto('/negocios/gcobarf/pedidos.html');
  await page.getByRole('button',{name:'Agregar GCOBARF · Pollo',exact:true}).click();
  const dialog=page.locator('#product-dialog');await expect(dialog).toBeVisible();await expect(page.locator('#detail-quantity')).toHaveValue('1');
  const picture=await page.locator('.detail-photo img').boundingBox(),title=await page.locator('#product-title').boundingBox();expect(picture!.y+picture!.height).toBeLessThanOrEqual(title!.y);
  await dialog.getByRole('button',{name:'Aumentar cantidad',exact:true}).click();await expect(page.locator('#detail-quantity')).toHaveValue('2');await expect(page.locator('#add-product')).toContainText('20.000');
  await dialog.getByRole('button',{name:'Disminuir cantidad',exact:true}).click();await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await page.locator('#add-product').click();await expect(dialog).toBeHidden();await expect(page.locator('#toast')).toContainText('Agregado a tu pedido');
  await expect(page.locator('#basket-summary')).toBeVisible();await expect(page.locator('#basket-summary')).toContainText('10.000');await expect(page.locator('[data-product="'+product+'"] output')).toHaveText('1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('pulsaciones rápidas conservan el botón, sincronizan cantidades y respetan stock',async({page})=>{
  await storefront(page);await page.goto('/negocios/gcobarf/pedidos.html');
  await page.locator('[data-add="'+product+'"]').click();await page.locator('#add-product').click();
  const card=page.locator('[data-product="'+product+'"]'),plus=card.getByRole('button',{name:'Aumentar GCOBARF · Pollo',exact:true});
  const original=await plus.elementHandle();
  for(let i=0;i<4;i++)await plus.click();
  await expect(card.locator('output')).toHaveText('5');await expect(plus).toBeDisabled();expect(await original!.evaluate(button=>button.isConnected)).toBe(true);
  await page.locator('#basket-summary').click();await expect(page.locator('[data-quantity]')).toHaveValue('5');await expect(page.locator('#cart-total')).toContainText('50.000');
  await page.locator('#cart-items').getByRole('button',{name:'Disminuir GCOBARF · Pollo',exact:true}).click();await expect(page.locator('[data-quantity]')).toHaveValue('4');
  await page.locator('#cart-close').click();await expect(card.locator('output')).toHaveText('4');
  for(let i=0;i<4;i++)await card.getByRole('button',{name:'Disminuir GCOBARF · Pollo',exact:true}).click();
  await expect(card.locator('[data-add]')).toBeVisible();await expect(page.locator('#basket-summary')).toBeHidden();await expect(page.locator('[data-cart-count]').first()).toHaveText('0');
});

test('revisa productos antes de los datos y conserva el carrito al recargar',async({page})=>{
  await storefront(page);await page.goto('/negocios/gcobarf/pedidos.html');await page.locator('[data-add="'+product+'"]').click();await page.locator('#detail-quantity').fill('3');await page.locator('#add-product').click();
  await page.reload();await expect(page.locator('[data-product="'+product+'"] output')).toHaveText('3');
  await page.locator('#basket-summary').click();await expect(page.locator('#checkout')).toBeHidden();await expect(page.locator('#cart-items')).toBeVisible();await expect(page.locator('#confirm-order')).toHaveText('Continuar con la entrega →');
  await page.locator('#confirm-order').click();await expect(page.locator('#checkout')).toBeVisible();await expect(page.locator('#cart-items')).toBeHidden();await page.locator('[name=name]').fill('Ana');
  await page.locator('#checkout-back').click();await expect(page.locator('[data-quantity]')).toHaveValue('3');await page.locator('#confirm-order').click();await expect(page.locator('[name=name]')).toHaveValue('Ana');
  await page.locator('#checkout-back').click();await page.locator('[data-quantity]').fill('');await expect(page.locator('#confirm-order')).toBeDisabled();await page.locator('[data-quantity]').fill('2');await expect(page.locator('#confirm-order')).toBeEnabled();
});

test('la ficha reacciona si cambia el stock mientras se elige la cantidad',async({page})=>{
  const server=await storefront(page);await page.goto('/negocios/gcobarf/pedidos.html');
  await page.locator('[data-add="'+product+'"]').click();await page.locator('#detail-quantity').fill('4');server.rows[0].stock=2;
  await expect(page.locator('#detail-status')).toContainText('Solo quedan 2',{timeout:10000});await expect(page.locator('#add-product')).toBeDisabled();
  await page.locator('#detail-quantity').fill('2');await expect(page.locator('#add-product')).toBeEnabled();await page.locator('#add-product').click();await expect(page.locator('#basket-summary')).toContainText('20.000');
});
