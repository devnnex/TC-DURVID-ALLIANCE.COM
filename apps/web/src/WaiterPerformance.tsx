import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,RefreshCw} from 'lucide-react';
import {waiterPerformance,waiterTableLabel,type OrderSnapshot,type PerformanceSale} from '../../../packages/shared/waiter-performance';

const money=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
const date=(s:string)=>new Date(s).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'});
export function WaiterPerformance({members,locationId,branchSlug}:{members:{id:string;name:string}[];locationId:string;branchSlug?:string}){
  const linkedSales=['cocteleria','cafeteria'].includes(branchSlug||'');
  const [snapshot,setSnapshot]=useState<OrderSnapshot>(),[days,setDays]=useState(30),[error,setError]=useState(''),[busy,setBusy]=useState(false),[opened,setOpened]=useState<string[]>([]),[limits,setLimits]=useState<Record<string,number>>({});
  const [complete,setComplete]=useState<{key:string;sales:PerformanceSale[]}>();
  const [online,setOnline]=useState(navigator.onLine),[retry,setRetry]=useState(0);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  const runtime=()=>(window as unknown as {OracleDb?:{remote:<T=OrderSnapshot>(action:string,payload?:unknown)=>Promise<T>;networkPos?:<T=OrderSnapshot>(action:string,payload?:unknown,operationId?:string,options?:{fresh?:boolean})=>Promise<T>;offlineStatus?:()=>{pending:number}}}).OracleDb;
  async function readSnapshot(){
    const db=runtime();if(!db)return;
    if(linkedSales&&navigator.onLine&&db.networkPos&&!db.offlineStatus?.().pending){
      try{const fresh=await db.networkPos('operations_snapshot',{},undefined,{fresh:true});return db.offlineStatus?.().pending?db.remote('operations_snapshot'):fresh;}
      catch(e){if([401,403].includes((e as {status?:number}).status||0))throw e;setError('No se pudo actualizar el rendimiento. Se muestran los datos guardados en este equipo.');}
    }
    return db.remote('operations_snapshot');
  }
  function acceptSnapshot(value:OrderSnapshot){
    setSnapshot(previous=>linkedSales&&previous&&Date.parse(value.at||'')<Date.parse(previous.at||'')&&!runtime()?.offlineStatus?.().pending?previous:value);
  }
  useEffect(()=>{
    if(!members.length)return;
    let active=true,version=0;
    const update=(event:Event)=>{version++;if(active)acceptSnapshot((event as CustomEvent<OrderSnapshot>).detail);};
    const before=version;setBusy(true);setError('');
    void readSnapshot().then(value=>{if(active&&value&&(linkedSales||version===before))acceptSnapshot(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    document.addEventListener('alliance-operations-updated',update);
    return()=>{active=false;document.removeEventListener('alliance-operations-updated',update);};
  },[locationId,!!members.length,linkedSales,linkedSales&&online]);
  const historyKey=useMemo(()=>snapshot?.salesHistoryPartial?JSON.stringify([locationId,days,snapshot.sales,snapshot.model.customerPayments]):locationId+':'+days+':local',[locationId,days,snapshot]);
  useEffect(()=>{
    if(!snapshot?.salesHistoryPartial||!members.length||!online)return;
    let active=true;const now=Date.now();let start=now-days*86400000;
    const debts=new Map((snapshot.model.debts||[]).map(d=>[d.id,d]));
    for(const receipt of snapshot.model.customerPayments||[])if(Date.parse(receipt.createdAt||receipt.at||'')>=start)for(const allocation of receipt.allocations){const at=Date.parse(debts.get(allocation.debtId)?.at||'');if(Number.isFinite(at))start=Math.min(start,at);}
    const day=(n:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(n);
    type Record={saleId:string;sessionId:string;recordType?:string;date:string;invoice:string;waiter:string;total:number;subtotal:number;discount?:number;tax?:number;service?:number;tip?:number;tipAmount?:number;payments:PerformanceSale['payments'];items:{lineId:string;quantity:number;unitPrice:number}[]};
    void runtime()?.remote<{records:Record[];hasPartialHistory?:boolean;hasMore?:boolean}>('get_income_report',{dateFrom:day(start),dateTo:day(now),paymentMethod:'all',saleType:'all'}).then(report=>{
      if(!active||report.hasPartialHistory||report.hasMore)return;
      const sales:PerformanceSale[]=report.records.filter(r=>r.recordType!=='collection').map(r=>({id:r.saleId,sessionId:r.sessionId,createdAt:r.date,number:r.invoice,waiterName:r.waiter,payments:r.payments,totals:{total:r.total,subtotal:r.subtotal,tip:r.tipAmount??r.tip??Math.max(0,r.total-r.subtotal+(r.discount||0)-(r.tax||0)-(r.service||0))},items:r.items.map(l=>({id:l.lineId,quantity:l.quantity,unit_price:l.unitPrice}))}));
      setComplete({key:historyKey,sales});
    }).catch(e=>{if(active)setError('No se pudo completar el historial: '+e.message);});
    return()=>{active=false;};
  },[historyKey,online,retry]);
  const partial=!!snapshot?.salesHistoryPartial&&complete?.key!==historyKey;
  const rows=useMemo(()=>snapshot?waiterPerformance(complete?.key===historyKey?{...snapshot,sales:complete.sales}:snapshot,members,days):[],[snapshot,members,days,complete,historyKey]);
  const total=rows.reduce((n,r)=>n+r.amount,0),maximum=Math.max(1,...rows.map(r=>r.amount));
  async function reload(){setBusy(true);setError('');try{const next=await readSnapshot();if(next)acceptSnapshot(next);setRetry(n=>n+1);}catch(e){setError(e instanceof Error?e.message:'No se pudo consultar el rendimiento.');}finally{setBusy(false);}}
  if(!members.length)return null;
  return <section className="waiter-performance" aria-label="Rendimiento de meseros"><header><div><span className="eyebrow">COMANDAS DEL EQUIPO</span><h3><BarChart3 size={20}/>Rendimiento de meseros</h3><p>Comandas enviadas y ventas cobradas de cada mesero.</p></div><div className="waiter-performance-controls"><label>Período<select aria-label="Período de rendimiento" value={days} onChange={e=>{setDays(Number(e.target.value));setLimits({});}}><option value={1}>Últimas 24 horas</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label><button type="button" className="secondary" disabled={busy} aria-label="Actualizar rendimiento" onClick={()=>void reload()}><RefreshCw size={16}/></button></div></header>
    {partial&&<p className="notice" role="status">Historial local parcial: los importes y las estrellas se completarán al consultar el historial conectado.</p>}{error&&<p role="alert" className="form-error">{error}</p>}{busy&&!snapshot&&<p role="status">Consultando comandas…</p>}
    <div className="waiter-performance-grid">{rows.map((row,index)=><details className="waiter-performance-card" key={locationId+':'+row.id}>
      <summary className="waiter-person-summary"><span className="waiter-rank">{index+1}</span><span className="waiter-person-name"><strong>{row.name}</strong><small>{row.sent} comandas · {row.paid} cobradas · {total>0?(row.amount/total*100).toLocaleString('es-CO',{maximumFractionDigits:1}):'0'} % del equipo</small></span><span className="waiter-person-sales"><small>Ventas cobradas</small><strong className="waiter-performance-amount">{money(row.amount)}</strong></span><span className="waiter-person-tips"><small>Propinas recibidas</small><strong>{money(row.tips)}</strong></span><ChevronDown size={18} className="waiter-person-chevron"/></summary>
      <div className="waiter-person-detail"><span className="waiter-performance-label">Ventas y propinas se muestran por separado</span><progress max={maximum} value={row.amount} aria-label={'Ventas cobradas de '+row.name}/><div className="waiter-performance-numbers"><span><b>{row.sent}</b>Enviadas</span><span><b>{row.accepted}</b>Atendidas</span><span><b>{row.paid}</b>Cobradas</span></div><small className="waiter-outcomes">{row.pending} por aceptar · {row.rejected} rechazadas · {row.cancelled} anuladas</small><div className="waiter-rating"><span className="waiter-stars" role="img" aria-label={partial?'Historial pendiente de completar':row.rating===null?'Sin actividad para calificar':row.rating+' de 5 estrellas de cierre'}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width:(partial?0:row.rating||0)/5*100+'%'}}>★★★★★</span></span><b>{partial?'Completando historial':row.rating===null?'Sin actividad':row.rating.toFixed(1)+' / 5'}</b></div><small className="waiter-rating-label">Cierre de comandas · {row.paid} de {row.sent} cobradas</small><button type="button" className="waiter-performance-toggle" aria-expanded={opened.includes(row.id)} aria-controls={'waiter-orders-'+row.id} onClick={()=>setOpened(current=>current.includes(row.id)?current.filter(id=>id!==row.id):[...current,row.id])}>Ver desglose<ChevronDown size={16}/></button>{opened.includes(row.id)&&<div id={'waiter-orders-'+row.id} className="waiter-performance-orders">{!row.orders.length&&<p>Sin comandas en este período.</p>}{row.orders.slice(0,limits[row.id]||10).map(order=><div key={order.id}><span><span className="waiter-order-heading"><b>{linkedSales?waiterTableLabel(order.table):order.table}</b>{linkedSales&&order.sales.map(sale=><span key={sale.id} className="waiter-sale-reference" title={'Identificador de venta: '+sale.id}>Venta {sale.invoice}</span>)}</span><small>Enviada: {date(order.at)}</small>{order.collections.map((collection,i)=><small key={collection.id+'-'+i}>Cobro: {date(collection.at)} · {money(collection.amount)} · Propina {money(collection.tip)} · {collection.invoice}</small>)}</span><span><b>{money(order.amount)}</b><small>Propinas {money(order.tips)}</small><small>{order.status}</small></span></div>)}{row.orders.length>(limits[row.id]||10)&&<button type="button" className="secondary" onClick={()=>setLimits(value=>({...value,[row.id]:(value[row.id]||10)+10}))}>Ver más comandas</button>}</div>}</div></details>)}</div>
    <details className="waiter-method"><summary>Cómo se calcula el progreso</summary><p className="team-footnote">El dinero cuenta en la fecha del cobro y se reparte por los consumos de cada comanda; incluye descuentos e impuestos. Las propinas aceptadas y cobradas se muestran aparte, repartidas según el consumo de cada comanda; no incluyen crédito pendiente ni equivalen al reparto entre empleados de la sección Propinas. Enviadas, atendidas y cobradas corresponden a las comandas enviadas en el período. Estrellas = 5 × cobradas ÷ enviadas; una comanda con saldo pendiente todavía no cuenta como cobrada. Es un índice de cierre, no una opinión del cliente ni una evaluación de horas trabajadas. {runtime()?.offlineStatus?.().pending?'Incluye registros de este equipo pendientes de sincronizar.':'Se actualiza con los datos descargados de la sucursal.'}</p></details>
  </section>;
}
