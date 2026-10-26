import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.mp3':'audio/mpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
export function registerSite(app:FastifyInstance,directory:string,publicApiUrl?:string){
  const root=resolve(directory);
  app.get('/site',async(_req,reply)=>reply.redirect('/site/index.html'));
  app.get('/site/*',async(request,reply)=>{
    let path:string;
    try{path=decodeURIComponent((request.params as {'*':string})['*']);}catch{return reply.code(400).send();}
    if(path.split(/[\\/]/).some(segment=>segment.startsWith('.')))return reply.code(404).send();
    if(path==='api-config.js'&&publicApiUrl)return reply.type('application/javascript').header('Cache-Control','no-store').send(`const API_URL = ${JSON.stringify(publicApiUrl)};\nwindow.ALLIANCE_CONFIG = { API_URL };\n`);
    let file=resolve(root,path||'index.html');
    if(!file.startsWith(root+sep))return reply.code(404).send();
    try{
      if((await stat(file)).isDirectory()){
        if(!request.url.split('?')[0].endsWith('/'))return reply.redirect(request.url.split('?')[0]+'/');
        file=resolve(file,'index.html');
      }
      if(!(await stat(file)).isFile()||!types[extname(file)])return reply.code(404).send();
    }catch{return reply.code(404).send();}
    return reply.type(types[extname(file)]).header('Cache-Control','no-cache').send(createReadStream(file));
  });
}
