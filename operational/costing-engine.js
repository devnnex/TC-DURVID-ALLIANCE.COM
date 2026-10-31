/* Pure calculation engine. COP values retain decimals until presentation. */
globalThis.AllianceCosting = (() => {
  const units = {g:{family:'mass',factor:1},kg:{family:'mass',factor:1000},ml:{family:'volume',factor:1},l:{family:'volume',factor:1000},unit:{family:'count',factor:1}};
  const empty = () => ({settings:{monthlyUnits:null,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients:[],expenses:[],channels:[],recipes:[]});
  const processingStates={stored:0,thawed:1,cleaned:3,cooked:7,'frozen-cleaned':2,'frozen-cooked':6};
  const processingDefaults=()=>({version:1,stockState:'stored',recipeState:'auto',thaw:0,clean:0,cook:0});
  function processingTarget(p){const from=processingStates[p.stockState];if(p.recipeState==='same')return from;if(p.recipeState!=='auto')return processingStates[p.recipeState];let to=from;for(const [key,bits]of [['thaw',1],['clean',3],['cook',7]])if(p[key]>0)to|=bits;return to;}
  function processingFactor(line){
    const p=line.processing;if(p===undefined)return 1;
    if(!p||p.version!==1||Object.keys(p).some(k=>!['version','stockState','recipeState','thaw','clean','cook'].includes(k)))throw new Error('Configuración de merma inválida.');
    const from=processingStates[p.stockState],to=processingTarget(p);
    if(from===undefined||to===undefined||(from&to)!==from)throw new Error('El estado de la receta no puede deshacer la preparación del inventario.');
    let factor=1;for(const [key,bit] of [['thaw',1],['clean',2],['cook',4]]){if(typeof p[key]!=='number')throw new Error('Revisa el porcentaje de merma.');const loss=number(p[key],'Merma',0,99.999999);if(!(from&bit)&&(to&bit))factor*=1-loss/100;}
    return factor;
  }
  const lineQuantity=line=>number(line.quantity,'Cantidad')/processingFactor(line);
  const neutralizeLosses=model=>{model.ingredients.forEach(i=>i.yieldPercent=100);model.recipes.forEach(r=>r.wastePercent=0);return model;};
  function number(value,label,min=0,max=1e12){if(value===null||value===''||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(`${label}: revisa el valor.`);return Number(value);}
  function convert(quantity,from,to){if(!units[from]||!units[to]||units[from].family!==units[to].family)throw new Error('Conversión incompatible: masa, volumen y unidades no se mezclan.');return number(quantity,'Cantidad')*units[from].factor/units[to].factor;}
  // Correcting the purchase presentation also corrects its recipe references.
  // Within a family keep physical quantities; across families keep purchase quantities.
  function updateIngredient(model,row,{recipeId,syncQuantity=false}={}){
    const previous=model.ingredients.find(i=>i.id===row.id);
    if(previous&&units[previous.unit]&&units[row.unit]&&units[previous.unit].family!==units[row.unit].family){
      for(const recipe of model.recipes)for(const line of recipe.lines)if(line.ingredientId===row.id){
        line.quantity=convert(line.quantity,line.unit,previous.unit);line.unit=row.unit;
      }
    }
    // A correction made from a production row must update that row's inputs too.
    if(previous&&recipeId&&(syncQuantity||previous.unit!==row.unit||Number(previous.quantity)!==Number(row.quantity))){
      const recipe=model.recipes.find(r=>r.id===recipeId);
      for(const line of recipe?.lines||[])if(line.ingredientId===row.id){line.quantity=row.quantity;line.unit=row.unit;}
    }
    const index=model.ingredients.findIndex(i=>i.id===row.id);if(index<0)model.ingredients.push(row);else model.ingredients[index]=row;
    return model;
  }
  function ingredientCost(i){const q=number(i.quantity,'Compra',0.000001);const tax=number(i.purchaseTaxRate,'Impuesto de compra',0,100)/100;const price=number(i.purchasePrice,'Precio de compra');return (i.recoverableTax?price/(1+tax):price)/q;}
  const lineCost=(i,line)=>line.manualCost!=null?number(line.manualCost,'Importe directo')/processingFactor(line):convert(lineQuantity(line),line.unit,i.unit)*ingredientCost(i);
  function calculate(model,recipe,channelId=recipe.channelId){
    if(recipe.sheet){if(!globalThis.AllianceJespresso)throw new Error('No se pudo cargar la hoja de recetas.');return AllianceJespresso.calculate(model,recipe);}
    const missing=[], operatingMissing=[],assumptions=[],lines=[];const s=model.settings,productionBasis=recipe.pricingBasis==='production',allocationMissing=productionBasis?operatingMissing:missing;
    const output=number(recipe.output,'Unidades producidas',0.000001);
    if(!recipe.lines.length)missing.push('Agrega al menos un ingrediente a la receta.');
    for(const line of recipe.lines){const ingredient=model.ingredients.find(i=>i.id===line.ingredientId);if(!ingredient){missing.push('Ingrediente eliminado o no disponible.');continue;}const cost=lineCost(ingredient,line);lines.push({name:ingredient.name,quantity:Number(line.quantity),inventoryQuantity:lineQuantity(line),unit:line.unit,cost});}
    const batchIngredients=lines.reduce((n,l)=>n+l.cost,0),ingredients=batchIngredients/output;let allocated=0,direct=0,monthlyFixed=0,batchDirect=0;
    for(const e of model.expenses){if(e.includedElsewhere){assumptions.push(`${e.name}: excluido porque ya está incluido en otro concepto.`);continue;}if(e.recipeId&&e.recipeId!==recipe.id)continue;
      if(e.kind==='unit'){direct+=number(e.amount,'Gasto unitario');continue;}if(e.kind==='batch'){const amount=number(e.amount,'Costo del lote');batchDirect+=amount;direct+=amount/output;continue;}
      const monthly=number(e.amount,'Gasto')/number(e.periodMonths,'Meses del período',0.000001);monthlyFixed+=monthly;
      if(e.allocation==='minutes'){const capacity=e.recipeId?Number(recipe.minutes)*Number(recipe.monthlyUnits):Number(s.monthlyMinutes);if(!(capacity>0)||!(Number(recipe.minutes)>0)){allocationMissing.push(`Indica minutos de producción y capacidad mensual para distribuir ${e.name}.`);continue;}allocated+=monthly*Number(recipe.minutes)/capacity;}
      else{const volume=e.recipeId?Number(recipe.monthlyUnits):Number(s.monthlyUnits);if(!(volume>0)){allocationMissing.push(`Indica las unidades mensuales para distribuir ${e.name}.`);continue;}allocated+=monthly/volume;}
    }
    const channel=model.channels.find(c=>c.id===channelId);if(!channel)missing.push('Selecciona un canal de venta con sus comisiones confirmadas (pueden ser cero).');
    const tax=number(s.taxRate,'Impuesto de venta',0,100)/100;
    const feeRate=channel?(number(channel.salesPercent,'Comisión de venta',0,99.999)+number(channel.paymentPercent,'Comisión de pago',0,99.999))/100*(channel.feeBase==='gross'?1+tax:1):0;
    const flat=channel?number(channel.flatFee,'Comisión fija por producto'):0;
    const variable=ingredients+direct,fullCost=variable+allocated,cost=productionBasis?variable:fullCost;
    const target=number(recipe.targetPercent,'Objetivo',0,recipe.marginMode==='markup'?1000:99.999)/100;
    const denominator=1-feeRate-(recipe.marginMode==='markup'?0:target);
    if(denominator<=0)missing.push('El margen y las comisiones consumen todo el ingreso; reduce uno de ellos.');
    const netRecommended=denominator>0?(cost*(recipe.marginMode==='markup'?1+target:1)+flat)/denominator:null;
    const current=recipe.currentPrice===null||recipe.currentPrice===''?null:number(recipe.currentPrice,'Precio actual');if(current===null)missing.push('Indica el precio actual para evaluar la rentabilidad.');
    const net=current===null?null:current/(s.taxMode==='included'?1+tax:1),gross=net===null?null:net*(1+tax);
    const fees=net===null?null:net*feeRate+flat,profit=net===null?null:net-cost-fees;
    const contribution=net===null?null:net-variable-fees;
    const definitive=missing.length===0;
    const fixedPerProduct=allocated*Number(recipe.monthlyUnits||0);
    const breakEven=definitive&&contribution>0&&Number(recipe.monthlyUnits)>0?Math.ceil(fixedPerProduct/contribution):null;
    if(monthlyFixed>0&&Number(recipe.monthlyUnits)<=0)assumptions.push('Punto de equilibrio pendiente: faltan unidades mensuales de este producto.');
    assumptions.push('El precio de compra incluye el impuesto registrado; solo se descuenta cuando declaras que es recuperable.','El impuesto de venta se separa del ingreso y no se cuenta como utilidad.','La comisión fija se registra por producto vendido; convierte cualquier tarifa por pedido según sus unidades.');
    return {productionBasis,fullCost,monthlyFixed,operatingMissing,definitive,missing:[...new Set(missing)],assumptions,lines,batchIngredients,batchDirect,ingredients,direct,allocated,cost,variable,fees,profit,margin:net>0?profit/net*100:null,markup:cost>0&&profit!==null?profit/cost*100:null,net,gross,taxAmount:net===null?null:gross-net,recommended:netRecommended===null?null:netRecommended*(s.taxMode==='included'?1+tax:1),recommendedGross:netRecommended===null?null:netRecommended*(1+tax),breakEven,contribution,feeRate,flat};
  }
  function validate(model){
    if(!model||!model.settings||!['included','added'].includes(model.settings.taxMode))throw new Error('Configuración inválida.');number(model.settings.taxRate,'Impuesto',0,100);
    for(const key of ['monthlyUnits','monthlyMinutes'])if(model.settings[key]!==null)number(model.settings[key],key,0.000001);
    for(const key of ['ingredients','expenses','channels','recipes']){if(!Array.isArray(model[key])||model[key].length>500)throw new Error('Catálogo demasiado grande.');const ids=new Set();for(const row of model[key]){if(!row.id||ids.has(row.id)||!String(row.name||'').trim()||row.name.length>160)throw new Error('Nombre o identificador inválido.');ids.add(row.id);}}
    neutralizeLosses(model);model.ingredients.forEach(i=>{if(i.invoice!=null&&(typeof i.invoice!=='string'||i.invoice.length>80))throw new Error('Factura inválida.');if(i.purchaseDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(i.purchaseDate)||!Number.isFinite(Date.parse(i.purchaseDate+'T12:00:00Z'))||new Date(i.purchaseDate+'T12:00:00Z').toISOString().slice(0,10)!==i.purchaseDate))throw new Error('Fecha de compra inválida.');if(!units[i.unit])throw new Error('Unidad inválida.');if(typeof i.recoverableTax!=='boolean')throw new Error('Confirma el tratamiento del impuesto de compra.');ingredientCost(i);});
    model.channels.forEach(c=>{if(!['net','gross'].includes(c.feeBase))throw new Error('Base de comisión inválida.');number(c.salesPercent,'Comisión',0,99.999);number(c.paymentPercent,'Comisión',0,99.999);number(c.flatFee,'Tarifa fija');});
    const expenseConcepts=new Set();model.expenses.forEach(e=>{const concept=e.name.trim().toLowerCase()+'|'+e.kind+'|'+(e.recipeId||'');if(expenseConcepts.has(concept))throw new Error('Este gasto ya está registrado para el mismo producto. Edita el existente.');expenseConcepts.add(concept);number(e.amount,'Gasto');if(!['unit','fixed','batch'].includes(e.kind)||!['units','minutes'].includes(e.allocation)||typeof e.includedElsewhere!=='boolean')throw new Error('Distribución inválida.');number(e.periodMonths,'Periodicidad',0.000001);if(e.kind==='batch'&&!e.recipeId)throw new Error('Asigna el costo del lote a un producto.');if(e.recipeId&&!model.recipes.some(r=>r.id===e.recipeId))throw new Error('Producto del gasto no disponible.');});
    model.recipes.forEach(r=>{if(r.sheet)globalThis.AllianceJespresso?.validate(r.sheet);if(r.pricingBasis!==undefined&&!['production','full'].includes(r.pricingBasis))throw new Error('Base de precio inválida.');if(!['margin','markup'].includes(r.marginMode)||!Array.isArray(r.lines)||r.lines.length>100)throw new Error('Receta inválida.');if(r.monthlyUnits!==null)number(r.monthlyUnits,'Volumen del producto',0.000001);if(r.minutes!==null)number(r.minutes,'Minutos',0.000001);for(const l of r.lines){if(!r.sheet&&(l.stage!==undefined||l.manualCost!==undefined))throw new Error('Opciones de ingrediente fuera de la hoja de recetas.');if(!model.ingredients.some(i=>i.id===l.ingredientId))throw new Error('El ingrediente pertenece a una receta: reemplázalo antes de eliminarlo.');number(l.quantity,'Cantidad de receta',r.sheet?0:0.000001);}calculate(model,r);});return model;
  }
  function priceGuide(model,recipe){
    // Respect the declared pricing basis; monthly operating results are reported separately.
    const base=calculate(model,{...recipe,currentPrice:0,targetPercent:0,marginMode:'margin'});
    const result=calculate(model,recipe),factor=model.settings.taxMode==='added'?1+model.settings.taxRate/100:1;
    const minimum=base.definitive&&base.recommended!==null?Math.ceil(base.recommended):null;
    const recommended=base.definitive&&result.recommended!==null?Math.ceil(result.recommended):null;
    return {complete:base.definitive,missing:base.missing,cost:base.definitive?base.cost:null,minimum,recommended,
      minimumTotal:minimum===null?null:minimum*factor,recommendedTotal:recommended===null?null:recommended*factor,
      belowMinimum:minimum!==null&&recipe.currentPrice!==null&&recipe.currentPrice!==''&&Number(recipe.currentPrice)<minimum};
  }
  return {empty,units,convert,updateIngredient,ingredientCost,lineCost,lineQuantity,processingFactor,processingTarget,processingDefaults,processingStates,neutralizeLosses,calculate,priceGuide,validate};
})();
