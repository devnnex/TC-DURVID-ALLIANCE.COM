import {createHash} from 'node:crypto';
import { cp,mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { apiBaseUrl } from '../apps/web/src/api-url.js';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await mkdir(out,{recursive:true});
for(const name of ['index.html','portal.css','brand.css','api-config.js','open-local.js','manifest.webmanifest','service-worker.js','pwa.js','assets','negocios','operational'])await cp(new URL(name,root),new URL(name,out),{recursive:true});
const publicApiUrl=process.env.PUBLIC_API_URL||(process.env.RENDER_EXTERNAL_URL?process.env.RENDER_EXTERNAL_URL.replace(/\/$/,'')+'/api/v1':'');
if(publicApiUrl){
  const url=new URL(publicApiUrl);
  if(url.protocol!=='https:')throw new Error('PUBLIC_API_URL debe usar HTTPS.');
  const value=apiBaseUrl(publicApiUrl,{hostname:url.hostname,protocol:url.protocol});
  const file=new URL('api-config.js',out),original=await readFile(file,'utf8');
  await writeFile(file,original.replace(/^const API_URL = .*;$/m,`const API_URL = ${JSON.stringify(value)};`));
}
// Every public build changes the worker version when its application files change.
const workerFile=new URL('service-worker.js',out),worker=await readFile(workerFile,'utf8');const fingerprint=createHash('sha256');fingerprint.update(worker.replace(/const BUILD_VERSION='[^']*';/,"const BUILD_VERSION='build';"));
async function hashFolder(folder:URL,prefix=''){for(const entry of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=prefix+entry.name,url=new URL(entry.name+(entry.isDirectory()?'/':''),folder);if(entry.isDirectory())await hashFolder(url,path+'/');else if(path!=='service-worker.js'){fingerprint.update(path);fingerprint.update(await readFile(url));}}}
await hashFolder(out);const version=fingerprint.digest('hex').slice(0,24);const compiledWorker=worker.replace(/const BUILD_VERSION='[^']*';/,"const BUILD_VERSION='"+version+"';");await writeFile(workerFile,compiledWorker);await writeFile(new URL('service-worker.js',root),compiledWorker);
console.log('Portal y accesos originales empaquetados junto al nuevo /admin/.');
