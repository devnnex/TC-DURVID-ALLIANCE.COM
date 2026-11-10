import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {executeSql,ordsRoot} from './ords-sql.js';
import assert from 'node:assert/strict';

const product=randomUUID();
const replacements:Record<string,string>={__PRODUCT__:product,__TOKEN__:randomBytes(32).toString('hex'),__OTHER_TOKEN__:randomBytes(32).toString('hex'),__PHONE__:'9'+String(Date.now()).slice(-12)};
let sql=readFileSync(new URL('test-gcobarf-orders.sql',import.meta.url),'utf8');
for(const [key,value] of Object.entries(replacements))sql=sql.replaceAll(key,value);
await executeSql(sql);
const leftovers=(await executeSql("SELECT COUNT(*) n FROM products WHERE id='"+product+"'")).flatMap((row:any)=>row.resultSet?.items||[]);
assert.equal(Number((leftovers[0] as any).n),0,'Las pruebas no dejan productos ni pedidos reales');
const response=await fetch(ordsRoot+'alliance/api/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'POST',path:'/gcobarf/public',body:{action:'catalog'}})});
const catalog=await response.json() as any;assert.equal(catalog.status,200);assert.ok(Array.isArray(catalog.data.products));
for(const item of catalog.data.products)for(const field of ['costPrice','cost_minor','customerId','business_id'])assert.ok(!(field in item),'No publica datos internos');
console.log('Oracle real: catálogo, validaciones, reservas, reintentos, abonos, pago y cancelación correctos. Fixtures revertidos.');
