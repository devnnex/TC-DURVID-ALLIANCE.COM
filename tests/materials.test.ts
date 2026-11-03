import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
const ctx:any={structuredClone,crypto:{randomUUID}};for(const file of ['jespresso-engine.js','costing-engine.js','operations-engine.js','materials-engine.js','orders-local.js','pos-local.js'])runInNewContext(readFileSync('operational/'+file,'utf8'),ctx);
const M=ctx.AllianceMaterialsEngine,E=ctx.AllianceOperationsEngine,actor={id:'boss',full_name:'Jefe',role:'boss'},units=[{id:'g',dimension:'MASS',factor:1},{id:'kg',dimension:'MASS',factor:1000},{id:'ml',dimension:'VOLUME',factor:1},{id:'l',dimension:'VOLUME',factor:1000},{id:'u',dimension:'COUNT',factor:1}],POS=ctx.AllianceLocalPOS(actor);
function initial(){const model=ctx.AllianceCosting.empty();model.ingredients=[{id:'tartara',name:'Salsa tártara',unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false},{id:'milk',name:'Leche',unit:'ml',quantity:1000,purchasePrice:4000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];const sheet=ctx.AllianceJespresso.defaults();model.recipes=[{id:'recipe',name:'Pizza',output:8,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:null,targetPercent:0,marginMode:'margin',channelId:null,sheet,lines:[{ingredientId:'tartara',quantity:75,unit:'g',stage:'batch'},{ingredientId:'milk',quantity:80,unit:'ml',stage:'portion'}]}];return {operations:E.empty(),units,docs:{menu_items:[{id:'product',name:'Pizza',price:5000}],table_sessions:[],session_items:[],service_requests:[],restaurant_tables:[],menu_categories:[],business_settings:[]},costing:{model,revision:1},stock:{product:{productId:'product',stock:8,costPrice:500,salePrice:5000}},movements:[],sales:[],receipts:{}};}
const apply=(s:any,command:string,payload:any)=>{const next=structuredClone(s);return M.apply(next,{id:randomUUID(),command,payload},actor);};
const link={productId:'product',recipeId:'recipe',revision:1,salePortions:1,mappings:[{ingredientId:'tartara',stockId:'raw-tartara'},{ingredientId:'milk',stockId:'raw-milk'}]};
function ready(){let s=apply(initial(),'materials_link',link);for(const [id,unit]of [['raw-tartara','g'],['raw-milk','ml']])s=apply(s,'materials_adjust',{ingredientId:id,quantity:1000,unit,kind:'in',totalCost:10000,reason:'Abastecer'});return s;}
describe('Macro de insumos y recetas por unidad vendida',()=>{
  it('reutiliza el insumo compartido para ingredientes nuevos aunque cambie el nombre en la macro',()=>{
    const s=ready(),raw=s.operations.ingredients.find((i:any)=>i.id==='raw-milk');raw.name='Leche entera central';
    const ingredient={...s.costing.model.ingredients.find((i:any)=>i.id==='milk'),id:'future-milk',name:'  LECHE  '};
    s.costing.model.ingredients.push(ingredient);
    expect(M.stockSuggestion(s,ingredient)).toEqual({stockId:'raw-milk',ambiguous:false});
    expect(s.operations.ingredients).toHaveLength(2);expect(raw.quantity).toBe(1000);
    raw.archived=true;expect(M.stockSuggestion(s,ingredient)).toEqual({stockId:null,ambiguous:false});
  });
  it('conserva las referencias explícitas y pide elegir cuando las recetas usan saldos diferentes',()=>{
    const s=ready();s.operations.ingredients.find((i:any)=>i.id==='raw-milk').name='Leche A';
    s.operations.ingredients.push({id:'other-milk',name:'Leche B',unit:'ml',quantity:500});
    s.docs.menu_items.push({id:'other-product',name:'Otro producto'});
    s.operations.recipes.push({productId:'other-product',managed:true,mappings:[{ingredientId:'milk',stockId:'other-milk'}]});
    const ingredient={id:'future-milk',name:'Leche',unit:'ml'};
    expect(M.stockSuggestion(s,ingredient)).toEqual({stockId:null,ambiguous:true});
    expect(M.stockSuggestion(s,{...ingredient,stockId:'raw-milk'})).toEqual({stockId:'raw-milk',ambiguous:false});
    expect(M.stockSuggestion(s,{...ingredient,unit:'g'})).toEqual({stockId:null,ambiguous:false});
  });
  it('descuenta el peso inicial medido de la macro y conserva la pérdida al vincular',()=>{
    const s=ready(),before=structuredClone(s.costing.model),recipe=s.costing.model.recipes[0];
    delete recipe.sheet;recipe.lines.forEach((l:any)=>delete l.stage);
    Object.assign(recipe.lines[0],{initialQuantity:100,quantity:80});s.costing.revision++;
    M.syncProcessing(s,before,actor);
    expect(s.operations.recipes[0].lines.find((l:any)=>l.ingredientId==='raw-tartara').quantity).toBe(12.5);
    const invoice={id:'measured',number:'MEASURED',sessionId:'measured-session',saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:'one',menu_item_id:'product',quantity:8,unit_price:5000}],totals:{subtotal:40000,total:40000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:40000}]};
    POS.execute(s,'record_sale',{invoice});
    expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(900);
    expect(recipe.lines[0]).toMatchObject({initialQuantity:100,quantity:80});
  });
  it('registra costo total al crear y editar, con historial del usuario y sin inventar movimientos',()=>{
    let s=apply(initial(),'materials_save',{id:'bag',revision:0,name:'Bolsa 500G',unit:'u',quantity:500,minStock:0,totalCost:55000});
    let row=s.operations.ingredients.find((i:any)=>i.id==='bag');expect(row.unitCost).toBe(110);
    expect(s.operations.materialHistory.at(-1)).toMatchObject({action:'create',actorId:'boss',actorName:'Jefe',totalCost:55000,after:{quantity:500,unitCost:110}});
    s=apply(s,'materials_save',{id:'bag',revision:row.revision,name:'Bolsa editada',unit:'u',quantity:500,minStock:10,totalCost:60000});
    row=s.operations.ingredients.find((i:any)=>i.id==='bag');expect(row.unitCost).toBe(120);expect(s.operations.materialMovements).toHaveLength(1);
    expect(s.operations.materialHistory.at(-1)).toMatchObject({action:'edit',before:{unitCost:110,name:'Bolsa 500G'},after:{unitCost:120,name:'Bolsa editada'}});
    s=apply(s,'materials_adjust',{ingredientId:'bag',kind:'in',quantity:500,unit:'u',totalCost:40000});
    expect(s.operations.ingredients.find((i:any)=>i.id==='bag').unitCost).toBe(100);
    s=apply(s,'materials_delete',{ingredientId:'bag'});expect(s.operations.materialHistory.map((e:any)=>e.action)).toEqual(['create','edit','in','delete']);
    expect(s.operations.materialHistory.at(-1).after.archived).toBe(true);
  });
  it('rechaza costos inválidos y evita asignar valor a existencias cero',()=>{
    const p={id:'bag',revision:0,name:'Bolsa',unit:'u',quantity:0,minStock:0,totalCost:100};
    expect(()=>apply(initial(),'materials_save',p)).toThrow('cero');
    expect(()=>apply(initial(),'materials_save',{...p,quantity:10,totalCost:-1})).toThrow('costo');
  });
  it('GCOBARF conserva la unidad elegida tanto al editar como al mover existencias',()=>{
    ctx.BRANCH_CONFIG={slug:'gcobarf'};
    try{
      const s=apply(initial(),'materials_save',{id:'flour',revision:0,name:'Harina',unit:'kg',quantity:2,minStock:0,totalCost:10000});
      const row=s.operations.ingredients.find((i:any)=>i.id==='flour');expect(row.unit).toBe('kg');
      expect(()=>apply(s,'materials_adjust',{ingredientId:'flour',kind:'in',quantity:500,unit:'g',totalCost:2500})).toThrow('unidad guardada');
      expect(()=>apply(s,'materials_save',{id:'flour',revision:row.revision,name:row.name,unit:'g',quantity:2,minStock:0,totalCost:10000})).toThrow('unidad');
      const next=apply(s,'materials_adjust',{ingredientId:'flour',kind:'in',quantity:.5,unit:'kg',totalCost:2500});
      expect(next.operations.ingredients.find((i:any)=>i.id==='flour')).toMatchObject({quantity:2.5,unit:'kg',unitCost:5000});
    }finally{delete ctx.BRANCH_CONFIG;}
  });
  it('agrupa varias líneas del mismo producto y devuelve sus insumos en una sola anulación',()=>{const s=ready(),invoice={id:'grouped',number:'GROUP',sessionId:'grouped-session',saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:'one',menu_item_id:'product',quantity:4,unit_price:5000},{id:'two',menu_item_id:'product',quantity:4,unit_price:5000}],totals:{subtotal:40000,total:40000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:40000}]};POS.execute(s,'record_sale',{invoice});expect(s.movements).toHaveLength(1);expect(s.movements[0].delta).toBe(-8);expect(s.movements[0].ingredients.find((i:any)=>i.ingredientId==='raw-tartara').quantity).toBe(75);POS.execute(s,'delete_sale',{saleId:'grouped'});expect(s.movements).toHaveLength(2);expect(s.movements[0].delta).toBe(8);expect(s.movements[0].ingredients.find((i:any)=>i.ingredientId==='raw-tartara').quantity).toBe(75);expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(1000);expect(s.stock.product.stock).toBe(8);});

  it('vincula la hoja nativa de GCOBARF con merma por ingrediente y producción real',()=>{const s=initial(),r=s.costing.model.recipes[0];delete r.sheet;r.lines.forEach((l:any)=>delete l.stage);r.lines[0].processing={version:1,stockState:'stored',recipeState:'thawed',thaw:5,clean:0,cook:30};const next=apply(s,'materials_link',link),part=next.operations.recipes[0].lines.find((l:any)=>l.ingredientId==='raw-tartara');expect(part.quantity).toBeCloseTo(75/.95/8,12);expect(next.operations.recipes[0].overheadCost).toBe(0);});
  it('guardar merma actualiza el vínculo, conserva existencias y rechaza reinterpretar cuentas abiertas',()=>{const s=ready(),before=structuredClone(s.costing.model);s.costing.model.recipes[0].lines[0].processing={version:1,stockState:'stored',recipeState:'thawed',thaw:5,clean:0,cook:30};s.costing.revision++;M.syncProcessing(s,before,actor);expect(s.operations.recipes[0].lines.find((l:any)=>l.ingredientId==='raw-tartara').quantity).toBeCloseTo(75/.95/8,12);expect(s.operations.ingredients[0].quantity).toBe(1000);expect(s.operations.materialMovements).toHaveLength(2);
    const previous=structuredClone(s.costing.model);s.docs.table_sessions.push({id:'session',status:'open'});s.docs.session_items.push({id:'line',session_id:'session',menu_item_id:'product',quantity:1,status:'served'});s.costing.model.recipes[0].lines[0].processing.thaw=10;expect(()=>M.syncProcessing(s,previous,actor)).toThrow('consumos');
  });
  it('permite agregar y retirar sin motivo, conservando un registro descriptivo',()=>{
    let s=apply(ready(),'materials_adjust',{ingredientId:'raw-tartara',quantity:50,unit:'g',kind:'in',totalCost:500});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(1050);expect(s.operations.materialMovements.at(-1).reference).toBe('Entrada de insumos');
    s=apply(s,'materials_adjust',{ingredientId:'raw-tartara',quantity:25,unit:'g',kind:'out',totalCost:0,reason:'  '});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(1025);expect(s.operations.materialMovements.at(-1).reference).toBe('Retiro de insumos');
  });
  it('crea con existencia inicial y edita el total sucesivamente sin sumar de nuevo',()=>{
    let s=apply(initial(),'materials_save',{id:'raw',revision:0,name:'Harina',unit:'g',minStock:10,quantity:500});
    let row=s.operations.ingredients.find((i:any)=>i.id==='raw');expect(row.quantity).toBe(500);expect(s.operations.materialMovements[0].delta).toBe(500);
    s=apply(s,'materials_save',{id:row.id,revision:row.revision,name:'Harina integral',unit:row.unit,minStock:20,quantity:300});
    row=s.operations.ingredients.find((i:any)=>i.id==='raw');expect(row.quantity).toBe(300);expect(row.name).toBe('Harina integral');expect(s.operations.materialMovements[1].delta).toBe(-200);
    s=apply(s,'materials_save',{id:row.id,revision:row.revision,name:row.name,unit:row.unit,minStock:row.minStock,quantity:550});
    expect(s.operations.ingredients.find((i:any)=>i.id==='raw').quantity).toBe(550);expect(s.operations.materialMovements[2].delta).toBe(250);
  });
  it('conserva el costo y evita sobrescribir una cantidad modificada en otro registro',()=>{
    const s=ready(),old=s.operations.ingredients.find((i:any)=>i.id==='raw-tartara'),p={id:old.id,revision:old.revision,name:old.name,unit:old.unit,minStock:old.minStock,quantity:1200};
    const next=apply(s,'materials_save',p),row=next.operations.ingredients.find((i:any)=>i.id===old.id);expect(row.quantity).toBe(1200);expect(row.unitCost).toBe(old.unitCost);
    expect(()=>apply(next,'materials_save',{...p,quantity:800})).toThrow('Actualiza');expect(row.quantity).toBe(1200);
    const unchanged=apply(next,'materials_save',{...p,revision:row.revision,quantity:1200});expect(unchanged.operations.materialMovements).toHaveLength(next.operations.materialMovements.length);
  });
  it('no reduce la existencia editada por debajo de las reservas y conserva clientes antiguos sin cantidad',()=>{
    const s=ready();s.docs.table_sessions.push({id:'session',status:'open'});s.docs.session_items.push({id:'line',session_id:'session',menu_item_id:'product',quantity:8,status:'served'});
    const old=s.operations.ingredients.find((i:any)=>i.id==='raw-milk'),p={id:old.id,revision:old.revision,name:old.name,unit:old.unit,minStock:old.minStock};
    expect(()=>apply(s,'materials_save',{...p,quantity:639})).toThrow('Leche');expect(old.quantity).toBe(1000);
    expect(apply(s,'materials_save',p).operations.ingredients.find((i:any)=>i.id===old.id).quantity).toBe(1000);
    expect(apply(s,'materials_save',{...p,quantity:640}).operations.ingredients.find((i:any)=>i.id===old.id).quantity).toBe(640);
  });
  it('no permite sustituir un vínculo gestionado con el enlace anterior',()=>{const s=ready();expect(()=>E.apply(s.operations,{id:'legacy',command:'recipe_link',payload:{productId:'product',recipeId:'recipe',recipe:{lines:[]}}},actor,units,undefined,s.docs.menu_items)).toThrow('macro de insumos');});
  it('protege los ingredientes de una venta aunque esté habilitado el saldo negativo anterior',()=>{const s=ready();s.operations.settings.allowNegative=true;const invoice={id:'overflow',number:'TEST',saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:'line',menu_item_id:'product',quantity:13,unit_price:5000}],totals:{subtotal:65000,total:65000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:65000}]};expect(()=>POS.execute(s,'record_sale',{invoice})).toThrow('Leche');});
  it('al pasar ocho porciones a cartera descuenta una vez y al anularlas devuelve los insumos',()=>{const s=ready();s.operations.customers.push({id:'customer',name:'Cliente',active:true,creditEnabled:true,creditLimit:100000});s.docs.table_sessions.push({id:'account',status:'open'});s.docs.session_items.push({id:'line',session_id:'account',menu_item_id:'product',quantity:8,status:'confirmed'});const invoice={id:'credit',number:'TEST',sessionId:'account',saleChannel:'table',customerId:'customer',creditDueDate:'2026-11-23',table:'Mesa',createdAt:new Date().toISOString(),items:[{id:'line',menu_item_id:'product',quantity:8,unit_price:5000}],totals:{subtotal:40000,total:40000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'credit',amount:40000}]};POS.execute(s,'record_sale',{invoice});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(925);expect(M.reserved(s).size).toBe(0);expect(s.operations.debts[0].total).toBe(40000);POS.execute(s,'delete_sale',{saleId:'credit'});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(1000);expect(s.operations.debts[0].voided).toBe(true);expect(s.movements.map((m:any)=>[m.type,m.delta])).toEqual([['DEVOLUCION_VENTA_RECETA',8],['SALIDA_VENTA_RECETA',-8]]);expect(s.stock.product.stock).toBe(8);});
  it('normaliza 75 g / 8 porciones y conserva los 80 ml de adición por porción',()=>{const s=ready(),r=s.operations.recipes[0];expect(r.lines.find((p:any)=>p.ingredientId==='raw-tartara').quantity).toBe(9.375);expect(r.lines.find((p:any)=>p.ingredientId==='raw-milk').quantity).toBe(80);expect(M.portions(s,'product')).toBe(12);});
  it('permite vender la receta entera con un factor explícito',()=>{const s=apply(ready(),'materials_link',{...link,salePortions:8});expect(s.operations.recipes[0].lines.find((p:any)=>p.ingredientId==='raw-tartara').quantity).toBe(75);expect(s.operations.recipes[0].lines.find((p:any)=>p.ingredientId==='raw-milk').quantity).toBe(640);});
  it('reserva insumos entre cuentas y los libera al cancelar o reducir consumos',()=>{const s=ready();s.docs.table_sessions.push({id:'table',status:'open'});s.docs.session_items.push({id:'line',session_id:'table',menu_item_id:'product',quantity:8,status:'confirmed'});expect(M.reserved(s).get('raw-tartara')).toBe(75);expect(M.portions(s,'product')).toBe(4);expect(()=>M.guard(s,[{productId:'product',quantity:5}])).toThrow('Leche');s.docs.session_items[0].quantity=4;expect(M.reserved(s).get('raw-tartara')).toBe(37.5);s.docs.session_items[0].status='cancelled';expect(M.reserved(s).size).toBe(0);expect(M.portions(s,'product')).toBe(12);});
  it('descuenta exactamente 75 g al vender 8 porciones, sin repetir por volver a cobrar',()=>{const s=ready(),invoice={id:'sale',number:'TEST',sessionId:'session',saleChannel:'walk_in',table:'Venta individual',createdAt:new Date().toISOString(),items:[{id:'line',menu_item_id:'product',item_name:'Pizza',quantity:8,unit_price:5000}],totals:{subtotal:40000,total:40000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:40000}]};POS.execute(s,'record_sale',{invoice});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(925);expect(s.operations.ingredients.find((i:any)=>i.id==='raw-milk').quantity).toBe(360);POS.execute(s,'record_sale',{invoice});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(925);expect(s.movements).toHaveLength(1);expect(s.movements[0]).toMatchObject({movementId:'SALE-sale-product',delta:-8,stockBasis:'recipe',before:null,after:null,user:'Jefe'});expect(s.movements[0].ingredients).toEqual(expect.arrayContaining([expect.objectContaining({name:'Salsa tártara',quantity:75,unit:'g'}),expect.objectContaining({name:'Leche',quantity:640,unit:'ml'})]));expect(s.stock.product.stock).toBe(8);});
  it('impide eliminar un insumo que un producto aún necesita',()=>{const s=ready();expect(()=>apply(s,'materials_delete',{ingredientId:'raw-tartara'})).toThrow('vinculado');expect(()=>apply(s,'materials_link',{...link,mappings:[{ingredientId:'tartara',stockId:'duplicate'},{ingredientId:'milk',stockId:'raw-milk'}]})).toThrow('Ya existe');});
  it('permite editar y abastecer sin cambiar unidades ni compartir peso con volumen',()=>{let s=ready();s=apply(s,'materials_adjust',{ingredientId:'raw-tartara',quantity:.5,unit:'kg',kind:'in',totalCost:5000,reason:'Compra'});expect(s.operations.ingredients.find((i:any)=>i.id==='raw-tartara').quantity).toBe(1500);expect(()=>apply(s,'materials_adjust',{ingredientId:'raw-tartara',quantity:1,unit:'ml',kind:'in',totalCost:5000,reason:'No'})).toThrow('mezclar');});
  it('comparte el mismo insumo entre diferentes productos y suma la demanda',()=>{let s=ready();s.docs.menu_items.push({id:'another',name:'Otra pizza'});s=apply(s,'materials_link',{...link,productId:'another'});expect(s.operations.ingredients).toHaveLength(2);expect(()=>M.guard(s,[{productId:'product',quantity:8},{productId:'another',quantity:8}])).toThrow('Leche');});
  it('no permite cambiar la receta durante una cuenta abierta ni retirar lo comprometido',()=>{const s=ready();s.docs.table_sessions.push({id:'session',status:'open'});s.docs.session_items.push({id:'line',session_id:'session',menu_item_id:'product',quantity:8,status:'served'});expect(()=>apply(s,'materials_link',link)).toThrow('consumos');expect(()=>apply(s,'materials_adjust',{ingredientId:'raw-milk',quantity:500,unit:'ml',kind:'out',totalCost:0,reason:'Retirar'})).toThrow('Leche');});
  it('conserva el historial al retirar un insumo independiente',()=>{let s=ready();s=apply(s,'materials_save',{id:'extra',revision:0,name:'Extra',unit:'g',minStock:0});s=apply(s,'materials_delete',{ingredientId:'extra'});expect(s.operations.ingredients.find((i:any)=>i.id==='extra').archived).toBe(true);});
  it('no aplica reservas a recetas anteriores sin activación de la macro',()=>{const s=ready();delete s.operations.recipes[0].managed;s.docs.table_sessions.push({id:'session',status:'open'});s.docs.session_items.push({menu_item_id:'product',session_id:'session',quantity:1000});expect(()=>M.guard(s)).not.toThrow();expect(M.portions(s,'product')).toBeNull();});
});
