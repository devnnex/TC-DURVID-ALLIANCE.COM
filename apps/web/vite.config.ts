import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import { existsSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { portalPlugin } from './portal-plugin';
export default defineConfig(()=>{
  const envPath=fileURLToPath(new URL('../../.env',import.meta.url));
  const settings=existsSync(envPath)?dotenv.parse(readFileSync(envPath,'utf8')):{};
  const apiPort=Number(process.env.API_PORT||settings.API_PORT||3001);
  if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw new Error('API_PORT debe ser un puerto valido.');
  const apiTarget=`http://127.0.0.1:${apiPort}`;
  const publicApiUrl=process.env.PUBLIC_API_URL||(process.env.RENDER_EXTERNAL_URL?process.env.RENDER_EXTERNAL_URL.replace(/\/$/,'')+'/api/v1':'');
  return {
    base:'./',
    plugins:[portalPlugin(),react(),VitePWA({
      registerType:'prompt',
      manifest:{name:'Alliance · Centro operativo',short_name:'Alliance',start_url:'./',scope:'./',display:'standalone',theme_color:'#f5f4f1',background_color:'#f5f4f1',icons:[{src:'../assets/pwa-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'../assets/pwa-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},
      workbox:{maximumFileSizeToCacheInBytes:3*1024*1024,clientsClaim:true,navigateFallback:'index.html',globPatterns:['**/*.{js,css,html,svg,png,woff2}'],cleanupOutdatedCaches:true,additionalManifestEntries:[{url:'../api-config.js',revision:createHash('sha256').update(publicApiUrl||readFileSync(new URL('../../api-config.js',import.meta.url))).digest('hex')}]},
      devOptions:{enabled:false}
    })],
    server:{port:5173,strictPort:true,fs:{allow:['../..']},proxy:{'/api':{target:apiTarget}}},
    preview:{strictPort:true,proxy:{'/api':{target:apiTarget}}},
    build:{outDir:'../../dist/admin',emptyOutDir:true,modulePreload:false,rollupOptions:{output:{format:'iife' as const,inlineDynamicImports:true}}}
  };
});
