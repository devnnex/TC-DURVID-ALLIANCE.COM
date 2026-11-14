/* Cache public application files only. API requests and account data never enter this cache. */
const BUILD_VERSION='805ad39ac8958ab95a1c9750';
const ROOT=new URL(self.location.pathname.includes('/negocios/')?'../../':'./',self.location.href);
const CACHE_PREFIX='alliance-portal-'+encodeURIComponent(ROOT.pathname)+':';
const PORTAL_CACHE=CACHE_PREFIX+BUILD_VERSION;
const DEVELOPMENT=['localhost','127.0.0.1','[::1]'].includes(ROOT.hostname);
const PUBLIC_ASSETS=['index.html','portal.css','brand.css','pwa.js','api-config.js','open-local.js','assets/logo.png','assets/pwa-192.png','assets/pwa-512.png','operational/waiter-flow.js','operational/waiter-flow.css',
  'operational/team/team-panel.js','operational/team/team-panel.css','operational/operations-engine.js','operational/customer-ledger.js','operational/disclosures.js','operational/pos-local.js','operational/orders-local.js','operational/orders-panel.js','operational/waiter.js','operational/waiter.css','operational/auth-proof.js','operational/browser-storage.js','operational/performance.js','operational/dialogs.js','operational/offline.js','operational/offline-auth.js','operational/forms.js','operational/selectors.js','operational/selectors.css','operational/gcobarf-calendar.js','operational/gcobarf-calendar.css','operational/operations.js','operational/operations.css','operational/sales-range.js','operational/app.js','operational/style.css','operational/currency.js','operational/activity.js','operational/oracle-client.js','operational/demo-client.js','operational/ingredient-yield.js','operational/ingredient-yield.css','operational/materials-engine.js','operational/production-engine.js','operational/materials.js','operational/materials.css','operational/jespresso-engine.js','operational/jespresso-templates.js','operational/jespresso.js','operational/jespresso.css','operational/costing.js','operational/costing-engine.js','operational/login-feedback.js','operational/login.js','operational/vendor/lucide.js','operational/vendor/qrcode.js','operational/vendor/jspdf.js','operational/vendor/xlsx.js'];
for(const branch of ['gcobarf','cocteleria','cafeteria','sucursal'])PUBLIC_ASSETS.push('negocios/'+branch+'/admin.html','negocios/'+branch+'/index.html','negocios/'+branch+'/config.js','negocios/'+branch+'/manifest.webmanifest','negocios/'+branch+'/pwa-icon.svg');
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(PORTAL_CACHE);await Promise.all(PUBLIC_ASSETS.map(async path=>{try{const url=new URL(path,ROOT),versioned=new URL(url);versioned.searchParams.set('v',BUILD_VERSION);const response=await fetch(versioned,{cache:'reload'});if(response.ok)await cache.put(url,response);}catch{}}));await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  let legacy=false;
  for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==PORTAL_CACHE){const previous=await caches.open(key),page=await previous.match(new URL('index.html',ROOT));if(page&&!(await page.text()).includes('name="alliance-build"'))legacy=true;await caches.delete(key);}
  await self.clients.claim();
  // One migration reload releases pages controlled by the former cache-first worker.
  // Later builds fetch fresh code on navigation without reloading people while they work.
  if(legacy&&!DEVELOPMENT){try{const online=await fetch(new URL('index.html',ROOT),{cache:'no-store'});if(online.ok)for(const client of await self.clients.matchAll({type:'window'}))if(client.url.startsWith(ROOT.href))void client.navigate(client.url).catch(()=>{});}catch{}}
})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.pathname.includes('/api/')||url.pathname.includes('/ords/'))return;
  // Preserve the existing branch manifest/icons generated from its public branding.
  if(['pwa-manifest.webmanifest','pwa-icon-192.png','pwa-icon-512.png'].includes(url.pathname.split('/').at(-1))){
    event.respondWith((async()=>{
      const key=new URL(url);key.search='';const version=url.searchParams.get('v');
      const folder=url.pathname.slice(ROOT.pathname.length).split('/')[1];
      for(const name of await caches.keys()){
        if(!name.startsWith('alliance-')||!name.endsWith('-pwa-brand-v1'))continue;
        const cache=await caches.open(name),saved=await cache.match(key);if(!saved)continue;
        if(folder!=='sucursal'&&name==='alliance-'+folder+'-pwa-brand-v1')return saved;
        if(version&&saved.headers.get('X-Alliance-Pwa-Version')===version)return saved;
        // Compatibility with branch icons prepared before the shared worker.
        const manifest=await cache.match(new URL('pwa-manifest.webmanifest',url));
        if(manifest){try{const data=await manifest.json();if(data.icons?.some(icon=>new URL(icon.src,url).searchParams.get('v')===version))return saved;}catch{}}
      }
      return fetch(event.request);
    })());return;
  }
  const isStatic=['script','style','image','font','manifest'].includes(event.request.destination),isPage=event.request.mode==='navigate';
  if(!isStatic&&!isPage)return;
  event.respondWith((async()=>{
    const key=new URL(url);key.hash='';
    const cache=await caches.open(PORTAL_CACHE);
    const freshCode=isPage||['script','style'].includes(event.request.destination);
    if(isStatic&&[...key.searchParams.keys()].every(k=>k==='v'))key.search='';
    if(!DEVELOPMENT&&!freshCode){const saved=await cache.match(key);if(saved)return saved;}
    try{const response=await fetch(freshCode?new Request(event.request,{cache:'no-store'}):event.request);if(response.ok&&response.type!=='opaque')await cache.put(key,response.clone());if(!response.ok&&freshCode){const saved=await cache.match(key)||await cache.match(new URL(url.pathname,url));if(saved)return saved;}return response;}
    catch{const saved=await cache.match(key)||await cache.match(new URL(url.pathname,url));if(saved)return saved;if(isPage){const home=await cache.match(new URL('index.html',ROOT));if(home)return home;}return Response.error();}
  })());
});
