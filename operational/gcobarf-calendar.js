/* Delivery planning uses the existing account, consumption and payment documents. */
if(window.BRANCH_CONFIG?.slug==='gcobarf')window.GcobarfCalendar=(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const money=n=>AllianceMoney.format(n,{allowEmpty:false});
  let data=null,day=today(),month=day.slice(0,7),saving=false;
  const appointments=()=>data?.docs.table_sessions.filter(s=>s.delivery_date&&s.status!=='cancelled')||[];
  const lines=s=>data?.docs.session_items.filter(i=>i.session_id===s.id&&i.status!=='cancelled')||[];
  const total=s=>AllianceCustomerLedger.appointment(data,s).total;
  const ledger=s=>AllianceCustomerLedger.appointment(data,s);
  const shortDay=d=>d?AllianceCustomerLedger.prettyDay(d):'';
  const methods={cash:'Efectivo',transfer:'Transferencia',breb:'Bre-B',card:'Tarjeta',other:'Otro'};
  function paymentMarkup(a){return a.payments.map(p=>'<div class="ledger-payment"><strong>'+money(p.applied)+' · '+esc(new Date(p.createdAt||p.at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}))+'</strong><p>'+esc((p.payments||[]).map(v=>(methods[v.method]||v.method)+': '+money(v.amount)).join(' · '))+'</p>'+(p.reference?'<p>'+esc(p.reference)+'</p>':'')+'</div>').join('');}
  const canRemove=()=>OracleDb.user()?.role==='boss'&&OracleDb.permission('service.write')&&OracleDb.permission('sales.write');
  const label=date=>new Date(date+'T12:00:00Z').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/Bogota'});
  function summary(){const rows=appointments().filter(s=>s.delivery_date===day);return {tables:rows.length,open:rows.filter(s=>s.status==='open').length,sales:rows.filter(s=>s.status==='open').reduce((n,s)=>n+total(s),0)};}
  function mount(){
    const grid=document.querySelector('#tablesGrid');if(!grid)return;
    const panel=grid.closest('.dashboard-tables-panel');panel.hidden=true;panel.style.display='none';
    if(!document.querySelector('#deliveryCalendar')){const host=document.createElement('section');host.id='deliveryCalendar';host.className='panel delivery-calendar';panel.after(host);}
    const metric=document.querySelector('#metricTables')?.parentElement.querySelector('span');if(metric)metric.textContent='Entregas del día';
    const quick=document.querySelector('[data-delivery-quick]');if(quick){quick.disabled=!(OracleDb.permission('service.write')&&OracleDb.permission('customers.read'));quick.textContent='Calendario de entregas';quick.onclick=()=>document.querySelector('#deliveryCalendar').scrollIntoView({behavior:'smooth',block:'start'});}
    render();
  }
  function render(){
    const host=document.querySelector('#deliveryCalendar');if(!host)return;
    const first=new Date(month+'-01T12:00:00Z'),offset=(first.getUTCDay()+6)%7,count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    const rows=appointments(),selected=rows.filter(s=>s.delivery_date===day).sort((a,b)=>a.delivery_time.localeCompare(b.delivery_time)||a.payer_name.localeCompare(b.payer_name,'es'));
    const cells=Array.from({length:offset},()=>'<span class="delivery-blank" aria-hidden="true"></span>');
    for(let i=1;i<=count;i++){
      const date=month+'-'+String(i).padStart(2,'0'),entries=rows.filter(s=>s.delivery_date===date).map(ledger),pending=entries.some(a=>!a.paid);
      cells.push('<button type="button" data-delivery-day="'+date+'" class="delivery-day compact-table-tile '+(pending?'occupied ':'free ')+(date===day?'is-selected ':'')+(date===today()?'is-today':'')+'" aria-pressed="'+(date===day)+'" aria-label="'+esc(label(date))+', '+entries.length+' entregas"><b>'+i+'</b>'+(entries.length?'<span data-delivery-count="'+entries.length+'">'+entries.length+' entrega'+(entries.length===1?'':'s')+'</span><small>'+entries.slice(0,2).map(a=>'<span class="delivery-customer-name '+(a.paid?'is-paid':'is-pending')+'" style="--customer-color:'+AllianceCustomerLedger.color(a.customerId)+'" title="'+esc(a.customerName+' · '+a.status+(a.paidAt?' · '+shortDay(AllianceCustomerLedger.localDay(a.paidAt)):''))+'"><span>'+esc(a.customerName)+'</span><span class="delivery-payment-status" data-payment-state="'+(a.paid?'paid':'pending')+'">'+esc(a.paid?'Pagado · '+shortDay(AllianceCustomerLedger.localDay(a.paidAt)):a.status)+'</span></span>').join('')+(entries.length>2?'<span class="delivery-overflow">+'+(entries.length-2)+' más</span>':'')+'</small>':'')+'</button>');
    }
    while(cells.length%7)cells.push('<span class="delivery-blank" aria-hidden="true"></span>');
    host.innerHTML='<div class="section-head"><div><span class="eyebrow">Agenda de clientes</span><h2>Entregas programadas</h2><p>Haz clic en un día para consultar y agregar entregas.</p></div><div class="delivery-month-nav"><button type="button" class="ghost" data-delivery-month="-1" aria-label="Mes anterior">‹</button><strong>'+esc(first.toLocaleDateString('es-CO',{month:'long',year:'numeric'}))+'</strong><button type="button" class="ghost" data-delivery-month="1" aria-label="Mes siguiente">›</button><button type="button" class="ghost" data-delivery-today>Hoy</button></div></div><div class="delivery-month-table" tabindex="0" role="region" aria-label="Calendario mensual de entregas"><div class="delivery-week">'+['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="delivery-grid">'+cells.join('')+'</div></div>';
    const unassigned=data?.docs.table_sessions.filter(s=>!s.delivery_date&&s.status==='open')||[];
    if(unassigned.length)host.insertAdjacentHTML('beforeend','<details class="delivery-unassigned"><summary>'+unassigned.length+' cuentas anteriores sin fecha de entrega</summary>'+unassigned.map(s=>'<button type="button" class="ghost" data-delivery-open="'+esc(s.id)+'">'+esc(s.payer_name||s.restaurant_tables?.table_name||'Cuenta anterior')+'</button> <button type="button" class="ghost" data-delivery-edit="'+esc(s.id)+'">Asignar fecha</button>').join('')+'</details>');
    host.onclick=e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.deliveryDay){day=button.dataset.deliveryDay;render();document.dispatchEvent(new CustomEvent('gcobarf-calendar-date'));editor();}else if(button.hasAttribute('data-delivery-new'))editor();else if(button.dataset.deliveryEdit)editor(data.docs.table_sessions.find(s=>s.id===button.dataset.deliveryEdit));else if(button.dataset.deliveryOpen)document.dispatchEvent(new CustomEvent('gcobarf-open-delivery',{detail:{id:button.dataset.deliveryOpen}}));else if(button.dataset.deliveryMonth){const next=new Date(month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+Number(button.dataset.deliveryMonth));month=next.toISOString().slice(0,7);render();}else if(button.hasAttribute('data-delivery-today')){day=today();month=day.slice(0,7);render();document.dispatchEvent(new CustomEvent('gcobarf-calendar-date'));}};
  }
  async function editor(session){
    await window.OperationsPanel?.load(true);const customers=window.OperationsPanel?.data().model.customers.filter(c=>c.active)||[];

    let dialog=document.querySelector('#deliveryDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='deliveryDialog';dialog.className='materials-dialog delivery-dialog';document.body.append(dialog);}
    delete dialog.dataset.choosingPayment;
    dialog.innerHTML='<form data-no-draft><header><div><span class="eyebrow">Agenda de entregas</span><h2>'+(session?'Reprogramar entrega':'Programar entrega')+'</h2></div><button type="button" class="ghost" data-delivery-close>Cerrar</button></header><div class="delivery-dialog-layout"><section class="delivery-day-summary" data-delivery-daily></section><section><h3>Agregar entrega</h3><div class="materials-fields"><label>Fecha de entrega<input type="date" name="date" required value="'+esc(session?.delivery_date||day)+'"></label><label>Hora de entrega<input type="time" name="time" required value="'+esc(session?.delivery_time||'09:00')+'"></label><label class="wide">Cliente<select name="customer" required data-search-ready="true" '+(session?.customer_id&&lines(session).length?'disabled':'')+'><option value="">Selecciona un cliente</option>'+customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label></div><p data-delivery-status role="status"></p><footer><button type="submit" class="primary">Guardar entrega</button></footer></section></div></form>';
    drawAgenda(dialog);const form=dialog.querySelector('form');form.dataset.deliveryEditing=session?.id||'';form.elements.customer.value=session?.customer_id||'';AllianceForms.searchSelect(form.elements.customer,{label:'Buscar y seleccionar cliente',placeholder:'Buscar cliente…'});
    dialog.querySelector('[data-delivery-close]').onclick=()=>dialog.close();
    form.onsubmit=async event=>{event.preventDefault();if(saving||!form.reportValidity())return;const customer=customers.find(c=>c.id===form.elements.customer.value);if(!customer)return;saving=true;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{const value={delivery_date:form.elements.date.value,delivery_time:form.elements.time.value,customer_id:customer.id,payer_name:customer.name};
        const result=session?await OracleDb.from('table_sessions').update(value).eq('id',session.id).select('*').single():await OracleDb.from('table_sessions').insert({id:crypto.randomUUID(),table_id:null,status:'open',sale_channel:'walk_in',assigned_waiter_id:OracleDb.user().id,...value}).select('*').single();
        if(result.error)throw result.error;session=result.data;form.dataset.deliveryEditing=session.id;if(navigator.onLine)await window.AllianceOffline?.confirm();day=value.delivery_date;month=day.slice(0,7);const snapshot=await OracleDb.remote('operations_snapshot');accept(snapshot);document.dispatchEvent(new CustomEvent('gcobarf-calendar-date'));form.querySelector('[data-delivery-status]').textContent='Entrega guardada. Ya puedes agregar consumos o cobrar desde el resumen del día.';
      }catch(error){form.querySelector('[data-delivery-status]').textContent=error.message;}finally{saving=false;button.disabled=false;}
    };if(!OracleDb.permission('service.write')||!OracleDb.permission('customers.read')||!customers.length){form.querySelectorAll('input,select,[type=submit]').forEach(c=>c.disabled=true);form.querySelector('[data-delivery-status]').textContent=customers.length?'Tu rol permite consultar la agenda.':'Registra un cliente activo en Clientes y cartera para programar su entrega.';}dialog.showModal();
  }
  async function removeDelivery(id,dialog){
    if(saving||!canRemove())return;
    const session=appointments().find(s=>s.id===id&&s.status==='open');if(!session)return;
    saving=true;
    try{
      if(!await AllianceDialogs.confirm({title:'Quitar entrega',message:'¿Quitar la entrega de '+session.payer_name+' del '+label(session.delivery_date)+' a las '+session.delivery_time+'?'+(lines(session).length?' Se cancelarán sus consumos sin cobrar.':'')+' El cliente seguirá en Clientes y cartera.',accept:'Quitar entrega'}))return;
      const result=await OracleDb.from('table_sessions').update({status:'cancelled'}).eq('id',id).select('*').single();if(result.error)throw result.error;
      if(navigator.onLine)await window.AllianceOffline?.confirm();
      accept(await OracleDb.remote('operations_snapshot'));document.dispatchEvent(new CustomEvent('gcobarf-calendar-date'));
      if(dialog.querySelector('form')?.dataset.deliveryEditing===id){dialog.close();await editor();}
    }catch(error){dialog.querySelector('[data-delivery-status]').textContent=error.message;}
    finally{saving=false;}
  }
  function drawAgenda(dialog){
    const target=dialog.querySelector('[data-delivery-daily]');if(!target)return;
    const selected=appointments().filter(s=>s.delivery_date===day).sort((a,b)=>a.delivery_time.localeCompare(b.delivery_time));
    const payable=OracleDb.permission('sales.write')?selected.filter(s=>s.status==='open'&&lines(s).length):[],choosing=dialog.dataset.choosingPayment==='true';
    target.innerHTML='<h3>'+esc(label(day))+'</h3><p>'+selected.length+' entregas · '+money(selected.reduce((n,s)=>n+total(s),0))+'</p><div class="delivery-agenda">'+(selected.map(s=>{
      const a=ledger(s),color=AllianceCustomerLedger.color(a.customerId);
      return '<article data-delivery-card="'+esc(s.id)+'" style="--customer-color:'+color+'"><div class="delivery-appointment-top"><time>'+esc(s.delivery_time)+'</time><span class="ledger-badge '+(a.paid?'ledger-paid':'ledger-pending')+'">'+esc(a.status)+'</span></div><div class="delivery-client-balance"><h4>'+esc(s.payer_name)+'</h4><strong>'+money(a.total)+'</strong></div>'+(a.paidAt?'<p class="delivery-paid-date">Pagó el '+esc(shortDay(AllianceCustomerLedger.localDay(a.paidAt)))+'</p>':a.pending?'<p>Pendiente: '+money(a.pending)+'</p>':'')+'<details data-disclosure-key="delivery:'+esc(s.id)+'"><summary>'+a.items.reduce((n,i)=>n+i.quantity,0)+' productos · ver desglose</summary><p>Entrega: '+esc(shortDay(s.delivery_date))+' · '+esc(s.delivery_time)+'</p><ul>'+a.items.map(i=>'<li>'+i.quantity+' × '+esc(i.item_name)+' <b>'+money(i.quantity*i.unit_price)+'</b></li>').join('')+'</ul>'+paymentMarkup(a)+'</details>'+(s.status==='open'?'<div class="delivery-actions"><button type="button" class="primary" data-delivery-open="'+esc(s.id)+'">Agregar / ver productos</button><button type="button" class="ghost" data-delivery-edit="'+esc(s.id)+'">Reprogramar</button>'+(canRemove()?'<button type="button" class="ghost delivery-remove" data-delivery-remove="'+esc(s.id)+'">Quitar entrega</button>':'')+'</div>':a.pending&&a.customerId&&OracleDb.permission('sales.write')?'<button type="button" class="primary" data-customer-charge="'+esc(a.customerId)+'">Pagar / abonar</button>':'')+'</article>';
    }).join('')||'<p>No hay entregas para este día.</p>')+'</div>';
    const title=target.querySelector('h3'),head=document.createElement('div');head.className='delivery-day-head';title.before(head);head.append(title);
    head.insertAdjacentHTML('beforeend','<button type="button" class="primary" '+(payable.length===1?'data-charge-session="'+esc(payable[0].id)+'"':'data-delivery-charge')+(payable.length?'':' disabled')+'>Cobrar</button>');
    if(choosing&&payable.length>1){
      head.insertAdjacentHTML('afterend','<p role="status">Selecciona la entrega que quieres cobrar.</p>');
      for(const s of payable){const card=[...target.querySelectorAll('[data-delivery-card]')].find(c=>c.dataset.deliveryCard===s.id);card.querySelector('.delivery-actions').insertAdjacentHTML('beforeend','<button type="button" class="primary" data-charge-session="'+esc(s.id)+'">Cobrar</button>');}
    }
    target.onclick=e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.customerCharge){dialog.close();App.openCustomerPayment(button.dataset.customerCharge);}else if(button.hasAttribute('data-delivery-charge')){dialog.dataset.choosingPayment='true';drawAgenda(dialog);}else if(button.dataset.deliveryOpen){dialog.close();document.dispatchEvent(new CustomEvent('gcobarf-open-delivery',{detail:{id:button.dataset.deliveryOpen}}));}else if(button.dataset.deliveryEdit)editor(data.docs.table_sessions.find(s=>s.id===button.dataset.deliveryEdit));else if(button.dataset.deliveryRemove)void removeDelivery(button.dataset.deliveryRemove,dialog);};
  }
  function accept(next){if(!next?.docs?.table_sessions)return;data=next;mount();const dialog=document.querySelector('#deliveryDialog');if(dialog?.open)drawAgenda(dialog);}
  document.addEventListener('alliance-operations-updated',e=>accept(e.detail));document.addEventListener('DOMContentLoaded',mount);
  return {accept,mount,summary,selectedDate:()=>day};
})();
