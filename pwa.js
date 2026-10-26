/* Install from the business portal; URLs stay relative for GitHub Pages. */
(() => {
  if(location.protocol==='file:'||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
  let prompt;
  const button=document.querySelector('#installAlliance');
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;if(button)button.hidden=false;});
  window.addEventListener('appinstalled',()=>{prompt=null;if(button)button.hidden=true;});
  button?.addEventListener('click',async()=>{if(!prompt)return;const current=prompt;prompt=null;button.hidden=true;await current.prompt();await current.userChoice;});
  // iOS presents installation through the browser's Share menu.
  if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches&&!navigator.standalone){
    const note=document.querySelector('#installIos');if(note)note.hidden=false;
  }
})();
