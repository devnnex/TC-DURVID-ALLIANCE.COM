/* Links appointments, invoices and receipts without creating another sale or stock debit. */
globalThis.AllianceCustomerLedger=(()=>{
  const money=n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
  const localDay=stamp=>stamp?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)):'';
  const source=data=>{const model=data.model||data.operations||{},sales=new Map([...(model.deliverySales||[]),...(data.sales||[])].map(s=>[s.id,s]));return {sessions:data.docs?.table_sessions||[],lines:data.docs?.session_items||[],sales:[...sales.values()].filter(s=>!s.voided),model};};
  function context(data,record){
    const s=source(data),sale=s.sales.find(v=>v.id===(record.saleId||record.id)||v.sessionId===record.sessionId),session=s.sessions.find(v=>v.id===(record.sessionId||sale?.sessionId));
    const customerId=record.customerId||sale?.customerId||session?.customer_id||'',customer=s.model.customers?.find(c=>c.id===customerId);
    return {customerId,customerName:record.customerName||sale?.customerName||customer?.name||session?.payer_name||sale?.payerName||'',deliveryDate:record.deliveryDate||sale?.deliveryDate||session?.delivery_date||'',deliveryTime:record.deliveryTime||sale?.deliveryTime||session?.delivery_time||''};
  }
  function appointment(data,session){
    const s=source(data),sale=s.sales.find(v=>v.sessionId===session.id),items=sale?.items||s.lines.filter(i=>i.session_id===session.id&&i.status!=='cancelled');
    const total=money(sale?.totals?.total??items.reduce((n,i)=>n+i.quantity*i.unit_price,0)),debts=sale?(s.model.debts||[]).filter(d=>!d.voided&&(d.saleId===sale.id||d.id===sale.id)):[];
    const receipts=(s.model.customerPayments||[]).flatMap(p=>{const allocations=(p.allocations||[]).filter(a=>debts.some(d=>d.id===a.debtId));return allocations.length?[{...p,applied:money(allocations.reduce((n,a)=>n+a.amount,0))}]:[];});
    const pending=sale?money(debts.reduce((n,d)=>n+Math.max(0,d.total-d.paid),0)):total;
    const legacyCredit=sale&&(sale.payments||[]).some(p=>p.method==='credit')&&!debts.length;
    const paid=!!sale&&!legacyCredit&&pending===0;
    const payments=sale?[{id:sale.id,createdAt:sale.createdAt,reference:sale.reference,payments:(sale.payments||[]).filter(p=>p.method!=='credit'),applied:money((sale.payments||[]).filter(p=>p.method!=='credit').reduce((n,p)=>n+p.amount,0))},...receipts].filter(p=>p.applied>0).sort((a,b)=>String(a.createdAt||a.at).localeCompare(String(b.createdAt||b.at))):[];
    const paidAt=paid?(payments.at(-1)?.createdAt||payments.at(-1)?.at||sale.createdAt):'';
    return {...context(data,{sessionId:session.id}),id:session.id,session,sale,items,total,pending:legacyCredit?money(sale.payments.filter(p=>p.method==='credit').reduce((n,p)=>n+p.amount,0)):pending,paid,paidAt,payments,status:paid?'Pagado':payments.length?'Pago parcial':'Pendiente de pago'};
  }
  function history(data,customerId){
    const s=source(data),appointments=s.sessions.filter(v=>v.customer_id===customerId&&v.delivery_date&&v.status!=='cancelled').map(v=>appointment(data,v));
    return appointments.sort((a,b)=>b.deliveryDate.localeCompare(a.deliveryDate)||b.deliveryTime.localeCompare(a.deliveryTime));
  }
  function collectionItems(data,receipt){const s=source(data);return (receipt.allocations||[]).map(a=>{const debt=(s.model.debts||[]).find(d=>d.id===a.debtId),sale=s.sales.find(v=>v.id===(debt?.saleId||debt?.id));return {debtId:a.debtId,amount:a.amount,invoice:sale?.number||debt?.reference||'Saldo anterior',...context(data,{saleId:sale?.id}),items:sale?.items||[]};});}
  function filterMovements(rows,filters={}){return rows.filter(r=>{const day=r.deliveryDate||localDay(r.date);return (!filters.customerId||filters.customerId==='all'||r.customerId===filters.customerId)&&(!filters.month||day.startsWith(filters.month))&&(!filters.year||day.startsWith(filters.year+'-'))&&(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to);});}
  function movementValue(data,row){
    if(Number.isFinite(row.saleUnitPrice))return money(-row.delta*row.saleUnitPrice);
    const s=source(data),sale=s.sales.find(v=>v.sessionId===row.sessionId),lines=(sale?.items||s.lines.filter(i=>i.session_id===row.sessionId)).filter(i=>i.menu_item_id===row.productId);
    const quantity=lines.reduce((n,i)=>n+i.quantity,0);return quantity?money(-row.delta*lines.reduce((n,i)=>n+i.quantity*i.unit_price,0)/quantity):null;
  }
  function prettyDay(value){if(!value)return 'Sin fecha';const d=new Date(String(value).slice(0,10)+'T12:00:00-05:00');return Number.isNaN(d.getTime())?'Sin fecha':new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Bogota'}).formatToParts(d).filter(p=>['day','month','year'].includes(p.type)).map(p=>p.value).join(' ');}
  function prettyMoment(value){const d=new Date(value);return !value||Number.isNaN(d.getTime())?'Sin fecha':prettyDay(localDay(value))+' · '+d.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit',timeZone:'America/Bogota'});}
  function movement(data,row){
    const s=source(data),sale=s.sales.find(v=>v.sessionId===row.sessionId||v.id===row.saleId),session=s.sessions.find(v=>v.id===(row.sessionId||sale?.sessionId));
    const related=!!(sale||session?.delivery_date||row.deliveryDate),returned=Number(row.delta)>0&&/CONSUMO|VENTA|CORRECCION/.test(row.type||'');
    if(!related&&!returned)return null;
    const account=session||{id:row.sessionId||sale?.sessionId,customer_id:row.customerId,delivery_date:row.deliveryDate,delivery_time:row.deliveryTime};
    const a=appointment(data,account),paid=a.paid;
    return {...a,state:returned?'returned':paid?'sold':'reserved',label:returned?'Devuelto':paid?'Vendido':'Apartado',paymentLabel:returned?'Devolución':paid?'Pagado':a.payments.length?'Pago parcial':'Pendiente de pago',unitsLabel:returned?'Unidades devueltas':paid?'Unidades vendidas':'Unidades apartadas'};
  }
  function color(id){let hash=0;for(const c of String(id))hash=(hash*31+c.charCodeAt(0))>>>0;return 'hsl('+hash%360+' 52% 35%)';}
  return {context,appointment,history,collectionItems,filterMovements,movementValue,movement,prettyDay,prettyMoment,localDay,color};
})();
