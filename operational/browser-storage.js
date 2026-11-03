/* Optional browser metadata must never prevent a verified online sign-in.
   Drafts, pending operations and IndexedDB records are never evicted here. */
globalThis.AllianceBrowserStorage=(()=>{
  const fallback=new Map();
  const disposable=key=>key.startsWith('alliance-pos:')&&(/:qr-thumbnails-v2$/.test(key)||/:la_licorera_17_supabase_bootstrap_v2_/.test(key));
  function prune(qrOnly=false){
    try{
      const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(Boolean);
      for(const key of keys)if(disposable(key)&&(!qrOnly||key.endsWith(':qr-thumbnails-v2')))localStorage.removeItem(key);
    }catch{/* Browser policy can disable Web Storage completely. */}
  }
  function getItem(key){
    if(fallback.has(key))return fallback.get(key);
    try{const value=sessionStorage.getItem('alliance-cache-fallback:'+key);if(value!==null)return value;}catch{}
    try{return localStorage.getItem(key);}catch{return null;}
  }
  function setItem(key,value){
    value=String(value);
    try{localStorage.setItem(key,value);fallback.delete(key);try{sessionStorage.removeItem('alliance-cache-fallback:'+key);}catch{}return true;}catch{}
    prune();
    try{localStorage.setItem(key,value);fallback.delete(key);try{sessionStorage.removeItem('alliance-cache-fallback:'+key);}catch{}return true;}catch{}
    fallback.set(key,value);
    try{sessionStorage.setItem('alliance-cache-fallback:'+key,value);}catch{}
    return false;
  }
  function removeItem(key){
    fallback.set(key,null);
    try{localStorage.removeItem(key);}catch{}
    try{sessionStorage.removeItem('alliance-cache-fallback:'+key);}catch{}
  }
  function setRequiredItem(key,value){
    localStorage.setItem(key,String(value));fallback.delete(key);
    try{sessionStorage.removeItem('alliance-cache-fallback:'+key);}catch{}
  }
  prune(true);
  return {getItem,setItem,removeItem,setRequiredItem};
})();
