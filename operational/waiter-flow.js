/* Guided ordering changes presentation; the durable order and stock rules stay shared. */
globalThis.WaiterFlow=(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>AllianceMoney.format(n,{allowEmpty:false}),minor=n=>Math.round((Number(n)+Number.EPSILON)*100);
  const chevron=collapsed=>'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(collapsed?'m6 9 6 6 6-6':'m6 15 6-6 6 6')+'"/></svg>';
  function amount(items){if(items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.unitPrice)||i.unitPrice<0))return null;return items.reduce((n,i)=>n+minor(i.quantity*i.unitPrice),0)/100;}
  function adjustQuantity(quantity,direction,maximum=10000){
    const cap=Math.max(0,Math.min(10000,maximum??10000)),current=Number.isFinite(quantity)&&quantity>0?quantity:0;
    if(direction<0)return current>1?Math.max(.000001,Number((current-1).toFixed(6))):current||1;
    if(!cap)return null;return Math.min(cap,Number((current+1).toFixed(6)));
  }
  function tableStates(tables,snapshot){
    const docs=snapshot?.docs||{},sessions=(docs.table_sessions||[]).filter(s=>s.status==='open'),lines=docs.session_items||[],requests=(docs.service_requests||[]).filter(r=>r.request_type==='order'&&r.status==='pending');
    return tables.filter(t=>t.is_active!==false).map(table=>{
      const accounts=sessions.filter(s=>s.table_id===table.id),ids=new Set(accounts.map(s=>s.id)),pending=requests.filter(r=>r.table_id===table.id);
      const total=lines.filter(l=>ids.has(l.session_id)&&l.status!=='cancelled').reduce((n,l)=>n+minor(Number(l.quantity)*Number(l.unit_price)),0)/100;
      return {...table,occupied:accounts.length>0,pending:pending.length,total};
    });
  }
  function create({getData,onSave,onStep}){
    let step=1,lastTable='',lastOptions='',checking=false,sentInfo=null;
    const app=document.querySelector('#waiterApp'),layout=app.querySelector('.waiter-layout'),catalog=app.querySelector('.waiter-catalog'),form=app.querySelector('#waiterOrderForm'),tableSelect=form.querySelector('#waiterTable'),history=app.querySelector('.waiter-history');
    document.body.classList.add('waiter-guided');form.noValidate=true;tableSelect.closest('label').hidden=true;
    const nav=document.createElement('nav');nav.className='waiter-step-nav';nav.setAttribute('aria-label','Pasos de la comanda');nav.innerHTML=['Mesa','Productos y cantidades','Revisar y enviar'].map((text,i)=>'<button type="button" data-waiter-step="'+(i+1)+'"><span>'+(i+1)+'</span>'+text+'</button>').join('');layout.before(nav);
    const tables=document.createElement('section');tables.id='waiterTablesStep';tables.className='waiter-tables-step';tables.innerHTML='<div class="waiter-step-heading"><div><span class="eyebrow">ATENCIÓN A LA MESA</span><h2 tabindex="-1">¿Qué mesa vas a atender?</h2><p>Elige una mesa libre o agrega otra comanda a una que ya tiene consumo.</p></div><label>Buscar mesa<input type="search" id="waiterTableSearch" placeholder="Ej. M1 o Terraza" autocomplete="off"></label></div><div class="waiter-tables-count" aria-live="polite"></div><p data-waiter-flow-message role="status"></p><div class="waiter-tables-grid"></div>';layout.before(tables);
    const context=document.createElement('div');context.className='waiter-flow-context';context.innerHTML='<button type="button" data-waiter-step="1">‹ Cambiar mesa</button><strong data-waiter-current-table></strong><button type="button" data-waiter-step="2" data-waiter-edit-products>Editar productos</button>';layout.before(context);
    const review=document.createElement('button');review.type='button';review.id='waiterReviewNext';review.className='primary';review.textContent='Revisar comanda →';form.querySelector('.waiter-total').after(review);
    form.querySelector('#sendWaiterOrder').innerHTML='<i data-lucide="send"></i> Enviar comanda';catalog.querySelector('.eyebrow').textContent='2. PRODUCTOS Y CANTIDADES';
    const send=form.querySelector('#sendWaiterOrder');send.setAttribute('form',form.id);
    const workspace=document.createElement('dialog');workspace.id='waiterConsumptionDialog';workspace.className='modal waiter-consumption-dialog is-compact-consumption';workspace.setAttribute('aria-labelledby','waiterConsumptionTitle');
    workspace.innerHTML='<div class="modal-card waiter-consumption-surface"><header class="waiter-consumption-head"><div><span class="eyebrow">CONSUMO · MESERO</span><h2 id="waiterConsumptionTitle">Agregar a la mesa</h2><small>Tu comanda se agrega a la cuenta cuando el equipo la acepta.</small></div><div class="waiter-consumption-tools"><button type="button" class="icon-btn" data-waiter-step="1" aria-label="Cerrar consumo y volver a mesas"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header><div class="waiter-consumption-footer"></div></div>';
    layout.before(workspace);const surface=workspace.firstElementChild,footer=surface.querySelector('.waiter-consumption-footer');surface.insertBefore(layout,footer);surface.querySelector('.waiter-consumption-tools').prepend(context);footer.innerHTML='<button type="button" class="ghost" data-waiter-step="1">Volver a mesas</button>';footer.append(review,send);surface.insertBefore(document.querySelector('#waiterStatus'),footer);context.querySelector('[data-waiter-edit-products]').textContent='Productos';catalog.querySelector('h2').textContent='Productos para vender';review.textContent='Revisar comanda';
    document.body.classList.add('waiter-workspace-active');
    const categories=document.createElement('nav');categories.id='waiterCategories';categories.className='consumption-categories';categories.setAttribute('aria-label','Categorías de productos');catalog.querySelector('h2').after(categories);document.querySelector('#waiterCategory').closest('label').hidden=true;
    document.querySelector('#waiterSearch').placeholder='Buscar por nombre o siglas (CN)';
    categories.onclick=event=>{const button=event.target.closest('[data-waiter-category]');if(button){const select=document.querySelector('#waiterCategory');select.value=button.dataset.waiterCategory;select.dispatchEvent(new Event('change',{bubbles:true}));}};
    const current=document.createElement('section');current.className='waiter-current-consumption';current.setAttribute('aria-label','Consumo actual de la mesa');current.innerHTML='<header><span><strong>Consumo actual</strong><small data-waiter-current-count></small></span><b data-waiter-current-total></b><button type="button" class="icon-btn consumption-fold" aria-expanded="false" aria-controls="waiterCurrentLines" aria-label="Expandir consumo actual">'+chevron(true)+'</button></header><div id="waiterCurrentLines" hidden></div>';const account=document.createElement('aside');account.className='waiter-account-column';form.before(account);account.append(current,form);
    let currentCollapsed=true,selectionCollapsed=false,lastCurrent='';
    const selectionHead=document.createElement('div');selectionHead.className='waiter-selection-head';const selectionTitle=form.querySelector('h2');selectionTitle.before(selectionHead);selectionHead.append(selectionTitle);const selectionToggle=document.createElement('button');selectionToggle.type='button';selectionToggle.className='icon-btn consumption-fold';selectionToggle.setAttribute('aria-controls','waiterCart');selectionHead.append(selectionToggle);
    function folds(){current.classList.toggle('is-collapsed',currentCollapsed);current.querySelector('#waiterCurrentLines').hidden=currentCollapsed;const button=current.querySelector('button');button.setAttribute('aria-expanded',String(!currentCollapsed));button.setAttribute('aria-label',(currentCollapsed?'Expandir':'Encoger')+' consumo actual');button.innerHTML=chevron(currentCollapsed);form.classList.toggle('is-selection-collapsed',selectionCollapsed);account.classList.toggle('is-selection-collapsed',selectionCollapsed);selectionToggle.setAttribute('aria-expanded',String(!selectionCollapsed));selectionToggle.setAttribute('aria-label',(selectionCollapsed?'Expandir':'Encoger')+' selección actual');selectionToggle.innerHTML=chevron(selectionCollapsed);}
    current.querySelector('button').onclick=()=>{currentCollapsed=!currentCollapsed;folds();};selectionToggle.onclick=()=>{selectionCollapsed=!selectionCollapsed;folds();};folds();
    function renderCurrent(){
      const d=getData(),table=selected();if(!table)return;
      surface.querySelector('#waiterConsumptionTitle').textContent=(step===3?'Revisar pedido de ':'Agregar a ')+(table.table_name||table.name);
      const ids=new Set((d.snapshot?.docs?.table_sessions||[]).filter(s=>s.table_id===table.id&&s.status==='open').map(s=>s.id)),lines=(d.snapshot?.docs?.session_items||[]).filter(l=>ids.has(l.session_id)&&l.status!=='cancelled'),signature=JSON.stringify([table.id,table.total,lines.map(l=>[l.id,l.item_name,l.quantity,l.unit_price])]);
      if(signature!==lastCurrent){lastCurrent=signature;const count=lines.reduce((n,l)=>n+Number(l.quantity||0),0);current.querySelector('[data-waiter-current-count]').textContent=count.toLocaleString('es-CO',{maximumFractionDigits:3})+(count===1?' producto':' productos');current.querySelector('[data-waiter-current-total]').textContent=money(table.total);current.querySelector('#waiterCurrentLines').innerHTML=lines.map(l=>'<div><span>'+esc(l.quantity)+' × '+esc(l.item_name||'Producto')+'</span><strong>'+money(Number(l.quantity)*Number(l.unit_price))+'</strong></div>').join('')||'<small>Sin consumos registrados.</small>';}
    }
    const available=()=>{const d=getData();return tableStates(d.snapshot?.docs?.restaurant_tables||d.bootstrap?.tables||[],d.snapshot);};
    const selected=()=>available().find(t=>t.id===tableSelect.value);
    const message=text=>{tables.querySelector('[data-waiter-flow-message]').textContent=text||'';};
    function renderTables(){
      const d=getData(),all=available(),query=document.querySelector('#waiterTableSearch').value.normalize('NFD').replace(/[\u0300-\u036f\s]/g,'').toLowerCase();
      tables.querySelector('.waiter-tables-count').innerHTML='<span><b>'+all.filter(t=>!t.occupied&&!t.pending).length+'</b> libres</span><span><b>'+all.filter(t=>t.occupied).length+'</b> con cuenta abierta</span>';
      tables.querySelector('.waiter-tables-grid').innerHTML=all.filter(t=>String(t.table_name||t.name).normalize('NFD').replace(/[\u0300-\u036f\s]/g,'').toLowerCase().includes(query)).map(t=>'<button type="button" class="waiter-table '+(t.occupied||t.pending?'is-occupied':'is-free')+'" data-waiter-table="'+esc(t.id)+'" '+(!d.snapshot||d.busy?'disabled':'')+'><i data-lucide="armchair" aria-hidden="true"></i><strong>'+esc(t.table_name||t.name)+'</strong><span>'+(t.occupied?money(t.total):t.pending?'Por aceptar':'Libre')+'</span>'+(t.pending?'<small>'+t.pending+' comanda'+(t.pending===1?'':'s')+' por aceptar</small>':'')+'</button>').join('')||'<p class="waiter-empty">No hay mesas disponibles con ese nombre.</p>';
      if(!d.snapshot)message('Consultando el estado de las mesas…');else if(tables.querySelector('[data-waiter-flow-message]').textContent==='Consultando el estado de las mesas…')message('');
      window.lucide?.createIcons();
    }
    function validQuantities(report=false){
      if(!getData().cart.length||!selected())return false;
      const invalid=[...form.querySelectorAll('[data-quantity]')].find(input=>!input.validity.valid);
      if(invalid){if(report)invalid.reportValidity();return false;}return true;
    }
    function update(){
      const d=getData(),all=available(),signature=JSON.stringify(all.map(t=>[t.id,t.table_name||t.name]));
      if(lastOptions!==signature){const current=tableSelect.value;tableSelect.innerHTML='<option value="">Elige la mesa</option>'+all.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.table_name||t.name)+'</option>').join('');tableSelect.value=all.some(t=>t.id===current)?current:'';lastOptions=signature;}
      context.querySelector('[data-waiter-current-table]').textContent=selected()?.table_name||selected()?.name||'';
      nav.querySelectorAll('button').forEach(button=>{const target=Number(button.dataset.waiterStep);button.disabled=d.busy||target>1&&!selected()||target===3&&!validQuantities();button.classList.toggle('is-active',target===step);if(target===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      review.disabled=d.busy||!validQuantities();context.querySelectorAll('button').forEach(button=>button.disabled=d.busy);
      workspace.querySelector('[aria-label="Cerrar consumo y volver a mesas"]').disabled=d.busy;renderCurrent();
      if(step===1)renderTables();else if(!selected()){show(1,false,true);message('La mesa ya no está disponible. Elige otra para conservar tu comanda.');}
    }
    function show(next,persist=true,force=false){
      if(getData().busy&&!force)return false;if(next>1&&!selected())return false;if(next===3&&!validQuantities(true))return false;
      step=next;tables.hidden=step!==1;context.hidden=step===1;layout.hidden=step===1;catalog.hidden=step!==2;history.hidden=step!==1;layout.classList.toggle('is-review',step===3);
      form.querySelector('#waiterNotes').closest('label').hidden=step!==3;const customer=form.querySelector('.waiter-customer-registration');if(customer)customer.hidden=step!==3;
      review.hidden=step!==2;send.hidden=step!==3;context.querySelector('[data-waiter-edit-products]').hidden=step!==3;
      form.querySelector('h2').textContent=step===2?'Selección actual':'Revisa tu comanda';form.querySelector('.eyebrow').textContent=step===2?'AJUSTA LAS CANTIDADES':'3. CONFIRMA LOS DETALLES';workspace.dataset.step=String(step);
      if(step===3){selectionCollapsed=false;folds();}
      if(step===1){if(workspace.open)workspace.close();currentCollapsed=true;selectionCollapsed=false;folds();}else if(!workspace.open){currentCollapsed=true;selectionCollapsed=false;folds();workspace.showModal();}
      update();onStep?.();if(persist){onSave?.();const heading=step===1?tables.querySelector('h2'):surface.querySelector('#waiterConsumptionTitle');heading.tabIndex=-1;heading.focus({preventScroll:true});}return true;
    }
    workspace.addEventListener('cancel',event=>{event.preventDefault();show(1);});workspace.addEventListener('click',event=>{if(event.target===workspace)show(1);});
    async function choose(id){
      if(getData().busy)return;const previous=tableSelect.value;
      if(previous&&previous!==id&&getData().cart.length&&!await AllianceDialogs.confirm({title:'¿Cambiar la mesa de esta comanda?',message:'Los productos que elegiste pasarán a la nueva mesa.',accept:'Cambiar mesa',cancel:'Conservar mesa'}))return;
      if(!available().some(t=>t.id===id))return;tableSelect.value=id;tableSelect.dispatchEvent(new Event('change',{bubbles:true}));message('');show(2);catalog.querySelector('h2').setAttribute('tabindex','-1');catalog.querySelector('h2').focus({preventScroll:true});
    }
    app.addEventListener('click',event=>{const tile=event.target.closest('[data-waiter-table]'),button=event.target.closest('[data-waiter-step]');if(tile)void choose(tile.dataset.waiterTable);else if(button)show(Number(button.dataset.waiterStep));});
    document.querySelector('#waiterTableSearch').addEventListener('input',renderTables);review.onclick=()=>show(3);
    let dialog=document.createElement('dialog');dialog.id='waiterSuccessDialog';dialog.className='waiter-success-dialog';dialog.setAttribute('aria-labelledby','waiterSuccessTitle');dialog.innerHTML='<div class="waiter-success"><div class="waiter-success-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"></circle><path d="m20 33 8 8 17-19"></path></svg></div><span class="eyebrow">TU TRABAJO, EN SU LUGAR</span><h2 id="waiterSuccessTitle"></h2><p data-waiter-success-message role="status" aria-live="polite"></p><strong data-waiter-success-table></strong><div class="waiter-success-actions"><button type="button" class="primary" data-success-next="tables">Elegir mesa</button><button type="button" class="ghost" data-success-next="same"></button></div></div>';document.body.append(dialog);
    function confirmation(kind,error=''){
      if(!sentInfo||!dialog.open)return;dialog.dataset.state=kind;
      dialog.querySelector('#waiterSuccessTitle').textContent=kind==='confirmed'?'¡Comanda enviada!':kind==='review'?'Tu comanda necesita revisión':navigator.onLine?'Estamos enviando tu comanda':'Comanda guardada';
      dialog.querySelector('[data-waiter-success-message]').textContent=kind==='confirmed'?'El equipo recibirá tu pedido para aceptarlo y prepararlo.':kind==='review'?error||'Los datos siguen guardados. Revisa el estado de sincronización antes de reenviar.':navigator.onLine?'Tu pedido ya está guardado en este equipo y se está sincronizando.':'Se enviará automáticamente cuando vuelva la conexión. Puedes seguir tomando pedidos.';
    }
    async function checkConfirmation(){if(!sentInfo||!dialog.open||checking)return;checking=true;try{const id=sentInfo.operationId,result=await window.AllianceOffline?.operationState?.(id);if(sentInfo?.operationId!==id||!dialog.open)return;if(result?.state==='confirmed')confirmation('confirmed');else if(result?.state==='review')confirmation('review',result.error);else if(result?.state==='pending')confirmation('pending');}catch{/* Keep the saved state if local storage is temporarily unavailable. */}finally{checking=false;}}
    document.addEventListener('alliance-sync-status',()=>void checkConfirmation());window.addEventListener('online',()=>void checkConfirmation());window.addEventListener('offline',()=>void checkConfirmation());
    dialog.addEventListener('click',event=>{const button=event.target.closest('[data-success-next]');if(!button)return;const repeat=button.dataset.successNext==='same';dialog.close();if(repeat&&available().some(t=>t.id===lastTable)){tableSelect.value=lastTable;tableSelect.dispatchEvent(new Event('change',{bubbles:true}));show(2);}else show(1);});
    dialog.addEventListener('close',()=>{sentInfo=null;});
    function sending(info){sentInfo=null;dialog.dataset.state='sending';dialog.querySelector('#waiterSuccessTitle').textContent='Preparando tu comanda';dialog.querySelector('[data-waiter-success-message]').textContent='Guardando los productos y sus cantidades para el equipo.';dialog.querySelector('[data-waiter-success-table]').textContent=info.tableName;dialog.querySelector('.waiter-success-actions').hidden=true;if(!dialog.open)dialog.showModal();}
    function failed(){dialog.close();}
    function sent(info){lastTable=info.tableId;sentInfo=info;tableSelect.value='';show(1,true,true);dialog.querySelector('.waiter-success-actions').hidden=false;dialog.querySelector('[data-waiter-success-table]').textContent=info.tableName;dialog.querySelector('[data-success-next=same]').textContent='Agregar más a '+info.tableName;if(!dialog.open)dialog.showModal();confirmation(info.queued?'pending':'confirmed');void checkConfirmation();}
    function restore(){let draft;try{draft=JSON.parse(localStorage.getItem(getData().draftKey)||'null');}catch{}show(selected()&&(getData().cart.length||new URL(location.href).searchParams.has('mesa'))?(draft?.flowStep===3?3:2):1,false,true);}
    show(1,false,true);return {get step(){return step;},update,restore,review:()=>show(3),sending,failed,sent};
  }
  return {amount,adjustQuantity,tableStates,create};
})();
