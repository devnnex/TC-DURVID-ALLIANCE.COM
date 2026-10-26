/* Local working drafts use the same authenticated business/branch/user storage as POS.
   They are never transactions, never synced, and never contain credentials. */
globalThis.AllianceForms = (() => {
  const storage=()=>window.OracleDb?.local, prefix='form-draft:v1:';
  const pending=new Set();let frame=0;
  const schedule=f=>{pending.add(f);if(frame)clearTimeout(frame);frame=setTimeout(flush,120);};
  function flush(){if(frame)clearTimeout(frame);frame=0;for(const f of [...pending])save(f);}
  const excluded=/password|pin|token|secret|credential/i;
  const key=f=>{
    if(!window.OracleDb?.user?.()||f.closest('#loginForm')||f.matches('[data-no-draft]'))return null;
    const section=f.closest('[data-admin-section]')?.id||f.closest('dialog')?.id||'page';
    const record=f.dataset.draftRecord||f.dataset.recordId||f.querySelector('[name=product_id],[name=session_item_id],[name=table_id],[name=session_id]')?.value||'new';
    return prefix+section+':'+(f.dataset.draftKey||f.dataset.command||f.id)+':'+record;
  };
  const controls=f=>[...f.querySelectorAll('input,select,textarea')].filter(c=>c.name&&!excluded.test(c.name)&&!['password','file','hidden','submit','button'].includes(c.type));
  function save(f){pending.delete(f);const k=key(f);if(!k)return;const fields=controls(f).map(c=>({name:c.name,value:c.value,checked:c.checked,rawValue:(c.hasAttribute('data-cop')||c.hasAttribute('data-currency-input'))?window.AllianceMoney?.number(c):undefined}));try{storage().setItem(k,JSON.stringify({at:Date.now(),revision:f.dataset.revision,fields,lines:[...f.querySelectorAll('#costLines .cost-line')].map(l=>({ingredientId:l.querySelector('[name=ingredientId]').value,quantity:l.querySelector('[name=quantity]').value,unit:l.querySelector('[name=unit]').value}))}));f.dataset.draftDirty='true';}catch{/* Keep the live form if device storage is full. */}}
  function restore(f){const k=key(f);if(!k||f.dataset.draftRestored===k)return;f.dataset.draftRestored=k;try{const draft=JSON.parse(storage().getItem(k)||'null');if(!draft)return;if(draft.revision!==undefined&&f.dataset.revision!==undefined)f.dataset.revision=draft.revision;
      const lines=f.querySelector('#costLines');if(lines&&draft.lines&&f.draftLineFactory){lines.querySelectorAll('.cost-line').forEach(l=>l.remove());for(const value of draft.lines.slice(0,100))lines.insertAdjacentHTML('beforeend',f.draftLineFactory(value));}
      const fields=controls(f),used=new Set();for(const value of draft.fields){const i=fields.findIndex((c,n)=>!used.has(n)&&c.name===value.name);if(i<0)continue;used.add(i);const c=fields[i];if(c.type==='checkbox'||c.type==='radio')c.checked=value.checked;else{if(c.tagName==='SELECT'&&value.value&&![...c.options].some(o=>o.value===value.value)){const removed=new Option('La opción guardada ya no está disponible',value.value);removed.disabled=true;c.prepend(removed);}c.value=value.value;}if(c.hasAttribute('data-cop')||c.hasAttribute('data-currency-input')){if(Number.isFinite(value.rawValue))window.AllianceMoney?.set(c,value.rawValue);else{delete c.dataset.rawValue;delete c.dataset.formattedValue;window.AllianceMoney?.edit(c);}}}
      f.dataset.draftDirty='true';f.dataset.dirty='true';
    }catch{}}
  function clear(f){pending.delete(f);const k=key(f);if(k)storage()?.removeItem(k);delete f.dataset.draftDirty;delete f.dataset.dirty;}
  function selectors(root=document){for(const s of root.querySelectorAll('select')){if(s.dataset.searchReady||s.closest('#loginForm')||s.options.length<6||s.name==='unit')continue;s.dataset.searchReady='true';const filter=document.createElement('input');filter.type='search';filter.className='op-select-search';filter.placeholder='Buscar entre las opciones…';filter.setAttribute('aria-label','Buscar opciones de '+(s.closest('label')?.childNodes[0]?.textContent?.trim()||s.name));filter.autocomplete='off';s.before(filter);filter.addEventListener('input',()=>{const q=filter.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();for(const o of s.options)o.hidden=!!o.value&&!o.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);});}}
  function hydrate(root=document){for(const f of root.querySelectorAll('form'))restore(f);selectors(root);}
  document.addEventListener('input',e=>{const f=e.target.closest('form');if(f&&!excluded.test(e.target.name||''))schedule(f);});
  document.addEventListener('click',flush,true);document.addEventListener('submit',flush,true);document.addEventListener('focusout',flush,true);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  document.addEventListener('change',e=>{const f=e.target.closest('form');if(f&&!excluded.test(e.target.name||''))save(f);});
  const originalShow=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){for(const f of this.querySelectorAll('form')){delete f.dataset.draftRestored;restore(f);}return originalShow.call(this);};
  let scheduled=false;document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(records=>{if(scheduled||!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('form,select')||n.querySelector('form,select')))))return;scheduled=true;queueMicrotask(()=>{scheduled=false;hydrate();});}).observe(document.body,{childList:true,subtree:true});});
  return {save,restore,clear,hydrate,selectors,flush};
})();
