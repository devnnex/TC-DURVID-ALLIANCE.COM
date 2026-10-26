export function allowedWebOrigins(origin:string,production:boolean){
  const configured=origin.split(',').map(s=>s.trim()).filter(Boolean);
  for(const value of configured){const url=new URL(value);const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(url.origin!==value||!['http:','https:'].includes(url.protocol)||production&&url.protocol!=='https:'&&!local)throw new Error('WEB_ORIGIN debe contener orígenes completos, separados por coma; en producción deben usar HTTPS, excepto localhost explícito.');}
  if(!production)for(const host of ['127.0.0.1','localhost'])for(const port of [5500,5501])configured.push(`http://${host}:${port}`);
  return [...new Set(configured)];
}
