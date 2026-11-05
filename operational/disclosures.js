/* Remember the user's choice across live renders. Entries are scoped to this page. */
(()=>{
  const choices=new Map();
  function key(details){
    const explicit=details.dataset.disclosureKey;if(explicit)return explicit;
    const owner=details.closest('[data-delivery-card],[data-income-record],[data-movement-id],[data-client-card]');
    const section=details.closest('section[id],dialog[id]')?.id||'page';
    const identity=owner?Object.values(owner.dataset).join('|'):details.closest('article')?.querySelector('h3,h4,strong')?.textContent||'';
    return section+'|'+identity+'|'+details.querySelector(':scope>summary')?.textContent.trim().replace(/\b\d+(?:[.,]\d+)*\b/g,'#');
  }
  document.addEventListener('click',event=>{const summary=event.target.closest('summary');if(!summary||summary.parentElement.tagName!=='DETAILS'||event.defaultPrevented)return;const details=summary.parentElement;choices.set(key(details),!details.open);},true);
  let scheduled=false;
  const restore=()=>{scheduled=false;for(const details of document.querySelectorAll('details')){const id=key(details);if(choices.has(id)&&details.open!==choices.get(id))details.open=choices.get(id);}};
  new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(restore);}}).observe(document.documentElement,{childList:true,subtree:true});
})();
