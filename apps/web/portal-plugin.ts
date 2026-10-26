import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createReadStream,existsSync } from 'node:fs';
import { resolve,extname,sep } from 'node:path';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
export function portalPlugin():Plugin {
  const setup=(server:ViteDevServer|PreviewServer,preview=false)=>{server.middlewares.use((req,res,next)=>{
    let path:string;try{path=decodeURIComponent((req.url||'/').split('?')[0]);}catch{return next();}
    if(path==='/admin'){res.statusCode=308;res.setHeader('Location','/admin/'+((req.url||'').includes('?')?'?'+req.url!.split('?').slice(1).join('?'):''));res.end();return;}
    if(path==='/')path='/index.html';
    if(path==='/api-config.js'&&process.env.TEST_API_URL){res.setHeader('Content-Type','application/javascript');res.end(`const API_URL=${JSON.stringify(process.env.TEST_API_URL)};window.ALLIANCE_CONFIG={API_URL};`);return;}
    const compiled=preview&&path.startsWith('/admin/');
    if(compiled&&path==='/admin/')path='/admin/index.html';
    if(!compiled&&!['/index.html','/portal.css','/brand.css','/api-config.js','/open-local.js','/manifest.webmanifest','/service-worker.js','/pwa.js'].includes(path)&&!/^\/(assets|negocios|operational)\//.test(path))return next();
    const file=resolve(compiled?resolve(root,'dist'):root,'.'+path);const type=types[extname(file)];
    if(!file.startsWith(root+sep))return next();
    if(!type||!existsSync(file))return next();
    res.setHeader('Content-Type',type);createReadStream(file).pipe(res);
  });};
  return {name:'alliance-legacy-portal',transformIndexHtml:{order:'post',handler:(html,ctx)=>({html:ctx.bundle?html.replace(/<script type="module" crossorigin/g,'<script defer'):html,tags:[{tag:'script',attrs:{src:'../api-config.js'},injectTo:'head-prepend'}]})},configureServer:server=>setup(server),configurePreviewServer:server=>setup(server,true)};
}
