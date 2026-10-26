export function apiBaseUrl(configured:string|undefined,location:{hostname:string;protocol:string}){
  if(!configured?.trim())return '/api/v1';
  let url:URL;
  try{url=new URL(configured.trim());}catch{throw new Error('API_URL debe ser la URL HTTP de nuestra API, terminada en /api/v1.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.pathname.replace(/\/$/,'').endsWith('/api/v1'))throw new Error('API_URL debe terminar en /api/v1 y no incluir credenciales ni parámetros.');
  const loopback=['localhost','127.0.0.1','[::1]'];
  if(loopback.includes(url.hostname)){
    if(!loopback.includes(location.hostname))throw new Error('Configura la URL HTTPS de la API alojada en api-config.js.');
    // Use the same local hostname to retain the HttpOnly session cookie.
    url.hostname=location.hostname;
  }
  if(location.protocol==='https:'&&url.protocol!=='https:')throw new Error('API_URL debe usar HTTPS cuando el frontend usa HTTPS.');
  return url.href.replace(/\/$/,'');
}
