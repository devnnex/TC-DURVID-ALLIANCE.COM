/* Shared rendering and optional tools. Application data and permissions are unchanged. */
(() => {
  const root=new URL('./',document.currentScript.src),scripts=new Map(),frames=new Map();
  function loadScript(path){const url=new URL(path,root).href;if(!scripts.has(url)){const pending=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=()=>resolve();script.onerror=()=>{script.remove();scripts.delete(url);reject(new Error('No se pudo abrir esta herramienta. Intenta nuevamente.'));};document.head.append(script);});scripts.set(url,pending);}return scripts.get(url);}
  function frame(key,render){if(frames.has(key))return;frames.set(key,requestAnimationFrame(()=>{frames.delete(key);render();}));}
  // Lucide keeps its source attribute on SVGs. Rendering them again replaces the same
  // nodes on every input; process only the newly inserted placeholders instead.
  if(window.lucide){const original=lucide.createIcons;lucide.createIcons=(options={})=>{const attr=options.nameAttr||'data-lucide';document.querySelectorAll('svg['+attr+']').forEach(svg=>svg.removeAttribute(attr));if(!document.querySelector('['+attr+']'))return;original(options);document.querySelectorAll('svg['+attr+']').forEach(svg=>svg.removeAttribute(attr));};}
  window.AlliancePerformance={loadScript,frame};
})();
