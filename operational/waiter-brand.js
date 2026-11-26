/* Keep the waiter app identity separate while sharing this business's logo. */
globalThis.AllianceWaiterBrand=(()=>{
 let last='',generation=0,blobUrl;
 async function apply(business){
  const dark=['cafeteria','cocteleria'].includes(window.BRANCH_CONFIG?.slug),logo=business?.logo_url||(dark?new URL('../../assets/logo.png',location.href).href:null);
  if(!business||!logo)return;
  const signature=JSON.stringify([business.business_name,logo,business.accent_color,dark?'black-v1':'white']);if(signature===last)return;last=signature;const current=++generation;
  try{
   const picture=new Image();picture.crossOrigin='anonymous';picture.src=logo;await picture.decode();
   const version=Array.from(signature).reduce((n,c)=>((n<<5)-n+c.charCodeAt(0))|0,0).toString(36).replace('-','n'),cache=await caches.open('alliance-'+BRANCH_CONFIG.slug+'-pwa-brand-v1');
   const icons=[];let favicon;
   for(const size of [192,512]){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.fillStyle=dark?'#000':'#fff';ctx.fillRect(0,0,size,size);const scale=Math.min(size*.76/picture.naturalWidth,size*.76/picture.naturalHeight),w=picture.naturalWidth*scale,h=picture.naturalHeight*scale;ctx.drawImage(picture,(size-w)/2,(size-h)/2,w,h);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;if(size===192)favicon=canvas.toDataURL('image/png');const url=new URL('pwa-icon-'+size+'.png',location.href);await cache.put(url,new Response(blob,{headers:{'Content-Type':'image/png','X-Alliance-Pwa-Version':version,'X-Alliance-Icon-Background':dark?'black':'white'}}));icons.push({src:'./pwa-icon-'+size+'.png?v='+version,sizes:size+'x'+size,type:'image/png',purpose:'any maskable'});}
   if(current!==generation)return;
   const manifest={id:'./index.html',name:(business.business_name||BRANCH_CONFIG.name)+' · Meseros',short_name:Array.from(business.business_name||BRANCH_CONFIG.name).slice(0,15).join(''),start_url:'./index.html',scope:'./',display:'standalone',lang:'es-CO',background_color:'#fff',theme_color:business.accent_color||BRANCH_CONFIG.color,icons};
   const text=JSON.stringify(manifest),target=new URL('pwa-waiter-manifest.webmanifest',location.href);await cache.put(target,new Response(text,{headers:{'Content-Type':'application/manifest+json','X-Alliance-Pwa-Version':version}}));
   const link=document.querySelector('link[rel=manifest]');if(link){if(navigator.serviceWorker?.controller)link.href=target.href+'?v='+version;else{if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(new Blob([text],{type:'application/manifest+json'}));link.href=blobUrl;}}
   document.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon]').forEach(link=>link.href=dark?favicon:logo);
  }catch{last='';/* A temporary image or storage failure preserves the working installed identity. */}
 }
 return {apply};
})();
