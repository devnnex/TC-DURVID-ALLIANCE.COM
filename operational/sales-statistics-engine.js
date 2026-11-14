/* Read-only analytics. Monetary allocation is performed in integer cents. */
globalThis.AllianceSalesStatisticsEngine=(()=>{
  const DAY=86400000,zone='America/Bogota';
  const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}),hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});
  const dateKey=value=>dayFormat.format(new Date(value));
  const stamp=key=>Date.parse(key+'T00:00:00-05:00');
  const shift=(key,days)=>dateKey(stamp(key)+days*DAY);
  const validDate=key=>typeof key==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(key)&&Number.isFinite(stamp(key))&&dateKey(stamp(key))===key;
  function range(from,to,now=new Date()){
    if(!validDate(from)||!validDate(to)||from>to||to>dateKey(now))throw Error('Revisa las fechas: el inicio debe ser anterior al final y no puede haber días futuros.');
    const days=Math.round((stamp(to)-stamp(from))/DAY)+1;
    if(days>3660)throw Error('Elige un período de hasta diez años para mantener el informe ágil.');
    return {from,to,days,previous:{from:shift(from,-days),to:shift(from,-1)}};
  }
  function preset(key,now=new Date()){
    const to=dateKey(now);return range(key==='today'?to:key==='month'?to.slice(0,7)+'-01':key==='year'?to.slice(0,4)+'-01-01':shift(to,key==='7days'?-6:-29),to,now);
  }
  function cents(value){if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const number=Number(value),n=Math.round((number+Number.EPSILON)*100);return Number.isFinite(number)&&Number.isSafeInteger(n)?n:null;}
  function add(a,b){const sum=a+b;if(!Number.isSafeInteger(sum))throw Error('Los importes superan el tamaño seguro del cálculo. Reduce el período.');return sum;}
  function allocate(total,weights){
    const sum=weights.reduce((n,v)=>add(n,v),0);if(!sum)return weights.map(()=>0);
    const exact=weights.map(w=>total*(w/sum)),values=exact.map(Math.floor);let rest=total-values.reduce((a,b)=>a+b,0);
    const order=exact.map((v,index)=>({index,fraction:v-values[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
    for(let i=0;rest>0;i++,rest--)values[order[i%order.length].index]++;
    return values;
  }
  const tidy=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es');
  const fresh=()=>({net:0,gross:0,cost:0,costKnown:true,orders:0,tips:0,discount:0,tax:0,service:0,credit:0,receipts:0,collections:0});
  const exported=value=>({...value,net:value.net/100,gross:value.gross/100,cost:value.costKnown?value.cost/100:null,profit:value.costKnown?(value.net-value.cost)/100:null,margin:value.costKnown&&value.net>0?(value.net-value.cost)/value.net*100:null,averageTicket:value.orders?value.net/value.orders/100:0,tips:value.tips/100,discount:value.discount/100,tax:value.tax/100,service:value.service/100,credit:value.credit/100,receipts:value.receipts/100,collections:value.collections/100});
  const rank=(rows,key='net')=>rows.slice().sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||b.net-a.net||a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id));
  function analyse(records,selection,{catalog=[],partial=false,now=new Date()}={}){
    const period=range(selection.from,selection.to,now),totals=fresh(),products=new Map(),categories=new Map(),months=new Map(),hours=Array.from({length:24},(_,hour)=>({...fresh(),id:String(hour),hour})),weekdays=Array.from({length:7},(_,day)=>({...fresh(),id:String(day),day,days:0}));
    const quality={partial:!!partial,invalid:0,duplicates:0,missingDetails:0,missingCosts:0,missingProductCosts:0,unclassified:0,tipMismatch:0},seen=new Set(),catalogById=new Map(catalog.map(p=>[String(p.id),p]));
    for(let key=period.from;key<=period.to;key=shift(key,1)){
      const month=key.slice(0,7),weekday=new Date(key+'T12:00:00Z').getUTCDay();weekdays[weekday].days++;
      if(!months.has(month)){const first=month+'-01',end=dateKey(Date.parse(first+'T12:00:00Z')+32*DAY).slice(0,7)+'-01';months.set(month,{...fresh(),id:month,name:month,days:0,partial:period.from>first||period.to<shift(end,-1)});}months.get(month).days++;
    }
    function noteSale(bucket,sale){for(const key of ['net','gross','tips','discount','tax','service','credit','receipts'])bucket[key]=add(bucket[key],sale[key]);bucket.orders++;if(sale.cost===null)bucket.costKnown=false;else bucket.cost=add(bucket.cost,sale.cost);}
    function product(line,record){
      const id=line.menuItemId?String(line.menuItemId):'manual:'+tidy(line.name),meta=catalogById.get(id),category=String(line.categoryName||meta?.category||'Sin categoría'),unit=String(line.unit||meta?.unit||'');
      if(!products.has(id))products.set(id,{id,name:String(line.name||meta?.name||'Consumo sin detalle'),category,unit,quantity:0,net:0,cost:0,costKnown:true,at:'',orders:0});
      const row=products.get(id);if(record.date>=row.at){row.name=String(line.name||meta?.name||row.name);row.at=record.date;}
      return row;
    }
    for(const record of records||[]){
      if(!record||record.voided)continue;const instant=Date.parse(record.date);if(!Number.isFinite(instant)){quality.invalid++;continue;}const day=dateKey(instant);if(day<period.from||day>period.to)continue;if(instant>Number(now)){quality.invalid++;continue;}
      const id=String(record.saleId||''),key=(record.recordType==='collection'?'collection:':'sale:')+id;
      if(!id){quality.invalid++;continue;}if(seen.has(key)){quality.duplicates++;continue;}seen.add(key);
      const gross=cents(record.total);if(gross===null||gross<0){quality.invalid++;continue;}
      if(record.recordType==='collection'){
        totals.collections=add(totals.collections,gross);for(const payment of record.payments||[]){const amount=cents(payment.amount);if(payment.method!=='credit'&&amount!==null&&amount>=0)totals.receipts=add(totals.receipts,amount);}continue;
      }
      const subtotal=cents(record.subtotal),discount=cents(record.discount??0),tax=cents(record.tax??0),service=cents(record.service??0),cost=cents(record.cost);
      if([subtotal,discount,tax,service].some(n=>n===null||n<0)||discount>subtotal){quality.invalid++;continue;}
      const net=subtotal-discount,impliedTip=gross-net-tax-service,explicitTip=cents(record.tipAmount??record.tip),tip=explicitTip??Math.max(0,impliedTip);
      if(impliedTip<0||Math.abs(gross-(net+tax+service+tip))>1)quality.tipMismatch++;
      let receipts=0,credit=0;for(const payment of record.payments||[]){const amount=cents(payment.amount);if(amount===null||amount<0)continue;if(payment.method==='credit')credit=add(credit,amount);else receipts=add(receipts,amount);}
      const sale={net,gross,tips:tip,discount,tax,service,cost:cost!==null&&cost>=0?cost:null,credit,receipts};if(sale.cost===null)quality.missingCosts++;
      const hour=Number(hourFormat.format(instant)),weekday=new Date(day+'T12:00:00Z').getUTCDay();
      for(const bucket of [totals,months.get(day.slice(0,7)),hours[hour],weekdays[weekday]])noteSale(bucket,sale);
      let lines=Array.isArray(record.items)?record.items.filter(l=>l&&l.status!=='cancelled'):[];
      let weights=lines.map(l=>cents(l.total??Number(l.quantity)*Number(l.unitPrice)));
      if(!lines.length||lines.some((l,i)=>!Number.isFinite(Number(l.quantity))||Number(l.quantity)<=0||weights[i]===null||weights[i]<0)||Math.abs(weights.reduce((a,b)=>a+(b||0),0)-subtotal)>1){
        quality.missingDetails++;lines=[{menuItemId:'__unallocated__',name:'Consumos sin desglose',quantity:0,total:subtotal,cost:sale.cost===null?null:sale.cost/100}];weights=[subtotal];
      }
      const shares=allocate(net,weights),costWeights=lines.map(l=>cents(l.cost)),completeCost=sale.cost!==null&&costWeights.every(n=>n!==null&&n>=0)&&Math.abs(costWeights.reduce((a,b)=>a+(b||0),0)-sale.cost)<=1;
      if(!completeCost&&sale.cost!==null)quality.missingProductCosts++;
      const costs=completeCost?allocate(sale.cost,costWeights):lines.map(()=>null),counted=new Set();
      lines.forEach((line,index)=>{
        const row=product(line,record);row.net=add(row.net,shares[index]);row.quantity=Math.round((row.quantity+Number(line.quantity))*1e6)/1e6;
        if(costs[index]===null)row.costKnown=false;else row.cost=add(row.cost,costs[index]);if(!counted.has(row.id)){row.orders++;counted.add(row.id);}
        const category=row.category;if(category==='Sin categoría')quality.unclassified++;
        if(!categories.has(category))categories.set(category,{id:category,name:category,net:0});const group=categories.get(category);group.net=add(group.net,shares[index]);
      });
    }
    const productRows=[...products.values()].map(p=>({...p,net:p.net/100,cost:p.costKnown?p.cost/100:null,profit:p.costKnown?(p.net-p.cost)/100:null,margin:p.costKnown&&p.net>0?(p.net-p.cost)/p.net*100:null,share:totals.net>0?p.net/totals.net*100:0}));
    const monthRows=[...months.values()].map(m=>({...exported(m),id:m.id,name:m.name,days:m.days,partial:m.partial,dailyAverage:m.days?m.net/m.days/100:0}));
    const categoryRows=rank([...categories.values()].map(c=>({...c,net:c.net/100,share:totals.net>0?c.net/totals.net*100:0})));
    const hourRows=hours.map(h=>({...exported(h),id:h.id,hour:h.hour})),weekdayRows=weekdays.map(d=>({...exported(d),id:d.id,day:d.day,days:d.days,dailyAverage:d.days?d.net/d.days/100:0,averageOrders:d.days?d.orders/d.days:0}));
    const sortedProducts=rank(productRows),sortedMonths=rank(monthRows),bestHour=hourRows.filter(h=>h.orders).sort((a,b)=>b.orders-a.orders||b.net-a.net||a.hour-b.hour)[0]||null;
    return {range:period,totals:exported(totals),quality,products:sortedProducts,categories:categoryRows,months:monthRows,hours:hourRows,weekdays:weekdayRows,quantityComparable:productRows.length>0&&productRows.every(p=>p.unit)&&new Set(productRows.map(p=>tidy(p.unit))).size===1,insights:{topProduct:sortedProducts[0]||null,bestMonth:sortedMonths.find(m=>m.orders)||null,peakHour:bestHour,topThreeShare:totals.net>0?sortedProducts.slice(0,3).reduce((n,p)=>n+p.net,0)/(totals.net/100)*100:null,lowestMargin:productRows.filter(p=>p.margin!==null&&p.net>0).sort((a,b)=>a.margin-b.margin||b.net-a.net)[0]||null}};
  }
  function compare(current,previous){
    const reliable=!current.quality.partial&&!previous.quality.partial&&!current.quality.invalid&&!previous.quality.invalid;
    const change=key=>{const a=current.totals[key],b=previous.totals[key];return reliable&&a!==null&&b!==null&&b>0?(a-b)/b*100:null;};
    return {reliable,net:change('net'),profit:change('profit'),orders:change('orders'),averageTicket:change('averageTicket')};
  }
  return {dateKey,range,preset,analyse,compare,rank,allocate};
})();
