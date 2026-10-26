/* Jespresso recipe worksheet. No rounding is performed inside the calculation. */
globalThis.AllianceJespresso = (() => {
  const n=(v,label,min=0,max=1e12)=>{if(v===null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw new Error('Revisa '+label+'.');return Number(v);};
  const defaults=()=>({version:1,responsible:'',date:'',code:'',quantity:null,workingDays:26,closingDays:26,monthlySales:null,operating:[
    {name:'Recuperación de capital',detail:'Inversión / meses de retorno',amount:0},
    {name:'Materia prima',detail:'Insumos mensuales',amount:0},
    {name:'Salario fijo',detail:'Colaborador fijo',amount:0},
    {name:'Salario ayudante',detail:'Colaborador por novedad',amount:0},
    {name:'Costos directos',detail:'Servicios públicos',amount:0},
    {name:'Gastos indirectos',detail:'Consumibles, publicidad y gastos financieros',amount:0}],
    management:[{name:'Mantenimiento de equipos',percent:5},{name:'Reemplazo de indumentaria',percent:5},{name:'Aseo y limpieza',percent:5}],
    unforeseenPercent:10,factorPercent:150,capitalMode:'daily',capitalPercent:0,consumptionPercent:8,ivaPercent:19,source:''});
  function validate(s){
    if(!s||s.version!==1)throw new Error('Hoja de receta inválida.');
    for(const [key,max] of [['responsible',160],['code',80],['source',160]])if(typeof s[key]!=='string'||s[key].length>max)throw new Error('Revisa los datos de la receta.');
    if(typeof s.date!=='string'||s.date&&!/^\d{4}-\d{2}-\d{2}$/.test(s.date))throw new Error('Revisa la fecha de preparación.');
    if(s.date&&(!Number.isFinite(Date.parse(s.date+'T12:00:00Z'))||new Date(s.date+'T12:00:00Z').toISOString().slice(0,10)!==s.date))throw new Error('Revisa la fecha de preparación.');
    n(s.workingDays,'días de trabajo',1,366);n(s.closingDays,'días de cierre',1,366);
    if(s.monthlySales!==null)n(s.monthlySales,'ventas mensuales');if(s.quantity!==null)n(s.quantity,'cantidad por porción',0.000001);
    if(!['daily','manual'].includes(s.capitalMode))throw new Error('Revisa la recuperación de capital.');
    for(const key of ['unforeseenPercent','capitalPercent','consumptionPercent','ivaPercent'])n(s[key],key,0,100);
    n(s.factorPercent,'factor de venta',0,10000);
    for(const [key,field,max] of [['operating','amount',1e12],['management','percent',100]]){
      if(!Array.isArray(s[key])||s[key].length>20)throw new Error('Revisa los conceptos de la hoja.');
      for(const row of s[key]){if(typeof row.name!=='string'||!row.name.trim()||row.name.length>160)throw new Error('Escribe el nombre del concepto.');n(row[field],row.name,0,max);if(key==='operating'&&(typeof row.detail!=='string'||row.detail.length>160))throw new Error('Revisa el detalle del gasto.');}
    }
    return s;
  }
  function calculate(model,r){
    const s=validate(r.sheet),E=globalThis.AllianceCosting;const output=n(r.output,'porciones',0.000001),missing=[];
    const lines=r.lines.map(l=>{
      if(l.stage!==undefined&&!['batch','portion'].includes(l.stage))throw new Error('Revisa si el ingrediente es del lote o por porción.');
      const i=model.ingredients.find(i=>i.id===l.ingredientId);if(!i)throw new Error('Ingrediente no disponible.');
      const quantity=n(l.quantity,'cantidad usada',0),unitCost=E.ingredientCost(i);
      const cost=E.lineCost(i,l);
      return {name:i.name,quantity,inventoryQuantity:E.lineQuantity(l),unit:l.unit,cost,stage:l.stage||'batch'};
    });
    if(!lines.length)missing.push('Agrega los ingredientes de la receta.');
    const batchIngredients=lines.filter(l=>l.stage==='batch').reduce((a,l)=>a+l.cost,0),portionExtras=lines.filter(l=>l.stage==='portion').reduce((a,l)=>a+l.cost,0);
    const managementPercent=s.management.reduce((a,v)=>a+Number(v.percent),0),unforeseen=batchIngredients*s.unforeseenPercent/100,management=batchIngredients*managementPercent/100;
    const preparation=batchIngredients+unforeseen+management,cost=preparation/output+portionExtras;
    const monthlyFixed=s.operating.reduce((a,v)=>a+Number(v.amount),0),dailyBreakEven=monthlyFixed/s.workingDays,monthlyEstimate=dailyBreakEven*s.closingDays;
    const capitalPercent=s.capitalMode==='daily'?(monthlyEstimate>0?dailyBreakEven/monthlyEstimate*100:0):s.capitalPercent;
    const saleBase=cost*s.factorPercent/100,capital=saleBase*capitalPercent/100,consumption=saleBase*s.consumptionPercent/100,iva=saleBase*s.ivaPercent/100;
    const recommended=saleBase+capital+consumption+iva;
    const gross=r.currentPrice==null||r.currentPrice===''?recommended:n(r.currentPrice,'precio de venta');
    // Taxes use the factor base, as in the worksheet, and are separated from revenue.
    const taxRate=(s.consumptionPercent+s.ivaPercent)/100,taxAmount=gross*taxRate/(1+capitalPercent/100+taxRate),net=gross-taxAmount,profit=net-cost;
    return {productionBasis:true,definitive:!missing.length,missing,operatingMissing:[],assumptions:[],lines,batchIngredients,batchDirect:unforeseen+management,ingredients:batchIngredients/output,direct:(unforeseen+management)/output+portionExtras,allocated:0,fullCost:cost,cost,variable:cost,monthlyFixed,fees:0,profit,margin:net>0?profit/net*100:null,markup:cost>0?profit/cost*100:null,net,gross,taxAmount,recommended,recommendedGross:recommended,breakEven:null,contribution:profit,feeRate:0,flat:0,
      worksheet:{batchIngredients,portionExtras,managementPercent,unforeseen,management,preparation,cost,saleBase,capitalPercent,capital,consumption,iva,final:recommended,monthlyFixed,dailyBreakEven,monthlyEstimate,monthlyProfit:s.monthlySales===null?null:s.monthlySales-monthlyFixed}};
  }
  return {defaults,validate,calculate};
})();
