/* Ingredient valuation and receipt analysis. Physical ingredients are valued once. */
globalThis.AllianceMaterialAccounting=(()=>{
 const money=n=>Math.round((n+Number.EPSILON)*100)/100,colombiaDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
 const allowed=(context,location,demoRole)=>demoRole?demoRole==='boss':!!context&&(context.is_owner||(context.roles?.[location]||[]).some(r=>r==='OWNER'||r==='BOSS'));
 function valuation(snapshot){const rows=(snapshot?.model?.ingredients||[]).filter(r=>!r.archived);return rows.reduce((v,r)=>v+Math.max(0,Number(r.quantity)||0)*Math.max(0,Number(r.unitCost)||0),0);}
 function stockSummary(snapshot,products,stock){
  const materialState={operations:snapshot.model,docs:snapshot.docs,units:snapshot.units},capacities=AllianceMaterialsEngine.cartCapacities(materialState,[]);
  let units=0,potential=0,investment=valuation(snapshot);
  for(const product of products){const item=stock(product),capacity=capacities.get(product.id);if(capacity!==undefined&&capacity!==null){units+=capacity;if(product.is_available!==false)potential+=capacity*Number(product.price||0);}else{units+=Math.max(0,item.stock);investment+=Math.max(0,item.stock)*item.costPrice;if(product.is_available!==false)potential+=Math.max(0,item.stock)*Number(product.price||0);}}
  return {units,costValue:investment,saleValue:potential};
 }
 function entries(model){
  const stored=model.materialLedger||[],seen=new Set(stored.flatMap(r=>[r.id,r.movementId].filter(Boolean)));
  const legacy=model.materialLedgerAvailable?[]:(model.materialMovements||[]).filter(r=>!seen.has(r.id)&&(r.delta>0||['out','adjustment'].includes(r.kind))).map(r=>({...r,movementId:r.id,source:'legacy',estimated:true,totalCost:Math.abs(r.delta)*Number(r.unitCost||0),unit:r.unit||model.ingredients?.find(i=>i.id===r.ingredientId)?.unit||'',costBefore:r.unitCost,costAfter:r.unitCost}));
  return [...stored,...legacy];
 }
 function report(model,{from='',to='',ingredientId='',actorId='',offset=0,limit=50}={}){
  const day=at=>{try{return colombiaDay.format(new Date(at));}catch{return '';}};
  const rows=entries(model).filter(r=>{const d=from||to?day(r.at):'';return (!from||d>=from)&&(!to||d<=to)&&(!ingredientId||r.ingredientId===ingredientId)&&(!actorId||r.actorId===actorId);}).sort((a,b)=>String(b.at).localeCompare(String(a.at))||String(b.id).localeCompare(String(a.id)));
  let registeredValue=0,estimatedValue=0,entryCount=0;const groups=new Map();
  for(const row of rows){if(!(row.delta>0)||['opening','correction','return'].includes(row.source))continue;entryCount++;const amount=Number(row.totalCost)||0;if(row.estimated)estimatedValue+=amount;else registeredValue+=amount;let group=groups.get(row.ingredientId);if(!group){group={ingredientId:row.ingredientId,name:row.name,unit:row.unit,quantity:0,registeredValue:0,estimatedValue:0,entries:0};groups.set(row.ingredientId,group);}group.quantity+=row.delta;group.entries++;group[row.estimated?'estimatedValue':'registeredValue']+=amount;}
  return {registeredValue:money(registeredValue),estimatedValue:money(estimatedValue),entryCount,ingredients:[...groups.values()].sort((a,b)=>(b.registeredValue+b.estimatedValue)-(a.registeredValue+a.estimatedValue)),records:rows.slice(offset,offset+limit),total:rows.length,hasMore:offset+limit<rows.length,nextOffset:offset+limit,partial:!!model.materialLedgerPartial,local:true};
 }
 return {allowed,valuation,stockSummary,entries,report};
})();
