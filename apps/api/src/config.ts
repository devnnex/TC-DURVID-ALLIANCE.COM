import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname,join } from 'node:path';
import { existsSync,readFileSync } from 'node:fs';
let root=dirname(fileURLToPath(import.meta.url));
while(true){const p=join(root,'package.json');if(existsSync(p)&&JSON.parse(readFileSync(p,'utf8')).name==='tc-durvid-alliance')break;const parent=dirname(root);if(parent===root)throw new Error('No se encontró la raíz Alliance.');root=parent;}
dotenv.config({ path: join(root,'.env'), quiet: true } as dotenv.DotenvConfigOptions);
export function config() {
  const provider = process.env.DATA_PROVIDER || 'oracle';
  if (!['oracle','memory'].includes(provider)) throw new Error('DATA_PROVIDER debe ser oracle o memory.');
  if (provider === 'memory' && process.env.NODE_ENV === 'production') throw new Error('memory no está permitido en producción.');
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) throw new Error('Configura JWT_SECRET con al menos 32 caracteres en .env.');
  const cookieSameSite=process.env.REFRESH_COOKIE_SAME_SITE||'strict';
  if(cookieSameSite!=='strict'&&cookieSameSite!=='none')throw new Error('REFRESH_COOKIE_SAME_SITE debe ser strict o none.');
  return { provider, secret, setupToken: process.env.SETUP_TOKEN || '', production: process.env.NODE_ENV === 'production',
    host: process.env.API_HOST || '127.0.0.1', port: Number(process.env.PORT || process.env.API_PORT || 3001), origin: process.env.WEB_ORIGIN || 'http://localhost:5173',cookieSameSite:cookieSameSite as 'strict'|'none',siteDir:join(root,'dist'),publicApiUrl:process.env.PUBLIC_API_URL||(process.env.RENDER_EXTERNAL_URL?process.env.RENDER_EXTERNAL_URL.replace(/\/$/,'')+'/api/v1':'') };
}
