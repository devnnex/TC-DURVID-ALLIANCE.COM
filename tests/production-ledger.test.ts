import{readFileSync}from'node:fs';
import{runInNewContext}from'node:vm';
import{randomUUID}from'node:crypto';
import{describe,it,expect}from'vitest';
const context:any={structuredClone,crypto:{randomUUID},BRANCH_CONFIG:{slug:'gcobarf'}};
for(const f of ['jespresso-engine.js','costing-engine.js','operations-engine.js','materials-engine.js','production-engine.js','orders-local.js','pos-local.js'])runInNewContext(readFileSync('operational/'+f,'utf8'),context);
const E=context.AllianceOperationsEngine,P=context.AllianceProduction,M=context.AllianceMaterialsEngine,actor={id:'owner',full_name:'Responsable',role:'boss'},POS=context.AllianceLocalPOS(actor);
function fixture(){const model=context.AllianceCosting.empty();model.ingredients=[{id:'chicken',stockId:'raw-chicken',name:'Pollo',unit:'g',quantity:1000,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}];model.channels=[{id:'direct',name:'Directo',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}];model.recipes=[{id:'batch',name:'Producción',output:196,wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:10000,targetPercent:30,marginMode:'margin',channelId:'direct',pricingBasis:'production',lines:[{ingredientId:'chicken',unit:'g',initialQuantity:1000,quantity:950}]}];const state:any={costing:{model,revision:1},operations:E.empty(),units:[{id:'g',dimension:'MASS',factor:1},{id:'kg',dimension:'MASS',factor:1000},{id:'u',dimension:'COUNT',factor:1}],docs:{menu_items:[{id:'product',name:'Preparación',price:10000}],table_sessions:[],session_items:[],restaurant_tables:[],service_requests:[],menu_categories:[],business_settings:[]},stock:{product:{productId:'product',name:'Preparación',stock:0,costPrice:0,salePrice:10000,minStock:0,version:1}},movements:[],sales:[],receipts:{}};state.operations.ingredients=[{id:'raw-chicken',name:'Pollo',unit:'g',quantity:5000,unitCost:10,minStock:0,revision:1}];return state;}
const invoice=(sessionId:string,line:any)=>({id:randomUUID(),sessionId,saleChannel:'walk_in',number:randomUUID(),createdAt:new Date().toISOString(),items:[line],totals:{subtotal:line.quantity*10000,total:line.quantity*10000,discount:0,tax:0,serviceFee:0,tip:0},payments:[{method:'transfer',amount:line.quantity*10000}]});
describe('Producción y preparaciones con existencias físicas',()=>{
  it('repetir, editar cantidades y sustituir un ingrediente ajusta únicamente las diferencias',()=>{
    context.BRANCH_CONFIG.slug='gcobarf';const s=fixture(),line=s.costing.model.recipes[0].lines[0];
    P.post(s,'batch',actor);expect(s.operations.ingredients[0].quantity).toBe(4000);P.post(s,'batch',actor);expect(s.operations.ingredients[0].quantity).toBe(4000);expect(s.operations.materialMovements).toHaveLength(1);
    line.initialQuantity=1200;P.post(s,'batch',actor);expect(s.operations.ingredients[0].quantity).toBe(3800);
    line.quantity=800;line.initialQuantity=900;P.post(s,'batch',actor);expect(s.operations.ingredients[0].quantity).toBe(4100);
    s.operations.ingredients.push({id:'raw-other',name:'Otro',unit:'g',quantity:1000,unitCost:20,minStock:0,revision:1});s.costing.model.ingredients[0].stockId='raw-other';P.post(s,'batch',actor);expect(s.operations.ingredients[0].quantity).toBe(5000);expect(s.operations.ingredients[1].quantity).toBe(100);
    line.initialQuantity=1200;expect(()=>P.post(s,'batch',actor)).toThrow('No alcanza');expect(s.operations.ingredients[1].quantity).toBe(100);
  });
  it('196 unidades terminadas se incorporan una vez; vender y corregir no repite el consumo de materias primas',()=>{
    context.BRANCH_CONFIG.slug='gcobarf';const s=fixture();P.post(s,'batch',actor);P.transfer(s,'batch','product',actor);P.transfer(s,'batch','product',actor);expect(s.stock.product.stock).toBe(196);
    POS.execute(s,'record_sale',{invoice:invoice('direct',{id:randomUUID(),menu_item_id:'product',item_name:'Preparación',quantity:5,unit_price:10000})});expect(s.stock.product.stock).toBe(191);expect(s.operations.ingredients[0].quantity).toBe(4000);
    s.costing.model.recipes[0].output=190;P.post(s,'batch',actor);expect(s.stock.product.stock).toBe(185);P.transfer(s,'batch','product',actor);expect(s.stock.product.stock).toBe(185);
    s.costing.model.recipes[0].output=4;expect(()=>P.post(s,'batch',actor)).toThrow('ya fue vendida');expect(s.stock.product.stock).toBe(185);
  });
  it('la merma conserva el costo de la materia consumida y aumenta el costo de la cantidad aprovechable',()=>{
    const s=fixture(),r=s.costing.model.recipes[0],line=r.lines[0];expect(context.AllianceCosting.lineCost(s.costing.model.ingredients[0],line)).toBe(10000);expect(10000/line.quantity).toBeCloseTo(10/.95);
    line.quantity=0;expect(context.AllianceCosting.lineCost(s.costing.model.ingredients[0],line)).toBe(10000);
  });
  it('un consumo descuenta insumos al agregarlo, cambia la capacidad compartida y puede editarse o cancelarse',()=>{
    context.BRANCH_CONFIG.slug='cocteleria';const s=fixture();s.operations.recipes=[{productId:'product',recipeId:'batch',managed:true,lines:[{ingredientId:'raw-chicken',quantity:100,unit:'g'}]},{productId:'other',recipeId:'other',managed:true,lines:[{ingredientId:'raw-chicken',quantity:200,unit:'g'}]}];s.docs.table_sessions=[{id:'table-account',status:'open'}];
    POS.execute(s,'query',{table:'session_items',op:'insert',values:{id:'consumption',session_id:'table-account',menu_item_id:'product',quantity:5,unit_price:10000}});expect(s.operations.ingredients[0].quantity).toBe(4500);expect(M.portions(s,'other')).toBe(22);
    POS.execute(s,'query',{table:'session_items',op:'update',filters:[{field:'id',op:'eq',value:'consumption'}],values:{quantity:3}});expect(s.operations.ingredients[0].quantity).toBe(4700);expect(M.portions(s,'other')).toBe(23);
    POS.execute(s,'query',{table:'session_items',op:'update',filters:[{field:'id',op:'eq',value:'consumption'}],values:{status:'cancelled'}});expect(s.operations.ingredients[0].quantity).toBe(5000);
  });
  it('cobrar un consumo ya preparado no descuenta dos veces y anular devuelve su consumo real',()=>{
    context.BRANCH_CONFIG.slug='cafeteria';const s=fixture();s.operations.recipes=[{productId:'product',recipeId:'batch',managed:true,lines:[{ingredientId:'raw-chicken',quantity:100,unit:'g'}]}];s.docs.table_sessions=[{id:'account',status:'open'}];
    const line={id:'prepared',session_id:'account',menu_item_id:'product',item_name:'Preparación',quantity:5,unit_price:10000};POS.execute(s,'query',{table:'session_items',op:'insert',values:line});expect(s.operations.ingredients[0].quantity).toBe(4500);
    const sale=invoice('account',line);POS.execute(s,'record_sale',{invoice:sale});expect(s.operations.ingredients[0].quantity).toBe(4500);POS.execute(s,'record_sale',{invoice:sale});expect(s.operations.ingredients[0].quantity).toBe(4500);
    POS.execute(s,'delete_sale',{saleId:sale.id});expect(s.operations.ingredients[0].quantity).toBe(5000);
  });
});
