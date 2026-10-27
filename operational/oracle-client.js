/* Shared transport for every branch. Database credentials stay in servicio seguro. */
window.OracleDb = (() => {
  const base = window.ALLIANCE_CONFIG.API_URL.replace(/\/$/, '');
  const branch = window.BRANCH_CONFIG.slug;
  let initialBootstrap, access = '', context, renewal, tableCode = new URLSearchParams(location.search).get('mesa') || '';
  const refreshKey = 'alliance-ords-refresh';
  const businessSlug = () => window.ALLIANCE_CONFIG.BUSINESS_SLUG || 'tc-alliance';
  const readRequests=new Map();
  let writeGeneration=0,authGeneration=0,preparedProducts=new Set(),pendingOnlineLogin,cachedSession=false;
  const locationId = () => context?.locations.find(l => l.slug === branch && l.active)?.id;
  const uuid = () => {if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return [...bytes].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');};
  async function request(path, body = {}, retry = true, method = 'POST', selectedLocation) {
    const generation=authGeneration,refreshAtStart=sessionStorage.getItem(refreshKey)||'';
    let response;try{response = await fetch(base + (location.protocol === 'file:' ? '/file/rpc' : '/rpc'), {
      method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({method, path, body, access_token: access,
        refresh_token: refreshAtStart, location_id: selectedLocation || (path.startsWith('/auth/login')?branch:locationId() || '')}),
      keepalive: path === '/auth/logout', signal: AbortSignal.timeout(path==='/auth/refresh'?5000:45000)
    });}catch(error){window.AllianceOffline?.connection(false);throw error;}window.AllianceOffline?.connection(response.ok);
    if (!response.ok) throw new Error('servicio seguro no está disponible. Intenta nuevamente.');
    const result = await response.json();
    if(generation!==authGeneration&&path!=='/auth/refresh')throw Object.assign(new Error('La sesión se cerró.'),{status:401});
    if (result.status === 401 && retry && !path.startsWith('/auth/')) {await renew(false); return request(path, body, false, method, selectedLocation);}
    if (result.status >= 400) {if(path==='/auth/refresh'&&result.status===401&&generation===authGeneration){sessionStorage.removeItem(refreshKey);access='';localStorage.removeItem('tc-alliance-session-view-v1');if(document.body.classList.contains('admin-authenticated'))location.reload();}const e = new Error(result.data?.error?.message || 'No se pudo completar la operación.'); e.status = result.status; throw e;}
    return result.data;
  }
  function apply(data) {
    const same=context?.user?.id===data.context.user.id;if(!data.context.locations.some(l=>l.slug===branch&&l.active)){const e=new Error('Tu usuario no tiene acceso a esta sucursal.');e.status=403;throw e;}
    const previousLogin=same?context.user.last_login_at:undefined;cachedSession=false;access = data.access_token; context = data.context;if(!context.user.last_login_at&&previousLogin)context.user.last_login_at=previousLogin;initialBootstrap=data.bootstrap||(same?initialBootstrap:undefined);readRequests.clear();preparedProducts=new Set(data.bootstrap?.preparedProductIds||(same?[...preparedProducts]:[]));
    void window.AllianceOffline?.prime(true);void window.AllianceOfflineAuth?.cacheSession(data);
    const businessInput=document.querySelector('#loginForm [name="business"]');if(businessInput)businessInput.value='TC-DURVID';
    sessionStorage.setItem(refreshKey, data.refresh_token);
    localStorage.setItem('tc-alliance-session-view-v1', JSON.stringify({context, provider:'oracle-ords', validated_at:Date.now()}));
    localStorage.removeItem('tc-alliance-logged-out');
    if (!locationId()) throw new Error('Tu usuario no tiene acceso a esta sucursal.');
    localStorage.setItem('alliance-selected-branch',locationId());
    window.dispatchEvent(new CustomEvent('alliance-session-verified'));
    return user();
  }
  function revoke(token,refreshToken='') {
    return fetch(base+(location.protocol==='file:'?'/file/rpc':'/rpc'),{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'POST',path:'/auth/logout',body:{},access_token:token,refresh_token:refreshToken,location_id:locationId()||''})}).catch(()=>{});
  }
  async function renew(allowOffline=true) {
    // Resume only an active, encrypted, previously verified device session. Fresh
    // logins still wait for server validation; protected network calls await renewal.
    if(allowOffline&&navigator.onLine&&!access&&!cachedSession&&!pendingOnlineLogin&&window.AllianceOffline){const generation=authGeneration,saved=await AllianceOffline.restoreContext();if(generation!==authGeneration)throw Object.assign(new Error('La sesión se cerró.'),{status:401});if(saved){cachedSession=true;context=saved.context;initialBootstrap=saved.bootstrap;preparedProducts=new Set(saved.bootstrap.preparedProductIds||[]);if(saved.refresh_token)sessionStorage.setItem(refreshKey,saved.refresh_token);void renew(false).catch(error=>{if(generation===authGeneration&&[401,403].includes(error.status)){void window.AllianceOfflineAuth?.logout(context);access='';context=undefined;sessionStorage.removeItem(refreshKey);localStorage.removeItem('tc-alliance-session-view-v1');localStorage.setItem('tc-alliance-logged-out','1');location.reload();}});return user();}}

    if(!navigator.onLine&&allowOffline&&window.AllianceOffline){const saved=await AllianceOffline.restoreContext();if(saved){cachedSession=true;context=saved.context;if(saved.refresh_token)sessionStorage.setItem(refreshKey,saved.refresh_token);initialBootstrap=saved.bootstrap;preparedProducts=new Set(saved.bootstrap.preparedProductIds||[]);return user();}throw new Error('Esta sucursal necesita una sesión reciente con conexión antes de trabajar sin internet.');}

    if(pendingOnlineLogin){const credentials=pendingOnlineLogin,generation=authGeneration;const data=await AllianceAuthProof.login((path,body)=>{if(generation!==authGeneration)throw Object.assign(new Error('La sesión se cerró.'),{status:401});return request(path,body,false);},credentials,branch);if(generation!==authGeneration){void revoke(data.access_token,data.refresh_token);throw Object.assign(new Error('La sesión se cerró.'),{status:401});}pendingOnlineLogin=undefined;return apply(data);}
    if(!sessionStorage.getItem(refreshKey)&&window.AllianceOffline){const saved=await AllianceOffline.restoreContext(true);if(saved?.refresh_token)sessionStorage.setItem(refreshKey,saved.refresh_token);}
    if(!sessionStorage.getItem(refreshKey))throw new Error('Inicia sesión para continuar.');
    if (!renewal) {
      const generation=authGeneration;
      const pending=request('/auth/refresh', {}, false).then(data=>{if(generation!==authGeneration){void revoke(data.access_token,data.refresh_token);throw Object.assign(new Error('La sesión se cerró.'),{status:401});}return apply(data);}).catch(async error=>{if(allowOffline&&generation===authGeneration&&(!error.status||error.status>=500)){const saved=await window.AllianceOffline?.restoreContext();if(saved){cachedSession=true;context=saved.context;initialBootstrap=saved.bootstrap;preparedProducts=new Set(saved.bootstrap.preparedProductIds||[]);return user();}}throw error;}).finally(()=>{if(renewal===pending)renewal=undefined;});
      renewal=pending;
    }
    return renewal;
  }
  async function offlineLogin(payload){const cached=await AllianceOfflineAuth.login(businessSlug(),payload.username,payload.pin);cachedSession=true;context=cached.context;access='';if(!locationId())throw new Error('Esta cuenta no tiene acceso a la sucursal.');const bootstrap=await AllianceOffline.bootstrapFor(cached.context);if(!bootstrap)throw new Error('Abre esta sucursal con internet una vez para descargar sus datos.');initialBootstrap=bootstrap;preparedProducts=new Set(bootstrap.preparedProductIds||[]);if(cached.refresh_token)sessionStorage.setItem(refreshKey,cached.refresh_token);else sessionStorage.removeItem(refreshKey);pendingOnlineLogin=cached.requireOnlineLogin?{business_slug:businessSlug(),username:payload.username,password:payload.pin}:undefined;localStorage.setItem('tc-alliance-session-view-v1',JSON.stringify({context,provider:'oracle-ords',validated_at:cached.verifiedAt}));localStorage.removeItem('tc-alliance-logged-out');await AllianceOfflineAuth.activate(cached);return {token:'offline-session',user:user()};}
  function user() {
    if(!context)return null;
    const p = context?.permissions?.[locationId()] || [];
    const map = {dashboard:'home.read', service:'service.read', accounts:'accounts.read', tips:'sales.read', inventory:'inventory.read', costing:'inventory.read', movements:'movements.read', income:'sales.read', assistant:'assistant.read', menu:'tables.manage', brand:'brand.manage', users:'administration.manage',supplies:'supplies.read',kitchen:'kitchen.read',customers:'customers.read',cash:'cash.read'};
    const owner = !!context.is_owner || p.includes('sales.manage'),roles=context.roles?.[locationId()]||[];
    return {id:context.user.id, full_name:context.user.name, username:context.user.username,last_login_at:context.user.last_login_at,
      role:owner?'boss':roles.includes('WORKER')?'worker':roles.includes('ADMIN')||p.includes('administration.manage')?'admin':p.includes('kitchen.write')&&!p.includes('service.write')?'kitchen':p.some(c=>['sales.write','inventory.read','movements.read','brand.manage','products.write','sales.read'].includes(c))?'admin':'waiter', is_active:true, business_slug:context.user.business_slug,
      permissions:Object.keys(map).filter(k=>k==='users'||p.includes(map[k]))};
  }
  const permission = code => (context?.permissions?.[locationId()]||[]).includes(code);
  async function pos(action, payload = {}, operationId, skipLocal=false,metadata={}) {
    const isPublic = document.body.dataset.page !== 'admin';
    if (isPublic) return (await request('/pos/public', {action,payload,business_slug:context?.user?.business_slug || new URLSearchParams(location.search).get('business') || 'tc-alliance',branch_slug:branch,table_code:payload.table_access_code || tableCode})).value;
    if (!access&&!(cachedSession&&context&&!skipLocal)) await renew(!skipLocal);
    if(!isPublic&&!skipLocal&&window.AllianceOffline?.canHandle(action,payload))return AllianceOffline.execute(action,payload,operationId,()=>pos(action,payload,operationId,true));
    const body = {action, payload,...metadata}; if(operationId) body.operation_id = operationId;
    const isRead=['customer_history','orders_revision','getAdminSnapshot','get_inventory','get_income_report','get_inventory_movements','costing_load','costing_product_load','operations_snapshot','operations_device','getEvents','status','remote_bootstrap','listChatMessages'].includes(action)||(action==='query'&&payload.op==='select');
    if(!isRead){writeGeneration++;readRequests.clear();try{return (await request('/pos',body)).value;}finally{writeGeneration++;readRequests.clear();}}
    const key=locationId()+':'+writeGeneration+':'+JSON.stringify(body);let entry=readRequests.get(key);
    if(!entry||Date.now()-entry.at>1000){entry={at:Date.now(),promise:request('/pos',body).then(r=>r.value)};readRequests.set(key,entry);entry.promise.catch(()=>{if(readRequests.get(key)===entry)readRequests.delete(key);});if(readRequests.size>80)readRequests.delete(readRequests.keys().next().value);}
    return structuredClone(await entry.promise);
  }
  async function networkBatch(operations,expected){const same=()=>!expected||context?.user?.id===expected.user&&context?.user?.business_id===expected.business&&locationId()===expected.location;if(!same())throw new Error('La sesión cambió.');if(!access)await renew(false);if(!same())throw new Error('La sesión cambió.');writeGeneration++;readRequests.clear();try{return await request('/pos/batch',{operations});}finally{writeGeneration++;readRequests.clear();}}
  const result = async fn => {try {return {data:await fn(), error:null};} catch(error) {return {data:null,error};}};
  class Query {
    constructor(table){this.body={table,op:'select',filters:[]};this.orders=[];}
    select(){return this;}
    eq(field,value){this.body.filters.push({field,op:'eq',value});return this;}
    neq(field,value){this.body.filters.push({field,op:'neq',value});return this;}
    in(field,value){this.body.filters.push({field,op:'in',value});return this;}
    is(field,value){this.body.filters.push({field,op:'is',value});return this;}
    order(field,options={}){this.orders.push({field,ascending:options.ascending!==false});return this;}
    limit(n){this.max=n;return this;}
    single(){this.body.single='single';return this;}
    maybeSingle(){this.body.single='maybeSingle';return this;}
    insert(values){this.body.op='insert';this.body.values=values;return this;}
    update(values){this.body.op='update';this.body.values=values;return this;}
    upsert(values){this.body.op='upsert';this.body.values=values;return this;}
    delete(){this.body.op='delete';return this;}
    then(resolve,reject){return result(async()=>{
      let data;
      data=await pos('query',this.body,this.body.op==='select'?undefined:uuid());
      if(Array.isArray(data)){for(const {field,ascending} of [...this.orders].reverse()) data.sort((a,b)=>(typeof a[field]==='number'?a[field]-b[field]:String(a[field]||'').localeCompare(String(b[field]||'')))*(ascending?1:-1));if(this.max)data=data.slice(0,this.max);}
      return data;
    }).then(resolve,reject);}
  }
  const local = {
    getItem(key){if(key.includes('admin_token')){if(sessionStorage.getItem(refreshKey))return 'oracle-session';if(localStorage.getItem('tc-alliance-logged-out')!=='1'){try{const saved=JSON.parse(localStorage.getItem('tc-alliance-session-view-v1')||'null');if(saved?.provider==='oracle-ords'&&Date.now()-saved.validated_at<(window.AllianceOfflineAuth?.ttl||7*86400000))return 'offline-session';}catch{}}return '';}if(key.includes('credentials'))return null;return localStorage.getItem(this.key(key));},
    setItem(key,value){if(key.includes('admin_token')||key.includes('credentials'))return;localStorage.setItem(this.key(key),value);},
    removeItem(key){if(key.includes('admin_token')){sessionStorage.removeItem(refreshKey);access='';return;}localStorage.removeItem(this.key(key));},
    key(key){return 'alliance-pos:'+ (context?.user?.business_id || businessSlug()) +':'+ (locationId() || branch) +':'+ (context?.user?.id || 'client-'+tableCode) +':'+key;}
  };
  function channel(name){
    const listeners=[],seen=new Set();let timer,busy=false,closed=false;
    const poll=async()=>{if(busy||closed||document.hidden||!navigator.onLine)return;busy=true;try{const result=await pos('getEvents',{channel:name});for(const event of result.events||[]){if(seen.has(event.id))continue;seen.add(event.id);for(const listener of listeners)if(listener.event===event.event)listener.callback({payload:event.payload});}if(seen.size>1000){seen.clear();for(const event of result.events||[])seen.add(event.id);}}catch{/* Durable messages and snapshots have their own polling. */}finally{busy=false;}};
    return {on(type,filter,callback){if(type==='broadcast')listeners.push({event:filter.event,callback});return this;},
      subscribe(fn){fn?.('SUBSCRIBED');timer=setInterval(poll,1200);void poll();return this;},
      async send(event){try{await pos('broadcast',{channel:name,event:event.event,payload:event.payload});return {status:'ok'};}catch{return {status:'error'};}},
      async unsubscribe(){closed=true;clearInterval(timer);}};
  }
  const images=new Map();
  const imageStore={
    upload:async(path,file)=>{
      try{
        if(!permission('brand.manage'))throw new Error('No tienes permiso para cambiar la marca.');
        if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024)throw new Error('Elige una imagen PNG, JPEG o WebP de hasta 15 MB.');
        const image=new Image(),objectUrl=URL.createObjectURL(file);
        try{image.src=objectUrl;await image.decode();const canvas=document.createElement('canvas');const scale=Math.min(1,1200/image.width,1200/image.height);canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);let value=canvas.toDataURL('image/webp',0.8);if(value.length>300000)value=canvas.toDataURL('image/webp',0.45);if(value.length>450000)throw new Error('La imagen sigue siendo demasiado grande. Reduce su tamaño.');images.set(path,value);}finally{URL.revokeObjectURL(objectUrl);}
        return {data:{path},error:null};
      }catch(error){return {error};}
    },
    getPublicUrl:path=>({data:{publicUrl:images.get(path)||''}})
  };
  async function adminRequest(path,options={},selectedLocation){
    const personal=(options.method||'GET').toUpperCase()==='GET'&&path==='/context'||['GET','PUT'].includes((options.method||'GET').toUpperCase())&&path==='/account';
    if(!personal&&!permission('administration.manage'))throw new Error('Solo el jefe administrador puede gestionar usuarios.');
    if(selectedLocation&&selectedLocation!==locationId())throw new Error('Gestiona los usuarios desde el negocio correspondiente.');
    selectedLocation=locationId();
    const method=(options.method||'GET').toUpperCase();
    const valid=personal||method==='GET'&&path==='/admin/overview'||method==='POST'&&['/admin/users','/admin/activity','/activity/visit'].includes(path)||method==='PUT'&&/^\/admin\/users\/[0-9a-f-]{36}$/i.test(path);
    if(!valid)throw new Error('Operación de administración no permitida.');
    if(!navigator.onLine)throw new Error('Conéctate a internet para consultar o cambiar usuarios y permisos en servicio seguro. Tus otras secciones pueden seguir trabajando sin conexión.');
    if(!access)await renew(false);
    if(options.signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
    const payload=options.body?JSON.parse(options.body):{};
    const result=await request(path,payload,true,method,selectedLocation);
    if(path==='/account'&&method==='PUT'&&(payload.password||payload.username!==context?.user?.username))await window.AllianceOfflineAuth?.logout(context);
    if(path==='/context'){if(result.user?.id===context?.user?.id&&!result.user.last_login_at)result.user.last_login_at=context.user.last_login_at;context=result;localStorage.setItem('tc-alliance-session-view-v1',JSON.stringify({context,provider:'oracle-ords',validated_at:Date.now()}));window.dispatchEvent(new CustomEvent('alliance-session-verified'));}
    return result;
  }
  return {adminRequest,networkBatch,identity:()=>({context,user:user(),location:locationId(),endpoint:base}),networkPos:(a,p={},id,metadata={})=>pos(a,p,id,true,metadata),networkVisit:(section,metadata={})=>request('/activity/visit',{section,...metadata}),isPrepared:id=>preparedProducts.has(id),setPreparedProducts:ids=>{preparedProducts=new Set(ids);},offlineStatus:()=>window.AllianceOffline?.status(),takeInitialBootstrap:()=>{const data=initialBootstrap;initialBootstrap=undefined;return data;},init:()=>true,from:table=>new Query(table),storage:{from:()=>imageStore},
    channel,removeChannel:c=>c?.unsubscribe(),setAuthToken:()=>{},setTableAccess:(_id,code)=>{tableCode=code;},local,
    remote:(action,payload={},operationId)=>pos(action==='bootstrap'?'remote_bootstrap':action,payload,operationId || (['customer_history','get_inventory','get_inventory_movements','get_income_report','status','bootstrap','costing_load','costing_product_load','operations_snapshot'].includes(action)?undefined:uuid())),
    rpc:(name,payload={})=>result(async()=>{
      if(name==='login'){if(!navigator.onLine&&window.AllianceOfflineAuth)return offlineLogin(payload);try{const generation=authGeneration,credentials={business_slug:businessSlug(),username:payload.username,password:payload.pin};const data=await AllianceAuthProof.login((path,body)=>{if(generation!==authGeneration)throw Object.assign(new Error('La sesión se cerró.'),{status:401});return request(path,body,false);},credentials,branch);if(generation!==authGeneration){void revoke(data.access_token,data.refresh_token);throw Object.assign(new Error('La sesión se cerró.'),{status:401});}const current=apply(data);void window.AllianceOfflineAuth?.remember(payload.username,payload.pin,data);return {token:'oracle-session',user:current};}catch(error){if(window.AllianceOfflineAuth&&(!error.status||error.status>=500))return offlineLogin(payload);throw error;}}
      if(name==='getCurrentUser')return await renew();
      if(name==='logout'){window.AllianceForms?.flush?.();void window.AllianceOfflineAuth?.logout(context);pendingOnlineLogin=undefined;const token=access,refreshToken=sessionStorage.getItem(refreshKey)||'';authGeneration++;renewal=undefined;sessionStorage.removeItem(refreshKey);access='';context=undefined;readRequests.clear();localStorage.removeItem('tc-alliance-session-view-v1');localStorage.setItem('tc-alliance-logged-out','1');void revoke(token,refreshToken);return true;}
      if(name==='listUsers')return [user()];
      return pos(name==='getBootstrapData'?'bootstrap':name,payload);
    }), trackSection:section=>!navigator.onLine&&window.AllianceOffline?AllianceOffline.visit(section):access?request('/activity/visit',{section}):Promise.resolve(), user, locationId, permission
  };
})();
