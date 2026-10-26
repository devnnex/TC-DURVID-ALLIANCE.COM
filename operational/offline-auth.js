/* Offline sign-in for accounts previously verified by servicio seguro on this device. */
globalThis.AllianceOfflineAuth=(()=>{
  const memory=new Map(),prepared=new Set(),latest=new Map(),generations=new Map(),writes=new Map(),ttl=60*86400000,encoder=new TextEncoder();
  const base=()=>ALLIANCE_CONFIG.API_URL.replace(/\/$/,''),storage=()=>AllianceOffline.authStore;
  const name=(business,username)=>'credential:'+base()+':'+business+':'+username.trim();
  const revoked=profile=>'alliance-offline-revoked:'+profile.scope;
  const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
  const bytes=s=>Uint8Array.from(s.match(/../g)||[],v=>parseInt(v,16));
  const aad=profile=>encoder.encode(base()+':'+profile.context.user.business_id+':'+profile.context.user.id);
  async function deviceKey(){const scope='vault:'+base(),stored=await storage().get(scope);if(stored?.key)return stored.key;const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);return storage().once(scope,{scope,key}).then(r=>r.key);}
  async function seal(key,value,associated){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:hex(iv),cipher:hex(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associated},key,value))};}
  const unseal=(key,value,associated)=>crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:associated},key,bytes(value.cipher));
  async function passwordKey(password,salt){const input=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']),bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:600000,hash:'SHA-256'},input,512)),proof=hex(await crypto.subtle.digest('SHA-256',bits.slice(0,32))),raw=bits.slice(32);return {proof,raw,key:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])};}
  // Serialize credential writes so a late refresh cannot undo a logout.
  function write(id,task){const previous=writes.get(id)||Promise.resolve(),next=previous.catch(()=>{}).then(task);writes.set(id,next);return next.finally(()=>{if(writes.get(id)===next)writes.delete(id);});}
  async function persist(profile,key,token,raw){
    const id=profile.context.user.id,generation=generations.get(id)||0,valid=()=>generation===(generations.get(id)||0)&&memory.get(id)?.key===key;
    if(token)profile.renewal=await seal(key,encoder.encode(token),aad(profile));
    const wrapped=raw?await seal(await deviceKey(),raw,aad(profile)):null;
    await write(id,async()=>{
      if(!valid())return;
      const active=OracleDb.user()?.id===id&&localStorage.getItem('tc-alliance-logged-out')!=='1';
      profile.activeWrap=active?wrapped:null;if(!active)profile.requireOnlineLogin=true;
      await storage().put(profile);
      if(!valid())return;
      if(active&&!profile.requireOnlineLogin)localStorage.removeItem(revoked(profile));
      if(active)prepared.add(id);else prepared.delete(id);window.AllianceOffline?.authenticationPrepared();
    });
  }
  async function remember(username,password,data){if(!crypto.subtle)return;const id=data.context.user.id,generation=(generations.get(id)||0)+1;generations.set(id,generation);latest.set(id,data);try{const salt=hex(crypto.getRandomValues(new Uint8Array(16))),derived=await passwordKey(password,salt);if(generations.get(id)!==generation)return;const current=latest.get(id)||data,profile={scope:name(current.context.user.business_slug,current.context.user.username),context:structuredClone(current.context),verifiedAt:Date.now(),salt,proof:derived.proof,requireOnlineLogin:false};memory.set(id,{...derived,profileKey:profile.scope});await persist(profile,derived.key,current.refresh_token,derived.raw);if(generations.get(id)===generation&&latest.get(id)!==current)await cacheSession(latest.get(id));}catch{/* Online login remains valid if local authentication cannot be prepared. */}}
  async function cacheSession(data){
    if(!data?.context?.user)return;const id=data.context.user.id;latest.set(id,data);
    const saved=memory.get(id),generation=generations.get(id)||0;if(!saved)return;
    try{const profile=await storage().get(saved.profileKey);if(!profile||profile.proof!==saved.proof||memory.get(id)!==saved||generation!==(generations.get(id)||0))return;
      profile.context=structuredClone(data.context);profile.verifiedAt=Date.now();profile.requireOnlineLogin=false;
      await persist(profile,saved.key,data.refresh_token,saved.raw);
    }catch{}
  }
  async function restore(context){const id=context.user.id,generation=generations.get(id)||0;try{const profile=await storage().get(name(context.user.business_slug,context.user.username));if(!profile?.activeWrap||Date.now()-profile.verifiedAt>ttl||profile.requireOnlineLogin||localStorage.getItem(revoked(profile)))return null;let saved=memory.get(context.user.id);if(!saved){const raw=new Uint8Array(await unseal(await deviceKey(),profile.activeWrap,aad(profile)));saved={raw,key:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']),profileKey:profile.scope,proof:profile.proof};if(generation!==(generations.get(id)||0)||localStorage.getItem('tc-alliance-logged-out')==='1')return null;memory.set(id,saved);}if(generation!==(generations.get(id)||0)||localStorage.getItem('tc-alliance-logged-out')==='1')return null;const token=profile.renewal?new TextDecoder().decode(await unseal(saved.key,profile.renewal,aad(profile))):null;if(generation!==(generations.get(id)||0))return null;prepared.add(id);return token;}catch{return null;}}
  async function restoreSession(context){const id=context.user.id,generation=generations.get(id)||0,token=await restore(context);if(!token)return null;const profile=await storage().get(name(context.user.business_slug,context.user.username));if(!profile?.activeWrap||profile.requireOnlineLogin||profile.context.user.id!==id||profile.context.user.business_id!==context.user.business_id||generation!==(generations.get(id)||0)||localStorage.getItem(revoked(profile)))return null;return {context:structuredClone(profile.context),refresh_token:token};}
  async function login(business,username,password){const profile=await storage().get(name(business,username));if(!profile||Date.now()-profile.verifiedAt>ttl)throw new Error('Esta cuenta necesita iniciar sesión con internet una vez en este equipo.');const derived=await passwordKey(password,profile.salt);let difference=0;for(let i=0;i<profile.proof.length;i++)difference|=profile.proof.charCodeAt(i)^derived.proof.charCodeAt(i);if(difference)throw new Error('Usuario o contraseña incorrectos.');profile.requireOnlineLogin=!!(profile.requireOnlineLogin||localStorage.getItem(revoked(profile)));memory.set(profile.context.user.id,{...derived,profileKey:profile.scope});let token='';if(profile.renewal&&!profile.requireOnlineLogin)token=new TextDecoder().decode(await unseal(derived.key,profile.renewal,aad(profile)));return {profile,key:derived.key,raw:derived.raw,context:structuredClone(profile.context),refresh_token:token,verifiedAt:profile.verifiedAt,requireOnlineLogin:profile.requireOnlineLogin};}
  async function activate(data){await persist(data.profile,data.key,data.refresh_token,data.raw);}
  async function logout(context){
    if(!context?.user)return;const id=context.user.id;
    generations.set(id,(generations.get(id)||0)+1);latest.delete(id);memory.delete(id);prepared.delete(id);
    // Persist the revocation immediately, including when the page navigates before IndexedDB finishes.
    localStorage.setItem('alliance-offline-revoked:'+name(context.user.business_slug,context.user.username),'1');
    try{await write(id,async()=>{const profile=await storage().get(name(context.user.business_slug,context.user.username));if(profile){profile.activeWrap=null;profile.requireOnlineLogin=true;await storage().put(profile);}});}catch{}
  }
  return {ready:id=>prepared.has(id),remember,cacheSession,restore,restoreSession,login,activate,logout,ttl};
})();
