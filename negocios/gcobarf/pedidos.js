/* GCOBARF public catalog. Never shares admin credentials or caches inventory offline. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
  const localDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const prettyDay=date=>new Date(date+'T12:00:00-05:00').toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'America/Bogota'});
  const safeImage=value=>{if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value||''))return value;try{const url=new URL(value,location.href);return value&&(url.protocol==='https:'||url.origin===location.origin)?url.href:'';}catch{return '';}};
  const illustrativeImage=row=>{
    const name=String(row.name||'').toLocaleLowerCase('es');
    const type=/mixta|mixto|mezcla/.test(name)?'mixta':/pollo/.test(name)?'pollo':/carne|\bres\b|ternera/.test(name)?'carne':'general';
    return './assets/bolsa-'+type+'-premium.webp';
  };
  const keys={orders:'gcobarf-public-orders-v1',pending:'gcobarf-public-pending-v1'};
  const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  let products=[],category='',cart=new Map(),connected=false,catalogBusy=false,submitting=false,ordersBusy=false,signature='',toastTimer,lastFocus;
  let saved=load(keys.orders,[]);if(!Array.isArray(saved))saved=[];saved=saved.filter(row=>/^[a-f0-9]{64}$/.test(row?.token)).slice(-50);
  let pending=load(keys.pending,null);if(!/^[a-f0-9]{64}$/.test(pending?.token)||!pending?.order)pending=null;
  const receipts=new Map();
  const base=window.ALLIANCE_CONFIG?.API_URL?.replace(/\/$/,'');
  const form=$('#checkout');
  const product=id=>products.find(row=>row.id===id);
  const canBuy=row=>!!row?.available&&row.stock>=1&&row.price>0;
  const count=()=>[...cart.values()].reduce((sum,row)=>sum+row.quantity,0);
  const total=()=>[...cart.values()].reduce((sum,row)=>sum+row.quantity*(product(row.id)?.price??row.price),0);
  const invalidCart=()=>!cart.size||[...cart.values()].some(row=>!canBuy(product(row.id))||row.quantity>product(row.id).stock||!Number.isInteger(row.quantity)||row.quantity<1);
  function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
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
      const available=canBuy(row),selected=cart.get(row.id)?.quantity||0,image=safeImage(row.image),fallback=illustrativeImage(row);
      return '<article class="product-card '+(available?'':'unavailable')+'" data-product="'+esc(row.id)+'"><div class="product-photo"><img src="'+esc(image||fallback)+'" data-fallback="'+esc(fallback)+'" data-product-name="'+esc(row.name)+'" alt="'+esc((image?'':'Imagen ilustrativa de alimento para mascotas · ')+row.name)+'" loading="lazy" decoding="async"><span class="example-photo-label" '+(image?'hidden':'')+'>Imagen ilustrativa</span><small>'+(available?'PARA SU PRÓXIMA COMIDA':'NO DISPONIBLE')+'</small></div><div class="product-info"><small>'+esc(row.category||'GCOBARF')+'</small><h3>'+esc(row.name)+'</h3><p>'+esc(row.description||'Elige las unidades para tu próxima entrega.')+'</p><div class="product-bottom"><strong>'+money(row.price)+'</strong><button class="add-product" data-add="'+esc(row.id)+'" type="button" aria-label="Agregar '+esc(row.name)+'" '+(!available||selected>=row.stock||submitting||pending?'disabled':'')+'>+</button></div><span class="stock-text">'+(available?row.stock+' disponibles'+(selected?' · '+selected+' en tu pedido':''):'Agotado o no disponible')+'</span></div></article>';
    }).join(''):'<p class="empty">'+(products.length?'No encontramos productos con esos filtros.':'GCOBARF aún no tiene productos en su inventario. Vuelve pronto.')+'</p>';
    $('#products').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
      const label=img.parentElement.querySelector('.example-photo-label');label.hidden=false;
      if(img.getAttribute('src')!==img.dataset.fallback){img.src=img.dataset.fallback;img.alt='Imagen ilustrativa de alimento para mascotas · '+img.dataset.productName;}
      else{const message=document.createElement('span');message.className='photo-unavailable';message.textContent='Imagen no disponible';img.replaceWith(message);label.hidden=true;}
    }));
  }
  function updateSubmit(){
    for(const control of form.elements)if(control.id!=='confirm-order')control.disabled=submitting||!!pending;
    $('#confirm-order').disabled=submitting||(!pending&&(!connected||invalidCart()));
    $('#confirm-order').textContent=submitting?'Confirmando tu programación…':pending?'Reintentar envío del pedido →':'Confirmar programación →';
    // A pending request keeps its exact payload until its outcome is known.
    if(pending)$('#confirm-order').disabled=submitting||!navigator.onLine;
  }
  function renderCart(){
    document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=count());
    $('#cart-total').textContent=money(total());
    $('#cart-items').innerHTML=cart.size?[...cart.values()].map(row=>{
      const current=product(row.id),bad=!canBuy(current)||row.quantity>current.stock;
      return '<article class="cart-line"><div><strong>'+esc(current?.name||row.name)+'</strong><small>'+money(current?.price??row.price)+' por unidad</small>'+(bad?'<small class="cart-warning">'+(canBuy(current)?'Solo quedan '+current.stock+' unidades.':'Producto no disponible. Retíralo para continuar.')+'</small>':'')+'</div><input type="number" step="1" min="1" max="'+(current?.stock||1)+'" value="'+row.quantity+'" data-quantity="'+esc(row.id)+'" aria-label="Cantidad de '+esc(current?.name||row.name)+'" '+(submitting||pending?'disabled':'')+'><button type="button" data-remove="'+esc(row.id)+'" aria-label="Quitar '+esc(current?.name||row.name)+'" '+(submitting||pending?'disabled':'')+'>×</button></article>';
    }).join(''):'<p class="empty">Tu pedido está vacío. Elige sus productos favoritos para empezar.</p>';
    updateSubmit();
  }
  async function refreshCatalog(){
    if(catalogBusy||document.hidden)return;catalogBusy=true;
    try{
      const data=await rpc({action:'catalog'});if(!Array.isArray(data.products))throw new Error('El catálogo no está disponible.');
      const changed=signature!==JSON.stringify(data.products),previous=products;products=data.products;signature=JSON.stringify(products);connected=true;
      $('#connection').textContent='Inventario actualizado · en línea';$('#connection').classList.remove('offline');$('#catalog-message').textContent='';
      if(changed){
        const changedPrice=[...cart.values()].some(row=>previous.find(p=>p.id===row.id)?.price!==product(row.id)?.price);
        if(cart.size&&(changedPrice||invalidCart())){
          $('#checkout-status').textContent=invalidCart()?'Cambió la disponibilidad. Revisa las cantidades de tu pedido.':'Se actualizaron los precios. Revisa el total antes de confirmar.';
          toast(invalidCart()?'Cambió la disponibilidad de tu pedido.':'Se actualizó el total de tu pedido.');
        }
        categories();renderProducts();renderCart();
      }else updateSubmit();
    }catch(error){connected=false;$('#connection').textContent='Sin conexión · reintentando';$('#connection').classList.add('offline');$('#catalog-message').textContent='No pudimos actualizar el inventario. Para confirmar tu pedido necesitamos conexión con el negocio.';updateSubmit();}
    finally{catalogBusy=false;}
  }
  function openCart(){lastFocus=document.activeElement;renderCart();$('#cart-dialog').showModal();}
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
        try{const token=pending.token,row=await rpc({action:'status',token});remember(row,token);cart.clear();renderCart();renderProducts();toast('Tu programación quedó confirmada.');}
        catch{/* Retry the original payload if the earlier response was lost. */}
      }
      renderOrders();
    }finally{ordersBusy=false;$('#refresh-orders').disabled=false;}
  }
  function orderPayload(){
    const values=new FormData(form);return {name:values.get('name').trim(),phone:values.get('phone').trim(),mode:values.get('mode'),city:values.get('city').trim(),address:values.get('address').trim(),date:values.get('date'),time:values.get('time'),notes:values.get('notes').trim(),consent:values.get('consent')==='on',items:[...cart.values()].map(row=>({productId:row.id,quantity:row.quantity,unitPrice:product(row.id).price}))};
  }
  async function submit(event){
    event.preventDefault();if(submitting)return;
    if(!pending){
      if(!form.reportValidity()||invalidCart()||!connected)return;
      const order=orderPayload(),when=new Date(order.date+'T'+order.time+':00-05:00');
      if(when<=new Date()){form.elements.time.setCustomValidity('Elige una fecha y hora futuras.');form.elements.time.reportValidity();return;}
      const bytes=crypto.getRandomValues(new Uint8Array(32)),token=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
      try{localStorage.setItem(keys.pending,JSON.stringify({token,order}));pending={token,order};}
      catch{$('#checkout-status').textContent='Permite el almacenamiento de este sitio para conservar la confirmación de tu pedido.';return;}
    }
    submitting=true;$('#checkout-status').textContent='Estamos confirmando tu entrega con GCOBARF…';renderCart();renderProducts();
    try{
      const token=pending.token,row=await rpc({action:'create',token,order:pending.order});
      remember(row,token);cart.clear();$('#checkout-status').textContent='';form.reset();initDates();renderOrders();showSuccess(row);void refreshCatalog();
    }catch(error){
      if(error.status>=400&&error.status<500&&error.code!=='ORDER_CHANGED'){
        localStorage.removeItem(keys.pending);pending=null;$('#checkout-status').textContent=error.message;void refreshCatalog();
      }else $('#checkout-status').textContent='El envío no pudo confirmarse. Pulsa «Reintentar envío del pedido»; consultaremos la misma programación para evitar duplicados.';
      renderOrders();
    }finally{submitting=false;renderCart();renderProducts();}
  }
  function initDates(){
    const tomorrow=new Date(Date.now()+86400000),limit=new Date(Date.now()+365*86400000);
    form.elements.date.min=localDay(new Date());form.elements.date.max=localDay(limit);form.elements.date.value=localDay(tomorrow);form.elements.time.value='09:00';toggleAddress();
  }
  function toggleAddress(){const delivery=form.elements.mode.value==='delivery';$('#address-fields').hidden=!delivery;form.elements.city.required=delivery;form.elements.address.required=delivery;}
  $('#products').addEventListener('click',event=>{
    const button=event.target.closest('[data-add]');if(!button||submitting||pending)return;
    const row=product(button.dataset.add),current=cart.get(row?.id)?.quantity||0;if(!canBuy(row)||current>=row.stock)return;
    cart.set(row.id,{id:row.id,name:row.name,price:row.price,quantity:current+1});renderCart();renderProducts();toast(row.name+' · agregado a tu pedido');
  });
  $('#categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(button){category=button.dataset.category;categories();renderProducts();}});
  $('#search').addEventListener('input',renderProducts);
  document.querySelectorAll('[data-cart-open]').forEach(button=>button.addEventListener('click',openCart));
  $('#cart-close').addEventListener('click',()=>$('#cart-dialog').close());
  $('#cart-dialog').addEventListener('close',()=>lastFocus?.focus());
  $('#cart-items').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(button&&!submitting&&!pending){cart.delete(button.dataset.remove);renderCart();renderProducts();}});
  $('#cart-items').addEventListener('change',event=>{
    const field=event.target.closest('[data-quantity]');if(!field||submitting||pending)return;
    const quantity=Number(field.value),row=cart.get(field.dataset.quantity);if(!row)return;
    if(!Number.isInteger(quantity)||quantity<1){field.setCustomValidity('Escribe un número entero mayor que cero.');field.reportValidity();return;}
    row.quantity=quantity;renderCart();renderProducts();
  });
  form.addEventListener('change',event=>{if(event.target.name==='mode')toggleAddress();if(['date','time'].includes(event.target.name))form.elements.time.setCustomValidity('');});
  form.addEventListener('submit',submit);
  $('#my-orders').addEventListener('click',event=>{if(event.target.closest('[data-recover]'))openCart();});
  $('#refresh-orders').addEventListener('click',()=>void refreshOrders());
  $('#success-close').addEventListener('click',()=>$('#success-dialog').close());
  $('#view-deliveries').addEventListener('click',()=>{$('#success-dialog').close();$('#mis-entregas').scrollIntoView({behavior:'smooth'});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refreshCatalog();void refreshOrders();}});
  window.addEventListener('online',()=>{void refreshCatalog();void refreshOrders();});
  window.addEventListener('offline',()=>{connected=false;$('#connection').textContent='Sin conexión';$('#connection').classList.add('offline');updateSubmit();});
  window.addEventListener('storage',event=>{if(event.key===keys.orders){saved=load(keys.orders,[]);if(!Array.isArray(saved))saved=[];saved=saved.filter(row=>/^[a-f0-9]{64}$/.test(row?.token)).slice(-50);void refreshOrders();}});
  initDates();
  if(pending){for(const row of pending.order.items||[])cart.set(row.productId,{id:row.productId,quantity:row.quantity,price:row.unitPrice,name:'Producto de tu pedido pendiente'});for(const name of ['name','phone','mode','city','address','date','time','notes'])form.elements[name].value=pending.order[name]||'';form.elements.consent.checked=!!pending.order.consent;toggleAddress();$('#checkout-status').textContent='Conservamos tu envío pendiente. Reinténtalo para confirmar la misma programación sin duplicarla.';}
  renderOrders();renderCart();void refreshCatalog();void refreshOrders();
  setInterval(()=>void refreshCatalog(),5000);setInterval(()=>{if(saved.length||pending)void refreshOrders();},30000);
})();
