/* Online surplus declarations. Only the recipient's acceptance changes inventory. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const identity=()=>{const i=OracleDb.identity?.();return JSON.stringify([i?.endpoint,i?.context?.user?.business_id,i?.location,i?.context?.user?.id]);};
 const allowed=()=>{const i=OracleDb.identity?.(),c=i?.context;return !OracleDb.isDemo&&OracleDb.permission('inventory.write')&&!!c&&(c.is_owner||(c.roles?.[i.location]||[]).some(r=>['BOSS','OWNER'].includes(r)));};
 const money=n=>AllianceMoney.format(n,{allowEmpty:false}),qty=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:8});
 const units=[['g','Gramos'],['kg','Kilogramos'],['ml','Mililitros'],['l','Litros'],['u','Unidades'],['lb','Libras'],['oz','Onzas']];
 let refreshQueued=false;
 let host,scope='',data={targets:[],history:[]},loading=false,busy=false,request=0,draftJob='',draftFingerprint='';
 const operations=new Map();
 function status(message,error=false){const out=host?.querySelector('[data-transfer-status]');if(out){out.textContent=message;out.classList.toggle('is-error',error);out.setAttribute('role',error?'alert':'status');}}
 function current(){return !!host?.isConnected&&scope===identity()&&allowed();}
 function recipients(){const f=host?.querySelector('form');if(!f)return;const destination=data.targets.find(t=>t.id===f.elements.destinationId.value);f.elements.recipientId.innerHTML='<option value="">Selecciona al jefe</option>'+(destination?.bosses||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');if(destination?.bosses.length===1)f.elements.recipientId.value=destination.bosses[0].id;}
 function history(){
  const id=OracleDb.identity?.()?.context?.user?.id,items=data.history||[],pending=items.filter(t=>t.recipientId===id&&t.status==='pending'),other=items.filter(t=>!pending.includes(t));
  const card=t=>{const incoming=t.recipientId===id,pending=incoming&&t.status==='pending',state={pending:'Pendiente de aceptación',accepted:'Aceptado · agregado a la macro',rejected:'Rechazado'}[t.status]||t.status;return '<article class="transfer-card '+(pending?'is-pending':'')+'"><div class="transfer-card-heading"><span>'+esc(incoming?'Recibido de '+t.sourceName:'Enviado a '+t.destinationName)+'</span><small>'+esc(new Date(t.at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}))+'</small></div><h4>'+esc(t.name)+'</h4><p class="transfer-amount">'+qty(t.quantity)+' '+esc(t.unit)+' <span>· '+(t.totalCost==null?'Sin precio · recibido sin costo':money(t.totalCost)+' en total')+'</span></p><p>'+esc(t.senderName)+' → '+esc(t.recipientName)+'</p>'+(t.note?'<p class="transfer-note">'+esc(t.note)+'</p>':'')+'<div class="transfer-card-actions"><strong>'+esc(state)+'</strong>'+(pending?'<div><button type="button" class="ghost" data-transfer-action="reject" data-id="'+esc(t.id)+'">Rechazar</button><button type="button" class="primary" data-transfer-action="accept" data-id="'+esc(t.id)+'">Aceptar en mi macro</button></div>':'')+'</div></article>';};
  host.querySelector('[data-transfer-history]').innerHTML=(pending.length?'<h3>Insumos por recibir <span>'+pending.length+'</span></h3>'+pending.map(card).join(''):'')+'<h3>Historial de los últimos 7 días</h3>'+(other.length?other.map(card).join(''):'<p class="transfer-empty">Los envíos que realices y las respuestas aparecerán aquí.</p>')+(data.hasMore?'<button type="button" class="ghost" data-transfer-more>Ver más envíos de esta semana</button>':'');
 }
 async function refresh(append=false,quiet=false){
  if(!current())return;if(loading||busy){if(quiet)refreshQueued=true;return;}const who=scope,sequence=++request;loading=true;
  try{const result=await OracleDb.networkPos('ingredient_transfer_feed',append?{offset:data.nextOffset}:{},undefined,{fresh:true});if(!current()||who!==scope||sequence!==request)return;data={...result,history:append?[...new Map([...data.history,...result.history].map(t=>[t.id,t])).values()]:result.history};
   const select=host.querySelector('[name=destinationId]'),selected=select.value,person=host.querySelector('[name=recipientId]').value;
   select.innerHTML='<option value="">Selecciona el negocio</option>'+data.targets.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('');if(data.targets.some(t=>t.id===selected))select.value=selected;recipients();if([...host.querySelector('[name=recipientId]').options].some(o=>o.value===person))host.querySelector('[name=recipientId]').value=person;
   history();host.querySelector('[data-transfer-submit]').disabled=!data.targets.length;if(!quiet||!data.targets.length)status(data.targets.length?'': 'No hay otro negocio con un jefe habilitado para recibir insumos.');
  }catch(error){if(current()&&who===scope)status(error.message,true);}finally{if(who===scope){loading=false;if(refreshQueued&&!busy){refreshQueued=false;void refresh(false,true);}}}
 }
 async function execute(action,payload,job){
  if(!current()||busy)return false;if(!navigator.onLine){status('Conéctate a internet para confirmar el envío o su recepción.',true);return false;}
  const who=scope;busy=true;const controls=[...host.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);status('Confirmando…');
  try{await OracleDb.networkPos('ingredient_transfer_'+action,payload,job);if(!current()||who!==scope)return false;return true;}
  catch(error){if(current()&&who===scope)status(error.message,true);return false;}
  finally{if(who===scope){busy=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});if(refreshQueued){refreshQueued=false;void refresh(false,true);}}}
 }
 async function submit(event){
  event.preventDefault();if(!current()||busy)return;const f=event.currentTarget,v=new FormData(f),cost=f.elements.totalCost;
  const payload={destinationId:v.get('destinationId'),recipientId:v.get('recipientId'),name:String(v.get('name')).trim(),quantity:Number(v.get('quantity')),unit:v.get('unit'),totalCost:cost.value.trim()?AllianceMoney.number(cost):null,note:String(v.get('note')||'').trim()};
  if(!payload.name||!Number.isFinite(payload.quantity)||payload.quantity<=0||payload.totalCost!==null&&(!Number.isFinite(payload.totalCost)||payload.totalCost<0)){status('Revisa el nombre, la cantidad y el precio del envío.',true);return;}
  const fingerprint=JSON.stringify(payload);if(fingerprint!==draftFingerprint){draftFingerprint=fingerprint;draftJob=crypto.randomUUID();}
  if(await execute('send',payload,draftJob)){f.reset();draftFingerprint='';draftJob='';await refresh();status('Envío registrado. '+(data.targets.find(t=>t.id===payload.destinationId)?.bosses.find(b=>b.id===payload.recipientId)?.name||'El jefe receptor')+' recibirá el aviso para aceptarlo.');window.AllianceStockInbox?.refresh?.();}
 }
 async function resolve(event){
  if(event.target.closest('[data-transfer-more]')){void refresh(true);return;}const b=event.target.closest('[data-transfer-action]');if(!b||!current()||busy)return;const t=data.history.find(t=>t.id===b.dataset.id);if(!t||t.status!=='pending')return;
  const action=b.dataset.transferAction,key=action+':'+t.id;if(!operations.has(key))operations.set(key,crypto.randomUUID());
  if(await execute(action,{id:t.id},operations.get(key))){await refresh();status(action==='accept'?'Insumo agregado a tu macro. Ya puedes usarlo en tus recetas.':'Envío rechazado. Tu inventario no cambió.');window.AllianceStockInbox?.refresh?.();if(action==='accept'){void window.OperationsPanel?.load?.(true);void window.MaterialsPanel?.refresh?.();void window.AllianceOffline?.prime?.(true);}}
 }
 function mount(root){
  if(!allowed()){root.innerHTML='<p>Esta opción está disponible solo para los jefes con permiso de inventario y conexión al sistema.</p>';return;}
  const who=identity();if(host===root&&scope===who){void refresh();return;}host=root;scope=who;request++;loading=false;busy=false;data={targets:[],history:[]};draftJob='';draftFingerprint='';operations.clear();
  host.innerHTML='<div class="transfer-intro"><span class="transfer-eyebrow">DE UN NEGOCIO A OTRO</span><h3>Dale uso a lo que sobra</h3><p>Declara el sobrante que vas a enviar. El jefe receptor lo revisa y, al aceptarlo, se agrega a su macro de insumos.</p><small>Este registro no descuenta insumos de tu negocio.</small></div><form class="transfer-form" data-no-draft><label class="transfer-wide">¿Qué vas a enviar?<input name="name" required maxlength="160" placeholder="Ej. Pulpa de mango"></label><label>Cantidad o peso<input name="quantity" type="number" inputmode="decimal" min="0.00000001" max="1000000000" step="any" required placeholder="Ej. 500"></label><label>Unidad<select name="unit">'+units.map(([id,name])=>'<option value="'+id+'">'+name+' ('+id+')</option>').join('')+'</select></label><label>Negocio que lo recibe<select name="destinationId" required><option value="">Consultando negocios…</option></select></label><label>Jefe que lo recibe<select name="recipientId" required><option value="">Selecciona primero un negocio</option></select></label><label>Precio total (opcional)<input name="totalCost" data-currency-input inputmode="decimal" placeholder="Sin precio"><small>Vacío: el insumo se recibe sin costo.</small></label><label>Observación (opcional)<input name="note" maxlength="500" placeholder="Ej. Refrigerado, usar hoy"></label><div class="transfer-form-actions transfer-wide"><small>El envío vence a los 7 días si no se acepta.</small><button type="submit" class="primary" data-transfer-submit disabled>Enviar desperdicios</button></div></form><p class="transfer-status" data-transfer-status role="status"></p><div class="transfer-history" data-transfer-history></div>';
  AllianceMoney.bind(host);window.AllianceForms?.hydrate(host);host.querySelector('[name=destinationId]').addEventListener('change',recipients);host.querySelector('form').addEventListener('submit',submit);host.addEventListener('click',resolve);void refresh();
 }
 function reset(){refreshQueued=false;request++;host?.replaceChildren();host=null;scope='';data={targets:[],history:[]};loading=false;busy=false;operations.clear();draftJob='';draftFingerprint='';}
 window.addEventListener('alliance-logout',reset);window.addEventListener('alliance-session-verified',()=>{if(host&&scope!==identity())reset();});
 window.AllianceIngredientTransfers={mount,refresh,refreshPending:()=>refresh(false,true),allowed,reset};
})();
