import { registerSW } from 'virtual:pwa-register';
export let updateAvailable=false;
export const updateApp=window.location.protocol==='file:'?async()=>{}:registerSW({immediate:true,onNeedRefresh(){updateAvailable=true;window.dispatchEvent(new Event('alliance-update-available'));}});
