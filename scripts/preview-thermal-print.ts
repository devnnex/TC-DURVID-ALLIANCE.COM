import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=new URL('../docs/printing-examples/',import.meta.url);await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:2000,height:1700},deviceScaleFactor:1});
  for(const [slug,name] of [['cocteleria','Coctelería'],['cafeteria','Cafetería']]){
    const cards=[];for(const [type,title,description]of [['prefactura','01 · Prefactura','Cuenta por pagar · Propina sugerida opcional'],['cobro','02 · Cobro impreso','Pago registrado · Propina aceptada y cambio'],['comanda','03 · Comanda','Mesa, cantidades y observaciones de preparación']]){const png=await readFile(new URL(slug+'-'+type+'.png',root));cards.push('<article><h2>'+title+'</h2><p>'+description+'</p><img src="data:image/png;base64,'+png.toString('base64')+'" alt="'+title+'"></article>');}
    const html='<!doctype html><html lang="es"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:54px 58px 32px;background:#f2f1ec;color:#29372f;font-family:Arial,sans-serif}header{margin-bottom:34px;display:flex;align-items:end;justify-content:space-between}h1{font-size:40px;margin:6px 0 0;letter-spacing:-1px}header span{font-size:14px;font-weight:700;color:#87917c;letter-spacing:3px}header strong{font-size:18px;color:#7e8b72}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}article{min-width:0}h2{font-size:22px;margin:0 0 8px;color:#536249}article>p{font-size:13px;color:#8b9382;margin:0 0 18px;min-height:18px}img{display:block;width:100%;height:auto;background:#fff;box-shadow:0 8px 20px #2c3e2912;border-top:1px solid #ddd}footer{border-top:1px solid #dfe3d8;margin-top:32px;padding-top:20px;font-size:14px;color:#8c9584;display:flex;justify-content:space-between}</style><header><div><span>JESPRESSO OLIVIA</span><h1>'+name+'</h1></div><strong>Formatos reales · Papel de 80 mm</strong></header><main>'+cards.join('')+'</main><footer><span>Ejemplos con datos de prueba · Sin cargos reales</span><span>Generación, botones y PDF verificados en navegador</span></footer></html>';
    await page.setContent(html);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode())));
    await page.screenshot({path:fileURLToPath(new URL(slug+'-ejemplos-80mm.png',root)),fullPage:true});
  }
}finally{await browser.close();}
console.log('Imágenes de ejemplos generadas desde los formatos reales en docs/printing-examples/.');
