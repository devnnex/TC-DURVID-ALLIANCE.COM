/* Read-only stock alerts. The same rules run in the browser and delivery worker. */
globalThis.AllianceStockAlerts = (() => {
  const quantity=n=>Math.round(Math.max(0,Number(n)||0)*1e6)/1e6;
  const unitTable={g:['mass',1],kg:['mass',1000],lb:['mass',453.59237],oz:['mass',28.349523125],ml:['volume',1],l:['volume',1000],u:['count',1],unit:['count',1],unidad:['count',1]};
  function convert(value,from,to,units=[]){
    const lookup=id=>{const custom=units.find(u=>u.id===id);return custom?[String(custom.dimension).toLowerCase(),Number(custom.factor)]:unitTable[id];};
    const a=lookup(from),b=lookup(to);if(!a||!b||a[0]!==b[0]||!(b[1]>0))return null;return value*a[1]/b[1];
  }
  function analyse(snapshot,{target=10}={}){
    const model=snapshot.model||snapshot.operations||{},docs=snapshot.docs||{},units=snapshot.units||[];
    const ingredients=new Map((model.ingredients||[]).filter(i=>!i.archived).map(i=>[i.id,i]));
    const stock=new Map((Array.isArray(snapshot.inventory)?snapshot.inventory:Object.values(snapshot.stock||{})).map(i=>[i.productId,i]));
    const held=new Map(),prepared=new Set((model.preparations||[]).filter(p=>p.status==='active'||p.status==='sold').map(p=>p.id));
    const recipes=new Map((model.recipes||[]).filter(r=>r.managed).map(r=>[r.productId,r]));
    const productions=new Map((model.productions||[]).filter(p=>p.productId&&p.output>0).map(p=>[p.productId,p]));
    const open=new Set((docs.table_sessions||[]).filter(s=>s.status==='open').map(s=>s.id));
    for(const line of docs.session_items||[]){
      if(line.status==='cancelled'||!open.has(line.session_id)||prepared.has(line.id))continue;
      for(const part of recipes.get(line.menu_item_id)?.lines||[]){const raw=ingredients.get(part.ingredientId);if(!raw)continue;const n=convert(Number(part.quantity)*Number(line.quantity),part.unit,raw.unit,units);if(n!==null)held.set(raw.id,(held.get(raw.id)||0)+n);}
    }
    const available=id=>quantity((ingredients.get(id)?.quantity||0)-(held.get(id)||0));
    const alerts=[],covered=new Set();
    for(const product of docs.menu_items||[]){
      if(product.is_available===false)continue;
      const recipe=recipes.get(product.id),batch=productions.get(product.id);
      const parts=new Map();let invalid=false;
      for(const part of recipe?.lines||[]){
        const raw=ingredients.get(part.ingredientId),n=raw?convert(Number(part.quantity),part.unit,raw.unit,units):null;
        if(!raw||n===null||!Number.isFinite(n)||n<0){invalid=true;continue;}
        if(n>0)parts.set(raw.id,{id:raw.id,name:raw.name,unit:raw.unit,perUnit:(parts.get(raw.id)?.perUnit||0)+n});
      }
      let capacity=recipe?invalid||!parts.size?0:Math.max(0,Math.floor(Math.min(...[...parts.values()].map(p=>available(p.id)/p.perUnit))+1e-8)):stock.has(product.id)?quantity(stock.get(product.id).stock):null;
      if(capacity===null||capacity>=target)continue;
      const missing=[];
      if(recipe){for(const p of parts.values()){const needed=quantity(p.perUnit*target-available(p.id));if(needed>0){missing.push({...p,available:available(p.id),needed});covered.add(p.id);}}}
      else if(batch){
        const deficit=target-capacity;
        for(const part of batch.parts||[]){const raw=ingredients.get(part.ingredientId),perUnit=raw?convert(Number(part.quantity)/Number(batch.output),part.unit,raw.unit,units):null;if(!raw||perUnit===null){invalid=true;continue;}const needed=quantity(perUnit*deficit-available(raw.id));if(needed>0){missing.push({id:raw.id,name:raw.name,unit:raw.unit,available:available(raw.id),needed});covered.add(raw.id);}}
      }
      alerts.push({id:'product:'+product.id,productId:product.id,name:product.name,kind:recipe?'preparation':'finished',available:capacity,target,missing,configuration:invalid||!!recipe&&!parts.size,level:capacity<1?'out':'low'});
    }
    for(const raw of ingredients.values()){
      const balance=available(raw.id),minimum=Math.max(0,Number(raw.minStock)||0);
      if(covered.has(raw.id)||balance>0&&balance>=minimum)continue;
      const targetQuantity=minimum>0?minimum:1;
      alerts.push({id:'ingredient:'+raw.id,name:raw.name,kind:'ingredient',available:balance,target:targetQuantity,missing:[{id:raw.id,name:raw.name,unit:raw.unit,available:balance,needed:quantity(targetQuantity-balance)}],level:balance<=0?'out':'low'});
    }
    return alerts.sort((a,b)=>Number(b.level==='out')-Number(a.level==='out')||a.name.localeCompare(b.name,'es'));
  }
  const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
  function nextReminder(at){const n=Number(new Date(at)),key=day(n);for(const hour of ['06','18']){const stamp=Date.parse(key+'T'+hour+':30:00-05:00');if(stamp>n)return new Date(stamp).toISOString();}return new Date(Date.parse(key+'T06:30:00-05:00')+86400000).toISOString();}
  function slot(openedAt,at=new Date()){
    const now=Number(new Date(at)),start=Number(new Date(openedAt)),key=day(now),morning=Date.parse(key+'T06:30:00-05:00'),evening=morning+43200000;
    const latest=now>=evening?evening:now>=morning?morning:evening-86400000;
    return latest>start?new Date(latest).toISOString():'initial';
  }
  const format=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:3});
  function message(alert){
    if(alert.kind==='ingredient')return 'Repón '+format(alert.missing[0].needed)+' '+alert.missing[0].unit+' de '+alert.name+' para recuperar su mínimo.';
    const prefix=(alert.available<1?'Agotado. ':'Quedan '+format(alert.available)+'. ');
    if(alert.configuration)return prefix+'Revisa el vínculo de los insumos de esta receta.';
    if(alert.missing.length)return prefix+'Para '+alert.target+': repón '+alert.missing.map(p=>format(p.needed)+' '+p.unit+' de '+p.name).join('; ')+'.';
    return prefix+(alert.kind==='finished'?'Prepara o incorpora ':'Abastece ')+format(alert.target-alert.available)+' unidades para tener al menos '+alert.target+'.';
  }
  return {analyse,convert,nextReminder,slot,message};
})();
