/* Boss-only inbox. Browser permission is requested only from an explicit click. */
(()=>{
 const E=globalThis.AllianceStockAlerts,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const branch=()=>window.BRANCH_CONFIG?.slug;
 let snapshot,alerts=[],button,dialog,config={configured:false},loading=false,subscribed=false,feedAt=0,busy=false,recoveryAt=0;
 const store=()=>window.AllianceBrowserStorage||localStorage;
 const consentKey=()=>{const i=window.OracleDb?.identity?.();return i?.context?.user?.id?'alliance-stock-optin-v1:'+i.endpoint+':'+i.context.user.business_id+':'+i.location+':'+i.context.user.id:'';};
 const remember=value=>{const id=consentKey();if(id){if(value)store().setItem(id,'1');else store().removeItem(id);}};
 const optedIn=()=>!!consentKey()&&store().getItem(consentKey())==='1';
 const endpointHash=async endpoint=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),n=>n.toString(16).padStart(2,'0')).join('');
 const boss=()=>{const db=window.OracleDb;if(!db?.user())return false;if(db.isDemo)return db.user().role==='boss';const i=db.identity?.(),c=i?.context;return db.permission('inventory.read')&&!!c&&(c.is_owner||(c.roles?.[i.location]||[]).some(r=>['BOSS','OWNER'].includes(r)));};
 const support=()=>isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const brand=()=>window.AllianceBrand||{name:window.BRANCH_CONFIG?.name||'Tu negocio',logo:'../../assets/pwa-192.png'};
 function count(){if(!button)return;button.hidden=!boss();button.querySelector('b').textContent=String(alerts.length);button.querySelector('b').hidden=!alerts.length;button.setAttribute('aria-label',alerts.length+' alertas de insumos');}
 function list(){return alerts.length?alerts.map(a=>'<article class="stock-alert-item '+(a.level==='out'?'is-out':'')+'"><span class="stock-alert-state">'+(a.level==='out'?'Agotado':'Por abastecer')+'</span><h3>'+esc(a.name)+'</h3><p>'+esc(E.message(a))+'</p><button type="button" class="ghost small" data-stock-macro>Revisar insumos</button></article>').join(''):'<div class="stock-alert-empty"><strong>Todo al día</strong><p>No hay agotados ni faltantes para la meta de diez unidades en los datos consultados.</p></div>';}
 function render(){count();if(!dialog?.open)return;const b=brand();dialog.querySelector('[data-stock-brand]').textContent=b.name;dialog.querySelector('[data-stock-logo]').src=b.logo;dialog.querySelector('[data-stock-list]').innerHTML=list();
  const enable=dialog.querySelector('[data-stock-enable]');enable.hidden=subscribed;enable.disabled=busy||!support()||!config.configured;
  dialog.querySelector('[data-stock-disable]').hidden=!subscribed;
  dialog.querySelector('[data-stock-push-status]').textContent=!support()?'Este navegador necesita HTTPS y compatibilidad con notificaciones. En iPhone, abre la app instalada.':subscribed?'Notificaciones activadas en este dispositivo. La autorización se conserva al volver a entrar.':config.configured?'Activa los avisos para recibirlos también con la app cerrada.':'Bandeja disponible. El envío al teléfono necesita activar el servicio privado del negocio.';
 }
 async function feed(force=false){if(!boss()||loading||!navigator.onLine||OracleDb.isDemo||!force&&Date.now()-feedAt<30000)return;const who=consentKey();loading=true;try{const result=await OracleDb.networkPos('stock_alert_feed',{},undefined,{fresh:true});if(who!==consentKey()||!boss())return;config=result||{configured:false};if(!snapshot&&Array.isArray(result.alerts))alerts=result.alerts;feedAt=Date.now();}catch{/* Existing installations keep the live local inbox until the additive API is installed. */}finally{loading=false;render();if(who===consentKey())void checkSubscription().catch(()=>{});else if(boss())void feed(true);}}
 async function subscription(){if(!support())return null;const reg=await navigator.serviceWorker.getRegistration(location.href);return reg?.pushManager?.getSubscription();}
 async function checkSubscription(){
  if(!boss()||!support()||busy)return;const who=consentKey();let sub=await subscription();if(busy||who!==consentKey())return;
  const matched=sub&&config.subscriptionKeys?.includes(await endpointHash(sub.endpoint));
  if(who!==consentKey()||!boss())return;
  if(matched){subscribed=true;remember(true);render();return;}
  subscribed=false;
  // Renew an existing, scoped opt-in silently. Permission is never requested here.
  if(config.configured&&Notification.permission==='granted'&&optedIn()&&Date.now()-recoveryAt>60000){
   recoveryAt=Date.now();busy=true;
   try{const reg=await navigator.serviceWorker.getRegistration(location.href);if(!reg)return;const expected=key(config.publicKey),actual=sub?.options?.applicationServerKey;
    if(sub&&actual&&(actual.byteLength!==expected.length||new Uint8Array(actual).some((n,i)=>n!==expected[i]))){await sub.unsubscribe();sub=null;}
    sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:expected});
    if(who!==consentKey()||!boss())return;
    await OracleDb.networkPos('stock_alert_subscribe',{subscription:sub.toJSON()});subscribed=true;remember(true);
   }catch{/* Retain consent and retry later, without interrupting login or prompting again. */}
   finally{busy=false;}
  }
  render();
 }
 function key(value){const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
 async function activate(){if(busy||!boss()||!config.configured||!support())return;const who=consentKey();busy=true;render();try{
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted')throw Error('Las notificaciones no se activaron. Puedes permitirlas desde los ajustes de este sitio.');
   const reg=await navigator.serviceWorker.getRegistration(location.href);if(!reg)throw Error('Termina de instalar la aplicación y vuelve a activar los avisos.');
   const old=await reg.pushManager.getSubscription(),sub=old||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(config.publicKey)});
   if(who!==consentKey()||!boss())throw Error('La sesión cambió. Abre las notificaciones desde tu negocio.');
   try{await OracleDb.networkPos('stock_alert_subscribe',{subscription:sub.toJSON()});}catch(error){if(!old)await sub.unsubscribe();throw error;}
   subscribed=true;remember(true);dialog.querySelector('[data-stock-feedback]').textContent='Notificaciones activadas. La autorización queda guardada en este dispositivo, también al volver a entrar.';
  }catch(error){dialog.querySelector('[data-stock-feedback]').textContent=error.message;}finally{busy=false;render();}}
 async function deactivate(){if(busy)return;busy=true;try{const sub=await subscription();if(sub){await OracleDb.networkPos('stock_alert_unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}subscribed=false;remember(false);dialog.querySelector('[data-stock-feedback]').textContent='Notificaciones desactivadas en este dispositivo.';}catch(error){dialog.querySelector('[data-stock-feedback]').textContent=error.message;}finally{busy=false;render();}}
 async function open(){if(!boss())return;if(!dialog){dialog=document.createElement('dialog');dialog.className='stock-alert-dialog';dialog.id='stockAlertsDialog';dialog.innerHTML='<section><header><img data-stock-logo alt="Logo del negocio" width="48" height="48"><div><small data-stock-brand></small><h2>Insumos al día</h2></div><button type="button" class="icon-btn" data-stock-close aria-label="Cerrar alertas">×</button></header><p class="stock-alert-intro">Qué falta y cuánto reponer. La meta es poder vender al menos diez unidades de cada producto.</p><div data-stock-list class="stock-alert-list"></div><footer><p data-stock-push-status></p><button type="button" class="primary" data-stock-enable>Activar notificaciones</button><button type="button" class="ghost" data-stock-disable hidden>Desactivar notificaciones</button><p data-stock-feedback role="status"></p><small>Recordatorios: 6:30 a. m. y 6:30 p. m., hora de Colombia. Las recetas comparten insumos; sus metas son individuales.</small></footer></section>';document.body.append(dialog);dialog.querySelector('[data-stock-close]').onclick=()=>dialog.close();dialog.querySelector('[data-stock-enable]').onclick=activate;dialog.querySelector('[data-stock-disable]').onclick=deactivate;dialog.addEventListener('click',event=>{if(event.target.closest('[data-stock-macro]')){dialog.close();document.querySelector('.admin-sidebar a[href="#inventory"]')?.click();window.MaterialsPanel?.open();}});}
  dialog.showModal();render();void feed(true).then(checkSubscription);
 }
 function mount(){if(document.body.dataset.page!=='admin')return;button=document.createElement('button');button.type='button';button.className='stock-alert-bell';button.id='stockAlertBell';button.hidden=true;button.innerHTML='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><b hidden>0</b>';button.onclick=open;document.querySelector('.admin-sidebar .brand-lockup')?.append(button);count();if(boss())void feed();}
 document.addEventListener('alliance-operations-updated',event=>{snapshot=event.detail;alerts=boss()?E.analyse(snapshot):[];render();});
 document.addEventListener('alliance-brand-updated',render);window.addEventListener('alliance-session-verified',()=>{count();if(!boss())dialog?.close();else void feed();});
 window.addEventListener('alliance-logout',()=>{alerts=[];snapshot=undefined;config={configured:false};subscribed=false;feedAt=0;recoveryAt=0;dialog?.close();if(button)button.hidden=true;});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&boss())void feed();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
 window.AllianceStockInbox={open};
})();
