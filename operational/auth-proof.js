/* SCRAM-SHA-256 key/proof equations over the existing HTTPS JSON transport.
   The password and derived keys stay in memory; only a one-use proof is sent. */
globalThis.AllianceAuthProof=(()=>{
  const encoder=new TextEncoder(),hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),raw=value=>Uint8Array.from(value.match(/../g)||[],v=>parseInt(v,16));
  const digest=value=>crypto.subtle.digest('SHA-256',value);
  async function mac(key,value){const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',imported,value));}
  const same=(a,b)=>a.length===b.length&&a.reduce((n,v,i)=>n|(v^b[i]),0)===0;
  async function login(call,credentials,branch=''){
    credentials={...credentials,business_slug:credentials.business_slug.trim(),username:credentials.username.trim()};
    if(!globalThis.crypto?.subtle)return call('/auth/login',credentials);
    const nonce=hex(crypto.getRandomValues(new Uint8Array(32)));let challenge;
    try{challenge=await call('/auth/login/challenge',{business_slug:credentials.business_slug,username:credentials.username,nonce});}catch(error){if([401,404,405,501].includes(error.status))return call('/auth/login',credentials);throw error;}
    if(challenge?.algorithm==='PASSWORD')return call('/auth/login',credentials);
    if(challenge?.algorithm!=='SCRAM-SHA-256'||challenge.iterations!==600000||!/^\w{8}-[\da-f-]{27}$/i.test(challenge.id||'')||!/^[0-9a-f]{32}$/.test(challenge.salt||'')||!/^[0-9a-f]{128}$/.test(challenge.nonce||'')||!challenge.nonce.startsWith(nonce)||challenge.message!==JSON.stringify([credentials.business_slug,credentials.username,branch,challenge.id,nonce,challenge.nonce,challenge.salt,600000]))throw new Error('No se pudo verificar el acceso seguro. Recarga e intenta nuevamente.');
    const imported=await crypto.subtle.importKey('raw',encoder.encode(credentials.password),'PBKDF2',false,['deriveBits']);
    const salted=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:raw(challenge.salt),iterations:600000,hash:'SHA-256'},imported,256));
    const clientKey=await mac(salted,encoder.encode('Client Key')),storedKey=await digest(clientKey),message=encoder.encode(challenge.message),signature=await mac(storedKey,message),proof=clientKey.map((b,i)=>b^signature[i]),serverKey=await mac(salted,encoder.encode('Server Key'));salted.fill(0);clientKey.fill(0);
    const data=await call('/auth/login/proof',{id:challenge.id,proof:hex(proof)}),expected=await mac(serverKey,message);serverKey.fill(0);proof.fill(0);
    if(!/^[0-9a-f]{64}$/.test(data.server_signature||'')||!same(expected,raw(data.server_signature)))throw new Error('No se pudo verificar la respuesta de acceso.');
    return data;
  }
  return {login};
})();
