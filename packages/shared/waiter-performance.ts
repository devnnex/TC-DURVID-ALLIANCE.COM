type OrderLine={order_id?:string;id:string;status?:string;quantity:number;unit_price:number;session_id?:string};
type OrderRequest={id:string;actor_user_id?:string;actor_name?:string;created_at:string;request_type:string;status:string;session_id?:string;table_id:string};
export type PerformanceSale={id:string;sessionId:string;createdAt:string;voided?:boolean;waiterName?:string;soldByUserId?:string;number?:string;totals:{total:number;subtotal:number;tip?:number};payments:{method:string;amount:number}[];items:OrderLine[]};
export type OrderSnapshot={
  docs:{service_requests:OrderRequest[];session_items:OrderLine[];restaurant_tables:{id:string;table_name?:string}[]};
  model:{tickets:{id:string;orderId?:string;status:string}[];customerPayments?:{id:string;createdAt?:string;at?:string;actorName?:string;allocations:{debtId:string;amount:number}[]}[];debts?:{id:string;saleId?:string;at?:string}[]};
  sales?:PerformanceSale[];salesHistoryPartial?:boolean;at?:string;
};
export type WaiterOrder={id:string;at:string;table:string;status:string;amount:number;collections:{id:string;at:string;cashier:string;invoice:string;amount:number}[]};
// Largest remainders retain every cent when a table contains several waiters' lines.
function allocate(cents:number,weights:number[]){const sum=weights.reduce((a,b)=>a+b,0);if(sum<=0)return weights.map(()=>0);const exact=weights.map(w=>cents*w/sum),parts=exact.map(Math.floor);let rest=cents-parts.reduce((a,b)=>a+b,0);for(const {index} of exact.map((v,index)=>({index,remainder:v-parts[index]})).sort((a,b)=>b.remainder-a.remainder)){if(rest--<=0)break;parts[index]++;}return parts;}
export function waiterPerformance(snapshot:OrderSnapshot,members:{id:string;name:string}[],days:number,now=Date.now()){
  const since=now-days*86400000,inPeriod=(s:string)=>Date.parse(s)>=since&&Date.parse(s)<=now;
  const requests=new Map(snapshot.docs.service_requests.filter(r=>r.request_type==='order').map(r=>[r.id,r]));
  const lineOrders=new Map(snapshot.docs.session_items.filter(l=>l.order_id).map(l=>[l.id,l.order_id!]));
  const tables=new Map(snapshot.docs.restaurant_tables.map(t=>[t.id,t.table_name||'Mesa']));
  const cancelled=new Set(snapshot.model.tickets.filter(t=>t.status==='cancelled').map(t=>t.orderId||t.id));
  const rows=members.map(member=>({...member,sent:0,accepted:0,pending:0,rejected:0,cancelled:0,paid:0,amount:0,rating:null as number|null,orders:[] as WaiterOrder[]})),byId=new Map(rows.map(r=>[r.id,r]));
  const details=new Map<string,WaiterOrder>(),paid=new Set<string>(),outstanding=new Set<string>();
  function detail(request:OrderRequest){let value=details.get(request.id);if(!value){value={id:request.id,at:request.created_at,table:tables.get(request.table_id)||'Mesa',status:cancelled.has(request.id)?'Anulada':request.session_id?'Atendida · pendiente de cobro':request.status==='pending'?'Por aceptar':'Rechazada',amount:0,collections:[]};details.set(request.id,value);}return value;}
  for(const request of requests.values()){
    const row=byId.get(request.actor_user_id||'');if(!row||!inPeriod(request.created_at))continue;row.sent++;detail(request);
    if(cancelled.has(request.id))row.cancelled++;else if(request.session_id)row.accepted++;else if(request.status==='pending')row.pending++;else row.rejected++;
  }
  const seenSales=new Set<string>(),seenPayments=new Set<string>();
  const receipts=snapshot.model.customerPayments||[],debtSales=new Map((snapshot.model.debts||[]).map(d=>[d.id,d.saleId||d.id]));
  const paymentsBySale=new Map<string,{id:string;at:string;cashier:string;amount:number}[]>();
  for(const receipt of receipts){if(seenPayments.has(receipt.id))continue;seenPayments.add(receipt.id);for(const allocation of receipt.allocations){const saleId=debtSales.get(allocation.debtId)||allocation.debtId,group=paymentsBySale.get(saleId)||[];group.push({id:receipt.id,at:receipt.createdAt||receipt.at||'',cashier:receipt.actorName||'Responsable no registrado',amount:allocation.amount});paymentsBySale.set(saleId,group);}}
  for(const sale of snapshot.sales||[]){
    if(sale.voided||Date.parse(sale.createdAt)>now||seenSales.has(sale.id))continue;seenSales.add(sale.id);
    const total=Math.round(sale.totals.total*100);if(total<=0)continue;
    const weights=sale.items.map(l=>Math.max(0,Math.round(l.quantity*l.unit_price*100))),credits=Math.round(sale.payments.filter(p=>p.method==='credit').reduce((n,p)=>n+p.amount,0)*100);
    const cash=Math.min(total,Math.max(0,Math.round(sale.payments.filter(p=>p.method!=='credit').reduce((n,p)=>n+p.amount,0)*100)));
    const linked=sale.items.map(line=>{const id=lineOrders.get(line.id)||line.order_id;const request=id&&requests.get(id);return request&&request.session_id===sale.sessionId?request:undefined;});
    const events=[{id:sale.id,at:sale.createdAt,cashier:sale.waiterName||'Responsable no registrado',cents:cash}];let remaining=credits;
    for(const receipt of (paymentsBySale.get(sale.id)||[]).sort((a,b)=>a.at.localeCompare(b.at))){if(Date.parse(receipt.at)>now)continue;const cents=Math.min(remaining,Math.max(0,Math.round(receipt.amount*100)));remaining-=cents;events.push({...receipt,cents});}
    for(const request of linked){if(!request)continue;if(remaining>0)outstanding.add(request.id);else paid.add(request.id);}
    for(const event of events){if(!inPeriod(event.at)||event.cents<=0)continue;
      // Attribute actual receipts, excluding the proportional tip, across all lines.
      const netCents=Math.round(event.cents*Math.max(0,total-Math.round((sale.totals.tip||0)*100))/total),shares=allocate(netCents,weights);
      const grouped=new Map<string,number>();linked.forEach((request,index)=>{if(request&&!cancelled.has(request.id))grouped.set(request.id,(grouped.get(request.id)||0)+shares[index]);});
      for(const [id,cents]of grouped){const request=requests.get(id)!,row=byId.get(request.actor_user_id||'');if(!row||cents<=0)continue;const order=detail(request),amount=cents/100;row.amount+=amount;order.amount+=amount;order.collections.push({id:event.id,at:event.at,cashier:event.cashier,invoice:sale.number||sale.id,amount});}
    }
  }
  for(const row of rows){for(const [id,order]of details){const request=requests.get(id)!;if(request.actor_user_id!==row.id)continue;if(paid.has(id)&&!outstanding.has(id)){order.status='Cobrada';if(inPeriod(request.created_at))row.paid++;}else if(order.amount>0)order.status='Cobro parcial';row.orders.push(order);}row.amount=Math.round(row.amount*100)/100;row.rating=row.sent?Math.round(5*row.paid/row.sent*10)/10:null;row.orders.sort((a,b)=>b.at.localeCompare(a.at));}
  return rows.sort((a,b)=>b.amount-a.amount||b.paid-a.paid||a.name.localeCompare(b.name,'es'));
}
