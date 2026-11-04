/* Shared raw-material rules. Managed recipes alone opt into the new workflow. */
globalThis.AllianceMaterialsEngine=(()=>{
  const E=()=>AllianceOperationsEngine,round=n=>Math.round(n*1e8)/1e8;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  const base=u=>['g','kg','lb','oz'].includes(u)?'g':['ml','l'].includes(u)?'ml':'u';
  function stockSuggestion(state,ingredient){
    const compatible=state.operations.ingredients.filter(raw=>!raw.archived&&base(raw.unit)===base(ingredient.unit));
    const unique=ids=>{const matches=compatible.filter(raw=>ids.has(raw.id));return {stockId:matches.length===1?matches[0].id:null,ambiguous:matches.length>1};};
    if(ingredient.stockId){const result=unique(new Set([ingredient.stockId]));if(result.stockId)return result;}
    const linked=state.operations.recipes.filter(r=>r.managed&&state.docs.menu_items.some(p=>p.id===r.productId));
    const same=unique(new Set(linked.flatMap(r=>(r.mappings||[]).filter(m=>m.ingredientId===ingredient.id).map(m=>m.stockId))));
    if(same.stockId||same.ambiguous)return same;
    const exact=unique(new Set(compatible.filter(raw=>norm(raw.name)===norm(ingredient.name)).map(raw=>raw.id)));
    if(exact.stockId||exact.ambiguous)return exact;
    const catalog=state.costing?.model?.ingredients||[];
    const commonIds=new Set(catalog.filter(i=>norm(i.name)===norm(ingredient.name)&&base(i.unit)===base(ingredient.unit)).map(i=>i.id));
    return unique(new Set(linked.flatMap(r=>(r.mappings||[]).filter(m=>commonIds.has(m.ingredientId)).map(m=>m.stockId))));
  }
  function fail(message,code='MATERIALS_INPUT',details){const e=new Error(message);e.code=code;e.materials=details;throw e;}
  function number(v,label,min=0,max=1e12){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Revisa '+label+'.');return v;}
  function reserved(state,excludeSession){const sums=new Map();for(const line of state.docs.session_items||[]){if(state.operations.preparations?.some(p=>p.id===line.id&&p.status==='active')||line.status==='cancelled'||line.session_id===excludeSession||!state.docs.table_sessions.some(s=>s.id===line.session_id&&s.status==='open'))continue;const r=state.operations.recipes.find(r=>r.productId===line.menu_item_id&&r.managed);if(!r)continue;for(const p of r.lines){const i=state.operations.ingredients.find(i=>i.id===p.ingredientId);if(i)sums.set(i.id,(sums.get(i.id)||0)+E().convert(p.quantity,p.unit,i.unit,state.units)*line.quantity);}}return sums;}
  function shortages(state,items=[],excludeSession){const held=reserved(state,excludeSession),demand=new Map(held);for(const line of items){const r=state.operations.recipes.find(r=>r.productId===(line.menu_item_id||line.menuItemId||line.productId)&&r.managed);if(!r)continue;for(const p of r.lines){const i=state.operations.ingredients.find(i=>i.id===p.ingredientId);if(!i||i.archived)fail('Un insumo de la receta no está disponible.','MATERIALS_MISSING');demand.set(i.id,(demand.get(i.id)||0)+E().convert(p.quantity,p.unit,i.unit,state.units)*line.quantity);}}
    return [...demand].flatMap(([id,needed])=>{const i=state.operations.ingredients.find(i=>i.id===id);return !i||needed>i.quantity+1e-8?[{id,name:i?.name||'Insumo no disponible',unit:i?.unit||'',available:items.length?Math.max(0,(i?.quantity||0)-(held.get(id)||0)):i?.quantity||0,needed:round(items.length?needed-(held.get(id)||0):needed),missing:round(needed-(i?.quantity||0))}]:[];});}
  function guard(state,items=[],excludeSession,actor){if(actor)globalThis.AllianceProduction?.reconcile(state,actor);const missing=shortages(state,items,excludeSession);if(missing.length)fail('No alcanza '+missing.map(i=>i.name).join(', ')+'. Abastece la macro de insumos.','MATERIALS_INSUFFICIENT',missing);}
  function portions(state,product,held=reserved(state)){const r=state.operations.recipes.find(r=>r.productId===product&&r.managed);if(!r)return null;return Math.max(0,Math.floor(Math.min(...r.lines.filter(p=>p.quantity>0).map(p=>{const i=state.operations.ingredients.find(i=>i.id===p.ingredientId);return i&&!i.archived?(i.quantity-(held.get(i.id)||0))/E().convert(p.quantity,p.unit,i.unit,state.units):0;}))+1e-8));}
  function supplyNeeds(state,recipeId,parts,output,salePortions=1){
    const previous=state.operations.recipeSupplies?.find(r=>r.recipeId===recipeId),held=reserved(state);
    return parts.map(p=>{const raw=state.operations.ingredients.find(i=>i.id===p.ingredientId),quantity=round(E().convert(p.quantity,p.unit,raw.unit,state.units)*output/salePortions),covered=previous?.parts.find(i=>i.ingredientId===raw.id)?.quantity||0;return {ingredientId:raw.id,name:raw.name,unit:raw.unit,quantity,covered,missing:round(Math.max(0,quantity-Math.max(raw.quantity-(held.get(raw.id)||0),covered)))};});
  }
  function apply(state,command,actor){const p=command.payload,k=command.command,s=state.operations,meta={id:command.id,at:new Date().toISOString(),actorId:actor.id,actorName:actor.full_name||actor.name};
    const historyBefore=['materials_save','materials_adjust','materials_delete'].includes(k)?structuredClone(s.ingredients.find(i=>i.id===(p.id||p.ingredientId))||null):null;
    if(k==='materials_link'){
      if(state.costing?.revision!==p.revision)fail('La hoja cambió. Guarda y vuelve a abrir el vínculo.','VERSION_CONFLICT');const model=state.costing.model,r=model.recipes.find(r=>r.id===p.recipeId);if(!r?.lines.length)fail('Elige una receta guardada.');
      if(!state.docs.menu_items.some(i=>i.id===p.productId))fail('Producto no disponible.');if(state.docs.session_items.some(l=>l.menu_item_id===p.productId&&l.status!=='cancelled'&&state.docs.table_sessions.some(s=>s.id===l.session_id&&s.status==='open')))fail('Cobra o retira los consumos de este producto antes de cambiar su receta.');
      number(p.salePortions,'porciones por unidad',0.000001,1e6);if(!Array.isArray(p.mappings)||p.mappings.length>100)fail('Revisa los vínculos de los insumos.');const mapping=new Map(p.mappings.map(m=>[m.ingredientId,m.stockId]));if(mapping.size!==p.mappings.length)fail('Vínculo de insumo repetido.');const parts=new Map();
      for(const line of r.lines){const ing=model.ingredients.find(i=>i.id===line.ingredientId),rawId=mapping.get(ing.id);if(typeof rawId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(rawId))fail('Selecciona el insumo de '+ing.name+'.');let raw=s.ingredients.find(i=>i.id===rawId);if(!raw){if(s.ingredients.some(i=>!i.archived&&norm(i.name)===norm(ing.name)&&base(i.unit)===base(ing.unit)))fail('Ya existe '+ing.name+' en la macro. Selecciónalo para compartir sus existencias.','VERSION_CONFLICT');raw={id:rawId,name:ing.name,unit:base(ing.unit),quantity:0,unitCost:AllianceCosting.ingredientCost(ing)*E().convert(1,base(ing.unit),ing.unit,state.units),minStock:0,revision:1,...meta};raw.id=rawId;s.ingredients.push(raw);}if(raw.archived)fail('El insumo está retirado de la macro.');
        const q=E().convert(AllianceCosting.lineQuantity(line),line.unit,raw.unit,state.units)*p.salePortions/(line.stage==='portion'?1:r.output);if(q>0){const old=parts.get(raw.id);parts.set(raw.id,{ingredientId:raw.id,name:raw.name,unit:raw.unit,quantity:(old?.quantity||0)+q});}}
      if(!parts.size)fail('La receta necesita cantidades mayores que cero.');const c=AllianceCosting.calculate(model,r),overhead=(r.sheet?(c.worksheet.unforeseen+c.worksheet.management)/r.output:c.direct)*p.salePortions;
      s.recipes=s.recipes.filter(v=>v.productId!==p.productId);s.recipes.push({id:p.productId,productId:p.productId,name:state.docs.menu_items.find(i=>i.id===p.productId).name,recipeId:r.id,managed:true,salePortions:p.salePortions,mappings:structuredClone(p.mappings),overheadCost:overhead,lines:[...parts.values()].sort((a,b)=>a.ingredientId<b.ingredientId?-1:a.ingredientId>b.ingredientId?1:0),...meta,id:p.productId});
      if(p.supplyRecipe!==undefined&&typeof p.supplyRecipe!=='boolean')fail('Revisa el abastecimiento de la receta.');
      if(p.supplyRecipe){
        if(!['cafeteria','cocteleria'].includes(globalThis.BRANCH_CONFIG?.slug))fail('Este abastecimiento pertenece a Jesspreso Olivia y Coctelería.');
        const needs=supplyNeeds(state,r.id,[...parts.values()],r.output,p.salePortions),previous=s.recipeSupplies?.find(v=>v.recipeId===r.id),covered=new Map((previous?.parts||[]).map(p=>[p.ingredientId,p]));
        for(const need of needs){const raw=s.ingredients.find(i=>i.id===need.ingredientId);if(need.missing>0)E().move(s,raw,need.missing,'in','Abastecimiento de receta · '+r.name,meta);covered.set(raw.id,{ingredientId:raw.id,unit:raw.unit,quantity:Math.max(need.quantity,need.covered)});}
        s.recipeSupplies=(s.recipeSupplies||[]).filter(v=>v.recipeId!==r.id);s.recipeSupplies.push({...meta,id:r.id,recipeId:r.id,output:r.output,parts:[...covered.values()]});
      }
      if(p.available!==undefined)state.docs.menu_items.find(i=>i.id===p.productId).is_available=!!p.available;
    }else if(k==='materials_delete'){
      if(actor.role!=='boss')fail('Solo un jefe puede eliminar insumos.');const raw=s.ingredients.find(i=>i.id===p.ingredientId);if(!raw)fail('Insumo no disponible.');if(s.recipes.some(r=>state.docs.menu_items.some(i=>i.id===r.productId)&&r.lines.some(l=>l.ingredientId===raw.id)))fail('Este insumo está vinculado a un producto. Puedes editarlo o abastecerlo, pero no eliminarlo.','MATERIALS_IN_USE');raw.archived=true;raw.revision++;
    }else if(k==='materials_save'){
      const old=s.ingredients.find(i=>i.id===p.id);if((old?.revision||0)!==p.revision)fail('El insumo cambió. Actualiza antes de guardar.','VERSION_CONFLICT');if(old?.archived)fail('El insumo está retirado de la macro.');if(typeof p.name!=='string'||!p.name.trim()||p.name.length>160)fail('Escribe el nombre del insumo.');E().convert(1,p.unit,p.unit,state.units);if(old&&old.unit!==p.unit)fail('Conserva la unidad del insumo. Las entradas admiten otras presentaciones.');number(p.minStock,'alerta de existencias');if(s.ingredients.some(i=>i.id!==p.id&&!i.archived&&norm(i.name)===norm(p.name)&&base(i.unit)===base(p.unit)))fail('Ya existe un insumo con este nombre y medida.');
      const target=p.quantity===undefined?(old?.quantity||0):round(number(p.quantity,'cantidad en existencia')),delta=round(target-(old?.quantity||0));
      const unitCost=p.totalCost===undefined?old?.unitCost||0:target>0?number(p.totalCost,'costo total')/target:0;
      if(p.totalCost!==undefined&&target===0&&number(p.totalCost,'costo total')!==0)fail('Sin existencias, el costo total debe ser cero.');
      const row={...old,...meta,id:p.id,name:p.name.trim(),unit:p.unit,minStock:p.minStock,quantity:old?.quantity||0,unitCost,revision:(old?.revision||0)+1};s.ingredients=s.ingredients.filter(i=>i.id!==p.id);s.ingredients.push(row);
      if(delta)E().move(s,row,delta,'adjustment',old?'Corrección de existencia al editar':'Existencia inicial',meta);guard(state);
    }else if(k==='materials_adjust'){
      if(globalThis.BRANCH_CONFIG?.slug==='gcobarf'){const stored=s.ingredients.find(i=>i.id===p.ingredientId);if(stored&&(p.unit==='unit'?'u':p.unit)!==(stored.unit==='unit'?'u':stored.unit))fail('Conserva la unidad guardada del insumo.');}
      const raw=s.ingredients.find(i=>i.id===p.ingredientId&&!i.archived);if(!raw)fail('Insumo no disponible.');number(p.quantity,'cantidad',0.00000001);number(p.totalCost,'valor de entrada');if(!['in','out'].includes(p.kind))fail('Elige entrada o salida.');if(p.reason!=null&&(typeof p.reason!=='string'||p.reason.length>300))fail('Revisa el motivo del movimiento.');const reason=p.reason?.trim()||(p.kind==='in'?'Entrada de insumos':'Retiro de insumos');const q=E().convert(p.quantity,p.unit,raw.unit,state.units);if(p.kind==='in')raw.unitCost=(raw.quantity*raw.unitCost+p.totalCost)/(raw.quantity+q);E().move(s,raw,p.kind==='in'?q:-q,p.kind,reason,meta);guard(state);
    }else fail('Operación de insumos no disponible.');
    if(['materials_save','materials_adjust','materials_delete'].includes(k)){
      const after=s.ingredients.find(i=>i.id===(p.id||p.ingredientId));s.materialHistory||=[];
      s.materialHistory.push({...meta,ingredientId:after.id,name:after.name,unit:after.unit,action:k==='materials_save'?(historyBefore?'edit':'create'):k==='materials_delete'?'delete':p.kind,before:historyBefore,after:structuredClone(after),totalCost:p.totalCost,reference:p.reason||''});
    }
    return state;
  }
  function syncProcessing(state,oldModel,actor){
    if(!oldModel)return;
    for(const linked of [...state.operations.recipes].filter(r=>r.managed)){
      const before=oldModel.recipes.find(r=>r.id===linked.recipeId),after=state.costing.model.recipes.find(r=>r.id===linked.recipeId);
      if(!before||!after||state.operations.productions?.some(p=>p.recipeId===after.id))continue;
      const key=r=>JSON.stringify(r.lines.filter(l=>l.processing||l.initialQuantity!==undefined).map(l=>({ingredientId:l.ingredientId,...(l.initialQuantity!==undefined?{initialQuantity:l.initialQuantity,quantity:l.quantity,unit:l.unit}:{}),...(l.processing?{processing:l.processing}:{})})));
      const mappings=[...new Set(after.lines.map(l=>l.ingredientId))].map(ingredientId=>({ingredientId,stockId:state.costing.model.ingredients.find(i=>i.id===ingredientId)?.stockId||linked.mappings.find(m=>m.ingredientId===ingredientId)?.stockId}));
      if(mappings.some(m=>!m.stockId))continue;if(key(before)===key(after)&&JSON.stringify(mappings)===JSON.stringify(linked.mappings))continue;
      for(const map of mappings){const ing=state.costing.model.ingredients.find(i=>i.id===map.ingredientId),raw=state.operations.ingredients.find(i=>i.id===map.stockId);if(ing&&raw)ing.purchasePrice=raw.unitCost*E().convert(ing.quantity,ing.unit,raw.unit,state.units)*(ing.recoverableTax?1+ing.purchaseTaxRate/100:1);}
      apply(state,{id:crypto.randomUUID(),command:'materials_link',payload:{productId:linked.productId,recipeId:linked.recipeId,revision:state.costing.revision,salePortions:linked.salePortions,mappings}},actor);
    }
  }
  return {norm,base,stockSuggestion,reserved,shortages,guard,portions,supplyNeeds,apply,syncProcessing};
})();
