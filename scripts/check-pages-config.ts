import { readFile } from 'node:fs/promises';
import { apiBaseUrl } from '../apps/web/src/api-url.js';
const source=await readFile(new URL('../api-config.js',import.meta.url),'utf8');
const value=process.env.PUBLIC_API_URL||source.match(/^const API_URL = ['"]([^'"]+)['"];$/m)?.[1];
if(!value)throw new Error('Falta API_URL pública en api-config.js.');
const url=new URL(value);if(url.protocol!=='https:')throw new Error('GitHub Pages requiere API HTTPS.');
apiBaseUrl(value,{hostname:url.hostname,protocol:'https:'});
console.log('API HTTPS configurada para publicar el frontend. No se requieren secretos Oracle en GitHub.');
