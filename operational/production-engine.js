/* Physical production and preparation ledgers. Every edit applies a delta. */
globalThis.AllianceProduction=(()=>{
  const E=()=>AllianceOperationsEngine,M=()=>AllianceMaterialsEngine,clone=v=>structuredClone(v),id=()=>crypto.randomUUID();
  const gcobarf=()=>globalThis.BRANCH_CONFIG?.slug==='gcobarf';
  const fail=message=>{throw Error(message);};
  function move(state,actor,ingredient,delta,kind,reference){E().move(state.operations,ingredient,delta,kind,reference,{id:id(),actorId:actor.id,actorName:actor.full_name||actor.name,at:new Date().toISOString()});}
  function demand(state,recipe){
    const parts=new Map();
    for(const line of recipe.lines){const ingredient=state.costing.model.ingredients.find(i=>i.id===line.ingredientId),stockId=ingredient?.stockId||M().stockSuggestion(state,ingredient||{}).stockId,raw=state.operations.ingredients.find(i=>i.id===stockId&&!i.archived);if(!raw)fail('Selecciona el insumo de la macro para '+(ingredient?.name||'cada fila')+'.');const quantity=E().convert(AllianceCosting.lineQuantity(line),line.unit,raw.unit,state.units);const row=parts.get(raw.id)||{ingredientId:raw.id,name:raw.name,unit:raw.unit,quantity:0};row.quantity+=quantity;parts.set(raw.id,row);}
    if(!parts.size)fail('Selecciona al menos un insumo antes de registrar la producción.');return [...parts.values()];
  }
  function stockMove(state,product,delta,actor,reference){const stock=state.stock[product];if(!stock||stock.stock+delta<-1e-8)fail('La corrección supera las unidades terminadas que quedan; parte de esta producción ya fue vendida.');const before=stock.stock;stock.stock+=delta;stock.version=(stock.version||0)+1;state.movements.push({movementId:id(),productId:product,product:stock.name,delta,before,after:stock.stock,type:delta>=0?'ENTRADA_PRODUCCION':'CORRECCION_PRODUCCION',reference,date:new Date().toISOString(),user:actor.full_name,unitCost:stock.costPrice});}
  function post(state,recipeId,actor){
    if(!gcobarf())fail('La producción terminada pertenece a GCOBARF.');
    const recipe=state.costing.model.recipes.find(r=>r.id===recipeId);if(!recipe)fail('Hoja de producción no disponible.');
    const productIds=new Set(state.operations.recipes.filter(r=>r.recipeId===recipeId).map(r=>r.productId));if(state.docs.session_items.some(i=>productIds.has(i.menu_item_id)&&i.status!=='cancelled'&&state.docs.table_sessions.some(s=>s.id===i.session_id&&s.status==='open')))fail('Cierra las cuentas anteriores de este producto antes de registrar su producción.');
    state.operations.productions||=[];const old=state.operations.productions.find(r=>r.recipeId===recipeId),parts=demand(state,recipe),previous=new Map((old?.parts||[]).map(p=>[p.ingredientId,p.quantity]));
    const deltas=new Map(parts.map(p=>[p.ingredientId,p.quantity-(previous.get(p.ingredientId)||0)]));for(const [rawId,quantity]of previous)if(!deltas.has(rawId))deltas.set(rawId,-quantity);
    for(const [rawId,delta]of deltas){const raw=state.operations.ingredients.find(i=>i.id===rawId);if(!raw||raw.quantity-delta<-1e-8)fail('No alcanza '+(raw?.name||'un insumo')+' para el adicional de esta producción.');}
    let transferred=old?.transferred||0;if(recipe.output<transferred){stockMove(state,old.productId,recipe.output-transferred,actor,recipeId);transferred=recipe.output;}
    for(const [rawId,delta]of deltas)if(Math.abs(delta)>1e-8)move(state,actor,state.operations.ingredients.find(i=>i.id===rawId),-delta,'production',recipeId);
    const calculated=AllianceCosting.calculate(state.costing.model,recipe),row={...old,recipeId,id:recipeId,output:recipe.output,transferred,parts,cost:(calculated.ingredients+calculated.direct)*recipe.output,finalUnitCost:calculated.fullCost,monthlyUnitCost:calculated.allocated,at:new Date().toISOString(),actorId:actor.id};
    if(row.productId&&state.stock[row.productId])Object.assign(state.stock[row.productId],{costPrice:row.cost/row.output,finalProductionCost:row.finalUnitCost});
    state.operations.productions=state.operations.productions.filter(p=>p.recipeId!==recipeId);state.operations.productions.push(row);state.operations.recipes=state.operations.recipes.filter(r=>r.recipeId!==recipeId);return row;
  }
  function transfer(state,recipeId,productId,actor){
    if(!gcobarf())fail('La producción terminada pertenece a GCOBARF.');const batch=state.operations.productions?.find(p=>p.recipeId===recipeId);if(!batch)fail('Guarda la hoja de producción para descontar sus insumos antes de agregarla al inventario.');
    if(batch.productId&&batch.productId!==productId)fail('Esta producción ya está vinculada a otro producto del inventario.');if(state.operations.productions.some(p=>p.recipeId!==recipeId&&p.productId===productId))fail('Elige un producto distinto para esta hoja de producción.');
    const quantity=Math.max(0,batch.output-batch.transferred);if(quantity)stockMove(state,productId,quantity,actor,recipeId);batch.productId=productId;batch.transferred=batch.output;Object.assign(state.stock[productId],{costPrice:batch.cost/batch.output,finalProductionCost:batch.finalUnitCost??batch.cost/batch.output});state.operations.recipes=state.operations.recipes.filter(r=>r.productId!==productId);return batch;
  }
  function reconcile(state,actor){
    if(gcobarf())return;state.operations.preparations||=[];const proposed=[],deltas=new Map(),active=state.operations.preparations.filter(p=>p.status==='active'),ids=new Set([...active.map(p=>p.id),...state.docs.session_items.filter(i=>i.status!=='cancelled'&&state.docs.table_sessions.some(s=>s.id===i.session_id&&s.status==='open')&&state.operations.recipes.some(r=>r.managed&&r.productId===i.menu_item_id)).map(i=>i.id)]);
    for(const itemId of ids){const old=active.find(p=>p.id===itemId),line=state.docs.session_items.find(i=>i.id===itemId),session=state.docs.table_sessions.find(s=>s.id===line?.session_id),recipe=state.operations.recipes.find(r=>r.managed&&r.productId===line?.menu_item_id);if(state.operations.preparations.some(p=>p.id===itemId&&p.status==='sold'))continue;
      const wanted=line&&line.status!=='cancelled'&&session?.status==='open'&&recipe;const parts=wanted?recipe.lines.map(p=>{const raw=state.operations.ingredients.find(i=>i.id===p.ingredientId);return {...p,unit:raw.unit,quantity:E().convert(p.quantity,p.unit,raw.unit,state.units)*line.quantity};}):[];
      if(!old&&!wanted)continue;for(const p of old?.parts||[])deltas.set(p.ingredientId,(deltas.get(p.ingredientId)||0)-p.quantity);for(const p of parts)deltas.set(p.ingredientId,(deltas.get(p.ingredientId)||0)+p.quantity);
      if(old&&wanted&&old.quantity===line.quantity&&old.productId===line.menu_item_id&&JSON.stringify(old.parts)===JSON.stringify(parts))continue;proposed.push({...old,id:itemId,sessionId:line?.session_id||old.sessionId,productId:line?.menu_item_id||old.productId,recipeId:recipe?.recipeId||old?.recipeId,quantity:wanted?line.quantity:0,status:wanted?'active':'cancelled',parts});
    }
    for(const [rawId,delta]of deltas){const raw=state.operations.ingredients.find(i=>i.id===rawId);if(!raw||raw.archived&&delta>0||raw.quantity-delta<-1e-8)fail('No alcanza '+(raw?.name||'un insumo')+' para preparar el consumo.');}
    for(const [rawId,delta]of deltas)if(Math.abs(delta)>1e-8)move(state,actor,state.operations.ingredients.find(i=>i.id===rawId),-delta,'preparation','Consumos en preparación');
    for(const row of proposed){state.operations.preparations=state.operations.preparations.filter(p=>p.id!==row.id);state.operations.preparations.push(row);}
  }
  function settle(state,line,saleId,sessionId){const row=state.operations.preparations?.find(p=>p.id===line.id&&p.status==='active'&&p.productId===line.menu_item_id&&p.sessionId===sessionId);if(!row)return false;if(row.quantity!==line.quantity)fail('El consumo cambió. Actualiza antes de cobrar.');row.status='sold';row.saleId=saleId;line.recipeId=row.recipeId;line.recipeConsumption=row.parts.map(p=>({...p,quantity:p.quantity/row.quantity}));return true;}
  return {post,transfer,reconcile,settle,demand};
})();
