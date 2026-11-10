/* GCOBARF public catalog. Never shares admin credentials or caches inventory offline. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
  const localDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const needsNeighborhood=value=>!!String(value||'').trim()&&!/\bbarrio\b/i.test(value);
  const prettyDay=date=>new Date(date+'T12:00:00-05:00').toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'America/Bogota'});
  const safeImage=value=>{if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value||''))return value;try{const url=new URL(value,location.href);return value&&(url.protocol==='https:'||url.origin===location.origin)?url.href:'';}catch{return '';}};
  const illustrativeImage=row=>{
    const name=String(row.name||'').toLocaleLowerCase('es');
    const type=/mixta|mixto|mezcla/.test(name)?'mixta':/pollo/.test(name)?'pollo':/carne|\bres\b|ternera/.test(name)?'carne':'general';
    return './assets/bolsa-'+type+'-premium.webp';
  };
  const keys={orders:'gcobarf-public-orders-v1',pending:'gcobarf-public-pending-v1',cart:'gcobarf-public-cart-v1'};
  const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  let products=[],category='',cart=new Map(),connected=false,catalogBusy=false,submitting=false,ordersBusy=false,signature='',toastTimer,lastFocus,lastProductFocus,activeProductId='',detailQuantity=1,cartStep='review';
  const quantityIssues=new Set();
  const draft=load(keys.cart,[]);
  if(Array.isArray(draft))for(const row of draft.slice(0,50))if(typeof row?.id==='string'&&typeof row.name==='string'&&Number.isInteger(row.quantity)&&row.quantity>0&&row.quantity<=10000)cart.set(row.id,{id:row.id,name:row.name,price:Number(row.price)||0,quantity:row.quantity});
  let saved=load(keys.orders,[]);if(!Array.isArray(saved))saved=[];saved=saved.filter(row=>/^[a-f0-9]{64}$/.test(row?.token)).slice(-50);
  let pending=load(keys.pending,null);if(!/^[a-f0-9]{64}$/.test(pending?.token)||!pending?.order)pending=null;
  const receipts=new Map();
  const base=window.ALLIANCE_CONFIG?.API_URL?.replace(/\/$/,'');
  const form=$('#checkout');
  const product=id=>products.find(row=>row.id===id);
  const canBuy=row=>!!row?.available&&row.stock>=1&&row.price>0;
  const quantityLimit=row=>Math.min(10000,Math.floor(Number(row?.stock)||0));
  const count=()=>[...cart.values()].reduce((sum,row)=>sum+row.quantity,0);
  const total=()=>[...cart.values()].reduce((sum,row)=>sum+row.quantity*(product(row.id)?.price??row.price),0);
  const invalidCart=()=>!cart.size||quantityIssues.size>0||[...cart.values()].some(row=>!canBuy(product(row.id))||row.quantity>quantityLimit(product(row.id))||!Number.isInteger(row.quantity)||row.quantity<1);
  const locked=()=>submitting||!!pending;
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function pulse(element){if(!element||reducedMotion())return;element.getAnimations().forEach(animation=>animation.cancel());element.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:240,easing:'ease-out'});}
  function toast(message,copy='',success=false){
    clearTimeout(toastTimer);const box=$('#toast');box.innerHTML='<span class="toast-check" aria-hidden="true">'+(success?'✓':'i')+'</span><span><strong>'+esc(message)+'</strong>'+(copy?'<small>'+esc(copy)+'</small>':'')+'</span>';box.hidden=false;
    if(!reducedMotion()){box.getAnimations().forEach(animation=>animation.cancel());box.animate([{opacity:0,translate:'0 -10px'},{opacity:1,translate:'0 0'}],{duration:180,easing:'ease-out'});}
    toastTimer=setTimeout(()=>box.hidden=true,2600);
  }
  function saveCart(){try{localStorage.setItem(keys.cart,JSON.stringify([...cart.values()]));}catch{/* Ordering can continue without draft storage. */}}
  function imageMarkup(row){const own=safeImage(row.image),fallback=illustrativeImage(row);return '<img src="'+esc(own||fallback)+'" data-fallback="'+esc(fallback)+'" data-product-name="'+esc(row.name)+'" alt="'+esc((own?'':'Imagen ilustrativa de alimento para mascotas · ')+row.name)+'" loading="lazy" decoding="async"><span class="example-photo-label" '+(own?'hidden':'')+'>Imagen ilustrativa</span>';}
  function wireImages(root){
    root.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
      const label=img.parentElement.querySelector('.example-photo-label');if(label)label.hidden=false;
      if(img.getAttribute('src')!==img.dataset.fallback){img.src=img.dataset.fallback;img.alt='Imagen ilustrativa de alimento para mascotas · '+img.dataset.productName;}
      else{const message=document.createElement('span');message.className='photo-unavailable';message.textContent='Imagen no disponible';img.replaceWith(message);if(label)label.hidden=true;}
    }));
  }
  function quantityMarkup(row,quantity,scope){
    return '<div class="quantity-control" data-quantity-control="'+esc(row.id)+'"><button type="button" data-quantity-step="-1" data-product-id="'+esc(row.id)+'" data-scope="'+scope+'" aria-label="Disminuir '+esc(row.name)+'" '+(locked()?'disabled':'')+'>−</button>'+(scope==='cart'?'<input type="number" inputmode="numeric" step="1" min="1" max="'+quantityLimit(row)+'" value="'+quantity+'" data-quantity="'+esc(row.id)+'" aria-label="Cantidad de '+esc(row.name)+'" '+(locked()?'disabled':'')+'>':'<output aria-label="Cantidad en tu pedido">'+quantity+'</output>')+'<button type="button" data-quantity-step="1" data-product-id="'+esc(row.id)+'" data-scope="'+scope+'" aria-label="Aumentar '+esc(row.name)+'" '+(locked()||!canBuy(row)||quantity>=quantityLimit(row)?'disabled':'')+'>+</button></div>';
  }
  function cardControl(row){const quantity=cart.get(row.id)?.quantity||0;return quantity?quantityMarkup(row,quantity,'card'):'<button class="add-product" data-add="'+esc(row.id)+'" type="button" aria-label="Agregar '+esc(row.name)+'" '+(!canBuy(row)||locked()?'disabled':'')+'><span>Elegir</span><b aria-hidden="true">+</b></button>';}
  function refreshProductControls(){
    for(const card of $('#products').querySelectorAll('[data-product]')){
      const row=product(card.dataset.product);if(!row)continue;const quantity=cart.get(row.id)?.quantity||0,host=card.querySelector('[data-product-control]');
      card.classList.toggle('is-in-cart',quantity>0);
      if(!!host.querySelector('[data-quantity-control]')!==!!quantity)host.innerHTML=cardControl(row);
      else if(quantity){host.querySelector('output').textContent=quantity;host.querySelector('[data-quantity-step="-1"]').disabled=locked();host.querySelector('[data-quantity-step="1"]').disabled=locked()||!canBuy(row)||quantity>=quantityLimit(row);}
      else host.querySelector('[data-add]').disabled=!canBuy(row)||locked();
      card.querySelector('.stock-text').textContent=canBuy(row)?row.stock+' disponibles'+(quantity?' · '+quantity+' en tu pedido':''):'Agotado o no disponible';
    }
  }
  async function rpc(body){
    if(!base)throw new Error('No se pudo conectar con GCOBARF. Intenta de nuevo más tarde.');
    const response=await fetch(base+(location.protocol==='file:'?'/file/rpc':'/rpc'),{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'POST',path:'/gcobarf/public',body}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('No se pudo conectar con GCOBARF. Revisa tu conexión e intenta de nuevo.');
    const result=await response.json();
    if(result.status>=400){const error=new Error(result.data?.error?.message||'No se pudo completar el pedido.');error.status=result.status;error.code=result.data?.error?.code;throw error;}
    return result.data;
  }
  function categories(){
    const values=[...new Set(products.map(row=>row.category).filter(Boolean))];if(category&&!values.includes(category))category='';
    $('#categories').innerHTML=['',...values].map(value=>'<button type="button" data-category="'+esc(value)+'" aria-pressed="'+(value===category)+'">'+esc(value||'Todos')+'</button>').join('');
  }
  function renderProducts(){
    const query=$('#search').value.trim().toLocaleLowerCase('es');
    const rows=products.filter(row=>(!category||row.category===category)&&(!query||(row.name+' '+(row.description||'')).toLocaleLowerCase('es').includes(query)));
    $('#products').innerHTML=rows.length?rows.map(row=>{
      const available=canBuy(row),selected=cart.get(row.id)?.quantity||0;
      return '<article class="product-card '+(available?'':'unavailable')+(selected?' is-in-cart':'')+'" data-product="'+esc(row.id)+'"><button type="button" class="product-photo product-preview" data-open-product="'+esc(row.id)+'" aria-label="Ver '+esc(row.name)+'" '+(!available||locked()?'disabled':'')+'>'+imageMarkup(row)+'<small>'+(available?'PARA SU PRÓXIMA COMIDA':'NO DISPONIBLE')+'</small></button><div class="product-info"><small>'+esc(row.category||'GCOBARF')+'</small><h3>'+esc(row.name)+'</h3><p>'+esc(row.description||'Elige las unidades para tu próxima entrega.')+'</p><div class="product-bottom"><strong>'+money(row.price)+'<small>por unidad</small></strong><div data-product-control>'+cardControl(row)+'</div></div><span class="stock-text">'+(available?row.stock+' disponibles'+(selected?' · '+selected+' en tu pedido':''):'Agotado o no disponible')+'</span></div></article>';
    }).join(''):'<p class="empty">'+(products.length?'No encontramos productos con esos filtros.':'GCOBARF aún no tiene productos en su inventario. Vuelve pronto.')+'</p>';
    wireImages($('#products'));
  }
  function updateSubmit(){
    for(const control of form.elements)if(control.id!=='confirm-order')control.disabled=submitting||!!pending;
    const details=cartStep==='details';
    form.hidden=!details;$('#cart-items').hidden=details;$('#continue-shopping').hidden=details;$('#checkout-back').hidden=!details||!!pending;$('#checkout-back').disabled=submitting;
    $('#cart-step').textContent=details?'2 DE 2 · TU ENTREGA':'1 DE 2 · TUS PRODUCTOS';$('#cart-title').textContent=details?'Programa tu entrega':'Tu pedido';
    $('#confirm-order').type=details?'submit':'button';
    $('#confirm-order').disabled=submitting||(!pending&&(!connected||invalidCart()));
    $('#confirm-order').textContent=submitting?'Confirmando tu programación…':pending?'Reintentar envío del pedido →':details?'Confirmar programación →':'Continuar con la entrega →';
    // A pending request keeps its exact payload until its outcome is known.
    if(pending)$('#confirm-order').disabled=submitting||!navigator.onLine;
  }
  function renderCart(rebuild=true){
    document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=count());
    $('#cart-total').textContent=money(total());$('#basket-total').textContent=money(total());$('#basket-units').textContent=count()+' producto'+(count()===1?'':'s');$('#basket-summary').hidden=!cart.size;
    document.querySelector('[data-cart-open].cart-button')?.classList.toggle('has-items',!!cart.size);
    if(rebuild){quantityIssues.clear();$('#cart-items').innerHTML=cart.size?[...cart.values()].map(row=>{
      const current=product(row.id),bad=!canBuy(current)||row.quantity>current.stock;
      const shown={...row,stock:0,...current};
      return '<article class="cart-line" data-cart-line="'+esc(row.id)+'"><div class="cart-thumbnail">'+imageMarkup(shown)+'</div><div class="cart-line-info"><div class="cart-line-head"><strong>'+esc(shown.name)+'</strong><button type="button" data-remove="'+esc(row.id)+'" aria-label="Quitar '+esc(shown.name)+'" '+(locked()?'disabled':'')+'>×</button></div><small>'+money(shown.price)+' por unidad</small><small class="cart-warning" '+(bad?'':'hidden')+'>'+(bad?(canBuy(current)?'Solo quedan '+current.stock+' unidades.':'Producto no disponible. Retíralo para continuar.'):'')+'</small><div class="cart-line-bottom">'+quantityMarkup(shown,row.quantity,'cart')+'<strong data-line-total>'+money(row.quantity*shown.price)+'</strong></div></div></article>';
    }).join(''):'<div class="empty cart-empty"><span aria-hidden="true">⌑</span><strong>Sus favoritos te esperan</strong><p>Agrega un producto y elige cuántas unidades necesitas.</p></div>';wireImages($('#cart-items'));}
    else for(const line of $('#cart-items').querySelectorAll('[data-cart-line]')){
      const row=cart.get(line.dataset.cartLine);if(!row)continue;const current=product(row.id),field=line.querySelector('[data-quantity]'),bad=!canBuy(current)||row.quantity>current.stock;
      if(document.activeElement!==field)field.value=row.quantity;field.max=quantityLimit(current)||1;
      line.querySelector('[data-line-total]').textContent=money(row.quantity*(current?.price??row.price));
      line.querySelector('.cart-line-info>small:not(.cart-warning)').textContent=money(current?.price??row.price)+' por unidad';
      line.querySelector('[data-quantity-step="-1"]').disabled=locked();line.querySelector('[data-quantity-step="1"]').disabled=locked()||!canBuy(current)||row.quantity>=quantityLimit(current);
      const warning=line.querySelector('.cart-warning');warning.hidden=!bad;warning.textContent=bad?(canBuy(current)?'Solo quedan '+current.stock+' unidades.':'Producto no disponible. Retíralo para continuar.'):'';
    }
    updateSubmit();
  }
  function cartFeedback(id,message,copy){
    toast(message,copy,true);document.querySelectorAll('[data-cart-count]').forEach(pulse);
    const card=$('#products').querySelector('[data-product="'+CSS.escape(id)+'"]');if(card&&!reducedMotion())card.animate([{boxShadow:'0 0 0 0 #327cf000'},{boxShadow:'0 0 0 4px #327cf04d'},{boxShadow:'0 0 0 0 #327cf000'}],{duration:450,easing:'ease-out'});
  }
  function changeQuantity(button){
    if(locked()||button.disabled)return;
    const id=button.dataset.productId,row=cart.get(id),current=product(id),step=Number(button.dataset.quantityStep);if(!row)return;
    if(step>0&&(!canBuy(current)||row.quantity>=quantityLimit(current))){toast('Llegaste al disponible','Revisa las existencias de este producto.');return;}
    const next=row.quantity+step;
    if(next<=0){cart.delete(id);renderCart();}else{row.quantity=next;renderCart(false);pulse(button.parentElement.querySelector('output,input'));}
    quantityIssues.delete(id);saveCart();refreshProductControls();updateSubmit();
    cartFeedback(id,next>0?'Pedido actualizado':'Producto retirado',next>0?next+' × '+row.name:row.name);
  }
  function refreshDetail(){
    if(!activeProductId)return;const row=product(activeProductId),valid=canBuy(row)&&Number.isInteger(detailQuantity)&&detailQuantity>=1&&detailQuantity<=quantityLimit(row)&&!locked();
    $('#detail-stock').textContent=canBuy(row)?row.stock+' unidades disponibles':'Producto no disponible';
    $('#detail-price').textContent=money(row?.price||0)+' por unidad';$('#detail-quantity').max=quantityLimit(row)||1;
    $('#product-dialog [data-detail-step="-1"]').disabled=locked()||detailQuantity<=1;
    $('#product-dialog [data-detail-step="1"]').disabled=locked()||!canBuy(row)||detailQuantity>=quantityLimit(row);
    $('#add-product').disabled=!valid;
    $('#add-product').textContent=(cart.has(activeProductId)?'Actualizar pedido':'Agregar al pedido')+' · '+money((row?.price||0)*(Number.isFinite(detailQuantity)?detailQuantity:0));
    $('#detail-status').textContent=!canBuy(row)?'Este producto ya no está disponible.':!Number.isInteger(detailQuantity)||detailQuantity<1?'Escribe una cantidad entera mayor que cero.':detailQuantity>quantityLimit(row)?(row.stock<=10000?'Solo quedan '+row.stock+' unidades.':'Puedes elegir hasta 10.000 unidades.')+' Ajusta la cantidad.':'Elige la cantidad y agrégala a tu pedido.';
  }
  function openProduct(id){
    const row=product(id);if(!canBuy(row)||locked())return;
    activeProductId=id;detailQuantity=cart.get(id)?.quantity||1;lastProductFocus=document.activeElement;
    $('#detail-photo').innerHTML=imageMarkup(row);wireImages($('#detail-photo'));$('#detail-photo img').loading='eager';
    $('#detail-category').textContent=row.category||'GCOBARF';$('#product-title').textContent=row.name;$('#detail-description').textContent=row.description||'Su próxima comida, en la cantidad que necesitas.';$('#detail-quantity').value=detailQuantity;
    refreshDetail();$('#product-dialog').showModal();$('#product-dialog .detail-scroll').scrollTop=0;
  }
  function addActiveProduct(){
    const row=product(activeProductId);if(!canBuy(row)||locked()||!Number.isInteger(detailQuantity)||detailQuantity<1||detailQuantity>quantityLimit(row))return;
    const editing=cart.has(row.id);cart.set(row.id,{id:row.id,name:row.name,price:row.price,quantity:detailQuantity});
    saveCart();renderCart();refreshProductControls();$('#product-dialog').close();cartFeedback(row.id,editing?'Pedido actualizado':'Agregado a tu pedido',detailQuantity+' × '+row.name);
  }
  async function refreshCatalog(){
    if(catalogBusy||document.hidden)return;catalogBusy=true;
    try{
      const data=await rpc({action:'catalog'});if(!Array.isArray(data.products))throw new Error('El catálogo no está disponible.');
      const changed=signature!==JSON.stringify(data.products),previous=products;products=data.products;signature=JSON.stringify(products);connected=true;
      $('#connection').textContent='Inventario actualizado · en línea';$('#connection').classList.remove('offline');$('#catalog-message').textContent='';
      if(changed){
        const changedPrice=[...cart.values()].some(row=>(previous.find(p=>p.id===row.id)?.price??row.price)!==product(row.id)?.price);
        if(cart.size&&(changedPrice||invalidCart())){
          $('#checkout-status').textContent=invalidCart()?'Cambió la disponibilidad. Revisa las cantidades de tu pedido.':'Se actualizaron los precios. Revisa el total antes de confirmar.';
          toast(invalidCart()?'Cambió la disponibilidad de tu pedido.':'Se actualizó el total de tu pedido.');
        }
        categories();renderProducts();renderCart(!$('#cart-dialog').open||cartStep!=='review');refreshDetail();
      }else updateSubmit();
    }catch(error){connected=false;$('#connection').textContent='Sin conexión · reintentando';$('#connection').classList.add('offline');$('#catalog-message').textContent='No pudimos actualizar el inventario. Para confirmar tu pedido necesitamos conexión con el negocio.';updateSubmit();}
    finally{catalogBusy=false;}
  }
  function openCart(){lastFocus=document.activeElement;cartStep=pending?'details':'review';refreshDateBounds();renderCart();$('#cart-dialog').showModal();}
  function showSuccess(row){
    if($('#cart-dialog').open)$('#cart-dialog').close();
    $('#success-detail').innerHTML='<strong>'+esc(row.number)+'</strong>'+esc(prettyDay(row.date))+' · '+esc(row.time)+'<br><span class="badge">'+esc(row.status)+'</span>';
    if(!$('#success-dialog').open)$('#success-dialog').showModal();
  }
  function remember(row,token){
    const next=[...saved.filter(value=>value.token!==token),{token,number:row.number}].slice(-50);
    // Write the durable receipt before clearing the pending idempotency key.
    localStorage.setItem(keys.orders,JSON.stringify(next));saved=next;receipts.set(token,row);localStorage.removeItem(keys.pending);pending=null;
  }
  function renderOrders(){
    $('#my-orders').innerHTML=saved.length?[...saved].reverse().map(value=>{
      const row=receipts.get(value.token);
      if(!row)return '<article class="order-card"><h3>'+esc(value.number||'Tu programación')+'</h3><p>Conéctate y pulsa «Actualizar entregas» para consultar su estado.</p></article>';
      return '<article class="order-card"><header><h3>'+esc(row.number)+'</h3><span class="badge '+(row.status==='Pagado'?'paid':'')+'">'+esc(row.status)+'</span></header><p class="order-date">'+esc(prettyDay(row.date))+' · '+esc(row.time)+'</p><ul>'+row.items.map(item=>'<li>'+item.quantity+' × '+esc(item.name)+'</li>').join('')+'</ul><p>Total de productos: <strong>'+money(row.total)+'</strong></p>'+(row.status!=='Cancelado'?'<p class="hint">'+(row.status==='Pagado'?'Pago confirmado por GCOBARF.':'Pendiente: '+money(row.pending)+'. El negocio registra el pago.')+'</p>':'')+'</article>';
    }).join(''):'<p class="empty">Cuando confirmes tu pedido, su programación aparecerá aquí.</p>';
    if(pending)$('#my-orders').insertAdjacentHTML('afterbegin','<article class="order-card"><h3>Pedido por confirmar</h3><p>El envío no terminó de confirmarse. Reinténtalo para consultar o completar la misma programación sin duplicarla.</p><button type="button" class="secondary" data-recover>Revisar pedido pendiente</button></article>');
  }
  async function refreshOrders(){
    if(ordersBusy||document.hidden)return;ordersBusy=true;$('#refresh-orders').disabled=true;
    try{
      // Sequential requests keep this browser from flooding the public endpoint.
      for(const value of saved){try{receipts.set(value.token,await rpc({action:'status',token:value.token}));}catch{}}
      if(pending&&!submitting){
        try{const token=pending.token,row=await rpc({action:'status',token});remember(row,token);cart.clear();saveCart();form.reset();initDates();renderCart();renderProducts();toast('Tu programación quedó confirmada.');}
        catch{/* Retry the original payload if the earlier response was lost. */}
      }
      renderOrders();
    }finally{ordersBusy=false;$('#refresh-orders').disabled=false;}
  }
  function orderPayload(){
    const values=new FormData(form),delivery=values.get('mode')==='delivery',address=delivery?String(values.get('address')||'').trim():'';
    return {name:values.get('name').trim(),phone:values.get('phone').trim(),mode:values.get('mode'),address,neighborhood:needsNeighborhood(address)?String(values.get('neighborhood')||'').trim():'',date:values.get('date'),time:values.get('time'),notes:values.get('notes').trim(),consent:values.get('consent')==='on',items:[...cart.values()].map(row=>({productId:row.id,quantity:row.quantity,unitPrice:product(row.id).price}))};
  }
  async function submit(event){
    event.preventDefault();if(submitting)return;
    if(!pending){
      toggleAddress();refreshDateBounds();
      if(!form.reportValidity()||invalidCart()||!connected)return;
      const order=orderPayload();
      if(order.date<localDay(new Date())){form.elements.date.setCustomValidity('Selecciona hoy o una fecha posterior.');form.elements.date.reportValidity();return;}
      const bytes=crypto.getRandomValues(new Uint8Array(32)),token=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
      try{localStorage.setItem(keys.pending,JSON.stringify({token,order}));pending={token,order};}
      catch{$('#checkout-status').textContent='Permite el almacenamiento de este sitio para conservar la confirmación de tu pedido.';return;}
    }
    submitting=true;$('#checkout-status').textContent='Estamos confirmando tu entrega con GCOBARF…';renderCart();renderProducts();
    try{
      const token=pending.token,row=await rpc({action:'create',token,order:pending.order});
      remember(row,token);cart.clear();saveCart();$('#checkout-status').textContent='';form.reset();initDates();renderOrders();showSuccess(row);void refreshCatalog();
    }catch(error){
      if(error.status>=400&&error.status<500&&error.code!=='ORDER_CHANGED'){
        localStorage.removeItem(keys.pending);pending=null;$('#checkout-status').textContent=error.message;void refreshCatalog();
      }else $('#checkout-status').textContent='El envío no pudo confirmarse. Pulsa «Reintentar envío del pedido»; consultaremos la misma programación para evitar duplicados.';
      renderOrders();
    }finally{submitting=false;renderCart();renderProducts();}
  }
  function refreshDateBounds(){
    form.elements.date.min=localDay(new Date());form.elements.date.max=localDay(new Date(Date.now()+365*86400000));
    form.elements.date.setCustomValidity(form.elements.date.value&&form.elements.date.value<form.elements.date.min?'Selecciona hoy o una fecha posterior.':'');
  }
  function initDates(){refreshDateBounds();form.elements.date.value='';form.elements.time.value='09:00';toggleAddress();}
  function toggleAddress(){
    const delivery=form.elements.mode.value==='delivery',required=delivery&&needsNeighborhood(form.elements.address.value);
    $('#address-fields').hidden=!delivery;form.elements.address.required=false;$('#neighborhood-field').hidden=!required;form.elements.neighborhood.required=required;
    form.elements.neighborhood.setCustomValidity(required&&!form.elements.neighborhood.value.trim()?'Escribe el barrio para completar esta dirección.':'');
  }
  $('#products').addEventListener('click',event=>{
    const step=event.target.closest('[data-quantity-step]');if(step){changeQuantity(step);return;}
    const button=event.target.closest('[data-add],[data-open-product]');if(button){openProduct(button.dataset.add||button.dataset.openProduct);return;}
    const card=event.target.closest('[data-product]');if(card&&!event.target.closest('button,input'))openProduct(card.dataset.product);
  });
  $('#product-close').addEventListener('click',()=>$('#product-dialog').close());
  $('#product-dialog').addEventListener('close',()=>{
    if($('#product-dialog').open)return;
    const fallback=$('#products').querySelector('[data-product="'+CSS.escape(activeProductId)+'"] [data-open-product]');
    if(lastProductFocus?.isConnected)lastProductFocus.focus({preventScroll:true});else fallback?.focus({preventScroll:true});activeProductId='';
  });
  $('#product-dialog').addEventListener('click',event=>{
    const button=event.target.closest('[data-detail-step]');if(!button||button.disabled)return;
    detailQuantity=Math.max(1,(Number.isInteger(detailQuantity)?detailQuantity:1)+Number(button.dataset.detailStep));$('#detail-quantity').value=detailQuantity;refreshDetail();pulse($('#detail-quantity'));
  });
  $('#detail-quantity').addEventListener('input',event=>{detailQuantity=Number(event.target.value);refreshDetail();});
  $('#add-product').addEventListener('click',addActiveProduct);
  $('#categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(button){category=button.dataset.category;categories();renderProducts();}});
  $('#search').addEventListener('input',renderProducts);
  document.querySelectorAll('[data-cart-open]').forEach(button=>button.addEventListener('click',openCart));
  $('#cart-close').addEventListener('click',()=>$('#cart-dialog').close());
  $('#cart-dialog').addEventListener('close',()=>lastFocus?.focus());
  $('#cart-items').addEventListener('click',event=>{const step=event.target.closest('[data-quantity-step]');if(step){changeQuantity(step);return;}const button=event.target.closest('[data-remove]');if(button&&!locked()){cart.delete(button.dataset.remove);saveCart();renderCart();refreshProductControls();toast('Producto retirado');}});
  $('#cart-items').addEventListener('input',event=>{
    const field=event.target.closest('[data-quantity]');if(!field||submitting||pending)return;
    const quantity=Number(field.value),row=cart.get(field.dataset.quantity);if(!row)return;
    const valid=Number.isInteger(quantity)&&quantity>=1&&quantity<=10000;
    field.setCustomValidity(valid?'':'Escribe una cantidad entera entre 1 y 10.000.');field.setAttribute('aria-invalid',String(!valid));
    if(!valid){quantityIssues.add(row.id);updateSubmit();return;}
    quantityIssues.delete(row.id);row.quantity=quantity;saveCart();renderCart(false);refreshProductControls();
  });
  $('#confirm-order').addEventListener('click',event=>{
    if(cartStep!=='review')return;event.preventDefault();if(invalidCart()||!connected||locked())return;
    cartStep='details';updateSubmit();$('#cart-dialog .sheet-body').scrollTop=0;form.elements.name.focus({preventScroll:true});
  });
  $('#checkout-back').addEventListener('click',()=>{if(locked())return;cartStep='review';updateSubmit();$('#cart-dialog .sheet-body').scrollTop=0;$('#confirm-order').focus();});
  $('#continue-shopping').addEventListener('click',()=>{$('#cart-dialog').close();$('#catalogo').scrollIntoView({behavior:reducedMotion()?'auto':'smooth'});});
  form.addEventListener('input',event=>{if(['address','neighborhood'].includes(event.target.name))toggleAddress();if(event.target.name==='date')refreshDateBounds();});
  form.addEventListener('change',event=>{if(['mode','address','neighborhood'].includes(event.target.name))toggleAddress();if(event.target.name==='date')refreshDateBounds();});
  form.addEventListener('submit',submit);
  $('#my-orders').addEventListener('click',event=>{if(event.target.closest('[data-recover]'))openCart();});
  $('#refresh-orders').addEventListener('click',()=>void refreshOrders());
  $('#success-close').addEventListener('click',()=>$('#success-dialog').close());
  $('#view-deliveries').addEventListener('click',()=>{$('#success-dialog').close();$('#mis-entregas').scrollIntoView({behavior:'smooth'});});
  $('#new-order').addEventListener('click',()=>{$('#success-dialog').close();$('#catalogo').scrollIntoView({behavior:reducedMotion()?'auto':'smooth'});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshDateBounds();void refreshCatalog();void refreshOrders();}});
  window.addEventListener('online',()=>{void refreshCatalog();void refreshOrders();});
  window.addEventListener('offline',()=>{connected=false;$('#connection').textContent='Sin conexión';$('#connection').classList.add('offline');updateSubmit();});
  window.addEventListener('storage',event=>{if(event.key===keys.orders){saved=load(keys.orders,[]);if(!Array.isArray(saved))saved=[];saved=saved.filter(row=>/^[a-f0-9]{64}$/.test(row?.token)).slice(-50);void refreshOrders();}});
  initDates();
  if(pending){cart.clear();cartStep='details';for(const row of pending.order.items||[])cart.set(row.productId,{id:row.productId,quantity:row.quantity,price:row.unitPrice,name:'Producto de tu pedido pendiente'});for(const name of ['name','phone','mode','address','neighborhood','date','time','notes'])form.elements[name].value=pending.order[name]||'';form.elements.consent.checked=!!pending.order.consent;toggleAddress();$('#checkout-status').textContent='Conservamos tu envío pendiente. Reinténtalo para confirmar la misma programación sin duplicarla.';}
  renderOrders();renderCart();void refreshCatalog();void refreshOrders();
  setInterval(()=>void refreshCatalog(),5000);setInterval(()=>{if(saved.length||pending)void refreshOrders();},30000);
})();
