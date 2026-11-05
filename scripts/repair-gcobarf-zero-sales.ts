import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeSql} from './ords-sql.js';

type Evidence={price:number;source:string};
export function reconstructZeroSale(original:any,evidence:Map<string,Evidence>,account:any={}){
  if(original.totals?.total!==0||original.totals?.subtotal!==0||!original.items?.length)throw Error('La factura ya tiene un valor o no contiene productos.');
  if(['discount','tax','serviceFee','tip'].some(k=>Number(original.totals[k]||0)!==0)||original.payments?.length!==1||original.payments[0].amount!==0||!['cash','transfer','breb','card'].includes(original.payments[0].method))throw Error('Esta factura necesita revisar descuentos o la distribución del pago.');
  const invoice=structuredClone(original),sources:any[]=[];let subtotalMinor=0;
  for(const line of invoice.items){const proof=evidence.get(line.id);if(line.unit_price!==0||!(line.quantity>0)||!proof||!Number.isFinite(proof.price)||proof.price<=0)throw Error('Falta un precio histórico comprobado para '+line.item_name+'.');line.unit_price=proof.price;subtotalMinor+=Math.round(line.quantity*proof.price*100);sources.push({lineId:line.id,productId:line.menu_item_id,quantity:line.quantity,unitPrice:proof.price,source:proof.source});}
  if(!Number.isSafeInteger(subtotalMinor)||subtotalMinor<=0)throw Error('Total inválido.');
  const total=subtotalMinor/100;
  Object.assign(invoice.totals,{subtotal:total,baseTotal:total,total});invoice.baseTotal=total;invoice.payments[0].amount=total;
  // The amount due is reconstructed; the cash physically handed over is unknown.
  invoice.cashReceived=null;invoice.changeDue=null;
  if(account.delivery_date){invoice.deliveryDate=account.delivery_date;invoice.deliveryTime=account.delivery_time;invoice.saleChannel=account.sale_channel||invoice.saleChannel;}
  invoice.priceRepair={version:1,reason:'Corrección solicitada de una venta registrada sin precio',at:new Date().toISOString(),sources,cashTenderUnknown:true};
  return invoice;
}
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const clob=(s:string)=>s.match(/[\s\S]{1,7000}/g)!.map(part=>'TO_CLOB('+literal(part)+')').join('||');
const rows=(result:any)=>result.flatMap((r:any)=>r.resultSet?.items||[]);

async function main(){
  const candidates=rows(await executeSql(`SELECT s.business_id,s.location_id,s.id,s.session_id,s.actor_user_id,s.invoice_json,d.data_json account_json FROM alliance_pos_sales s JOIN locations l ON l.business_id=s.business_id AND l.id=s.location_id LEFT JOIN alliance_pos_documents d ON d.business_id=s.business_id AND d.location_id=s.location_id AND d.entity='table_sessions' AND d.id=s.session_id WHERE l.slug='gcobarf' AND s.voided=0 AND s.total_minor=0 ORDER BY s.created_at`));
  const plan:any[]=[];
  for(const row of candidates){const original=JSON.parse(row.invoice_json),evidence=new Map<string,Evidence>();
    for(const line of original.items){
      const prices=rows(await executeSql(`SELECT source,price FROM (
        SELECT 'Precio original del consumo' source,JSON_VALUE(a.after_json,'$.unit_price' RETURNING NUMBER) price,1 priority,a.created_at FROM administration_audit a JOIN alliance_pos_sales s ON s.business_id=a.business_id AND s.id=${literal(row.id)} AND s.location_id=${literal(row.location_id)} WHERE a.entity_id=${literal(line.id)} AND a.action='POS_SESSION_ITEMS' AND a.created_at<=s.created_at AND JSON_VALUE(a.after_json,'$.unit_price' RETURNING NUMBER)>0
        UNION ALL
        SELECT 'Precio del producto vigente al vender' source,JSON_VALUE(a.after_json,'$.price' RETURNING NUMBER) price,2 priority,a.created_at FROM administration_audit a JOIN alliance_pos_sales s ON s.business_id=a.business_id AND s.id=${literal(row.id)} AND s.location_id=${literal(row.location_id)} WHERE a.entity_id=${literal(line.menu_item_id)} AND a.action='POS_MENU_ITEMS' AND a.created_at<=s.created_at AND JSON_VALUE(a.after_json,'$.price' RETURNING NUMBER)>0
      ) ORDER BY priority,created_at DESC FETCH FIRST 1 ROW ONLY`));
      if(prices[0])evidence.set(line.id,{price:Number(prices[0].price),source:prices[0].source});
    }
    const invoice=reconstructZeroSale(original,evidence,row.account_json?JSON.parse(row.account_json):{});plan.push({...row,invoice});
  }
  console.log(JSON.stringify({apply:process.argv.includes('--apply'),sales:plan.map(p=>({invoice:p.invoice.number,total:p.invoice.totals.total,sources:p.invoice.priceRepair.sources})),total:plan.reduce((n,p)=>n+p.invoice.totals.total,0)},null,2));
  if(!process.argv.includes('--apply')||!plan.length)return;
  await mkdir('.tools',{recursive:true});await writeFile('.tools/gcobarf-zero-sales-before.json',JSON.stringify(plan,null,2));
  const statements=plan.map(p=>`DECLARE
    old_text CLOB;fresh CLOB:=${clob(JSON.stringify(p.invoice))};expected CLOB:=${clob(p.invoice_json)};invoice JSON_OBJECT_T:=JSON_OBJECT_T(fresh);account JSON_OBJECT_T;line JSON_OBJECT_T;items JSON_ARRAY_T:=invoice.get_array('items');cash_entry JSON_OBJECT_T;report JSON_OBJECT_T;
  BEGIN
    alliance_pos_store.lock_scope(${literal(p.business_id)},${literal(p.location_id)});
    SELECT invoice_json INTO old_text FROM alliance_pos_sales WHERE business_id=${literal(p.business_id)} AND location_id=${literal(p.location_id)} AND id=${literal(p.id)} AND total_minor=0 AND voided=0 FOR UPDATE;
    IF DBMS_LOB.COMPARE(old_text,expected)<>0 THEN RAISE_APPLICATION_ERROR(-20001,'La venta cambió durante la revisión.');END IF;
    UPDATE alliance_pos_sales SET invoice_json=fresh,total_minor=${Math.round(p.invoice.totals.total*100)},subtotal_minor=${Math.round(p.invoice.totals.subtotal*100)} WHERE business_id=${literal(p.business_id)} AND location_id=${literal(p.location_id)} AND id=${literal(p.id)};
    FOR i IN 0..items.get_size-1 LOOP line:=TREAT(items.get(i) AS JSON_OBJECT_T);account:=alliance_pos_store.document(${literal(p.business_id)},${literal(p.location_id)},'session_items',line.get_string('id'));IF account IS NOT NULL THEN account.put('unit_price',line.get_number('unit_price'));alliance_pos_store.put_document(${literal(p.business_id)},${literal(p.location_id)},'session_items',line.get_string('id'),account);END IF;END LOOP;
    account:=alliance_pos_store.document(${literal(p.business_id)},${literal(p.location_id)},'table_sessions',${literal(p.session_id)});IF account IS NOT NULL THEN account.put('subtotal',invoice.get_object('totals').get_number('subtotal'));account.put('total',invoice.get_object('totals').get_number('total'));alliance_pos_store.put_document(${literal(p.business_id)},${literal(p.location_id)},'table_sessions',${literal(p.session_id)},account);END IF;
    IF invoice.get_string('cashSessionId') IS NOT NULL AND invoice.get_string('paymentMethod')='cash' THEN cash_entry:=JSON_OBJECT_T();cash_entry.put('sessionId',invoice.get_string('cashSessionId'));cash_entry.put('kind','in');cash_entry.put('amount',invoice.get_object('totals').get_number('total'));cash_entry.put('reference',${literal(p.id)});cash_entry.put('occurredAt',invoice.get_string('createdAt'));alliance_operations.put_row(${literal(p.actor_user_id)},${literal(p.business_id)},${literal(p.location_id)},'cashMovements',${literal('REPAIR-ZERO-'+p.id)},cash_entry);END IF;
    alliance_pos_store.audit(${literal(p.actor_user_id)},${literal(p.business_id)},'SYSTEM_GCOBARF_PRICE_REPAIR',${literal(p.id)},old_text,fresh);
    report:=JSON_OBJECT_T();report.put('reason','Corrección de ventas sin precio');alliance_pos_store.put_document(${literal(p.business_id)},${literal(p.location_id)},'op_reportsync','primary',report);
  END;`).join('\n');
  const sql=`DECLARE stock_before NUMBER;stock_after NUMBER;movements_before NUMBER;movements_after NUMBER;BEGIN
    SELECT NVL(SUM(stock),0) INTO stock_before FROM alliance_pos_stock;SELECT COUNT(*) INTO movements_before FROM alliance_pos_movements;
    ${statements}
    SELECT NVL(SUM(stock),0) INTO stock_after FROM alliance_pos_stock;SELECT COUNT(*) INTO movements_after FROM alliance_pos_movements;
    IF stock_before<>stock_after OR movements_before<>movements_after THEN RAISE_APPLICATION_ERROR(-20001,'La corrección no debe alterar existencias ni movimientos.');END IF;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;END;`;
  await executeSql(sql);console.log('Corrección aplicada con auditoría. Existencias y movimientos conservados.');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve('scripts/repair-gcobarf-zero-sales.ts'))await main();
