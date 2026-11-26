/* Build the small, isolated sender runtime. Credentials come only from its environment. */
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),target=process.argv[2];
if(!target)throw Error('Indica la carpeta del remitente.');
for(const [source,name]of [
 ['infrastructure/notifications/package.json','package.json'],
 ['infrastructure/notifications/package-lock.json','package-lock.json'],
 ['scripts/stock-notification-worker.ts','scripts/stock-notification-worker.ts'],
 ['scripts/ords-sql.ts','scripts/ords-sql.ts'],
 ['operational/stock-alerts-engine.js','operational/stock-alerts-engine.js']
]){const output=resolve(target,name);await mkdir(dirname(output),{recursive:true});await copyFile(resolve(root,source),output);}
