/* Remember the user's choice across live renders. Entries are scoped to this page. */
(()=>{
  const choices=new Map(),keys=new WeakMap();
  function key(details){
    const explicit=details.dataset.disclosureKey;if(explicit)return explicit;
    if(keys.has(details))return keys.get(details);
    const owner=details.closest('[data-disclosure-owner],[data-delivery-card],[data-income-record],[data-movement-id],[data-client-card],[data-product-id]')||details.closest('article,tr');
    const section=details.closest('section[id],dialog[id]')?.id||'page';
    const attribute=owner&&['data-disclosure-owner','data-delivery-card','data-income-record','data-movement-id','data-client-card','data-product-id'].find(a=>owner.hasAttribute(a));
    const identity=attribute?attribute+':'+owner.getAttribute(attribute):owner?.querySelector('h3,h4,strong,th,td')?.textContent.trim()||'';
    const peers=[...(owner||details.parentElement).querySelectorAll('details')];
    const id=section+'|'+identity+'|'+details.querySelector(':scope>summary')?.textContent.trim().replace(/\b\d+(?:[.,]\d+)*\b/g,'#')+'|'+peers.indexOf(details);
    keys.set(details,id);return id;
  }
  document.addEventListener('click',event=>{const summary=event.target.closest('summary');if(!summary||summary.parentElement.tagName!=='DETAILS'||event.defaultPrevented)return;const details=summary.parentElement;choices.set(key(details),!details.open);},true);
  const restore=details=>{const id=key(details);if(choices.has(id)&&details.open!==choices.get(id))details.open=choices.get(id);};
  // Changes to counters, currency and icons never scan the whole document.
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches('details'))restore(node);node.querySelectorAll('details').forEach(restore);}}).observe(document.documentElement,{childList:true,subtree:true});
})();
