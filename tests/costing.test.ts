import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe,it,expect } from 'vitest';
const context:any={};runInNewContext(readFileSync('operational/costing-engine.js','utf8'),context);const E=context.AllianceCosting;
export function fixture(){return {settings:{monthlyUnits:100,monthlyMinutes:null,taxRate:19,taxMode:'included'},ingredients:[{id:'flour',name:'Harina',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:80,purchaseTaxRate:0,recoverableTax:false},{id:'cheese',name:'Queso',unit:'kg',quantity:1,purchasePrice:20000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[{id:'rent',name:'Alquiler',amount:100000,periodMonths:1,kind:'fixed',allocation:'units',recipeId:'',includedElsewhere:false},{id:'box',name:'Empaque',amount:500,periodMonths:1,kind:'unit',allocation:'units',recipeId:'',includedElsewhere:false}],channels:[{id:'delivery',name:'Domicilio',salesPercent:10,paymentPercent:2,flatFee:0,feeBase:'net'}],recipes:[{id:'pizza',name:'Pizza',size:'Mediana',category:'Pizzas',output:1,wastePercent:0,minutes:null,monthlyUnits:100,currentPrice:13090,targetPercent:30,marginMode:'margin',channelId:'delivery',lines:[{ingredientId:'flour',quantity:200,unit:'g',processing:{version:1,stockState:'stored',recipeState:'cleaned',thaw:0,clean:20,cook:0}},{ingredientId:'cheese',quantity:100,unit:'g'}]}]};}
describe('Costeo: cantidades, impuestos, comisiones y rentabilidad',()=>{
  it('acepta compras y recetas en libras con las conversiones de peso del inventario',()=>{
    expect(E.convert(1,'lb','g')).toBe(453.59237);expect(E.convert(1,'lb','kg')).toBe(.45359237);
    expect(E.convert(.45359237,'kg','lb')).toBeCloseTo(1,12);
    const m=fixture(),ingredient=m.ingredients[0],recipe=m.recipes[0];
    Object.assign(ingredient,{unit:'lb',quantity:2,purchasePrice:20000});
    recipe.lines=[{ingredientId:ingredient.id,quantity:453.59237,unit:'g'}];
    E.validate(m);expect(E.calculate(m,recipe).batchIngredients).toBeCloseTo(10000);
    recipe.lines[0].unit='lb';recipe.lines[0].quantity=1;
    expect(E.calculate(m,recipe).batchIngredients).toBeCloseTo(10000);
  });
  it('actualiza cantidad usada y costo al corregir la compra de la hoja activa',()=>{
    const m=fixture(),ingredient=m.ingredients[0],recipe=m.recipes[0];
    Object.assign(ingredient,{name:'Bolsas',unit:'unit',quantity:600,purchasePrice:66000});
    recipe.lines=[{ingredientId:ingredient.id,quantity:600,unit:'unit'}];
    m.recipes.push({...structuredClone(recipe),id:'other',lines:[{ingredientId:ingredient.id,quantity:20,unit:'unit'}]});
    E.updateIngredient(m,{...ingredient,quantity:500,purchasePrice:55000},{recipeId:recipe.id});
    E.validate(m);expect(recipe.lines[0].quantity).toBe(500);
    expect(E.calculate(m,recipe).batchIngredients).toBe(55000);
    expect(m.recipes[1].lines[0].quantity).toBe(20);
  });
  it('puede reaplicar una cantidad explícita para corregir el desfase de una edición anterior',()=>{
    const m=fixture(),ingredient=m.ingredients[0],recipe=m.recipes[0];
    Object.assign(ingredient,{unit:'unit',quantity:500,purchasePrice:55000});
    recipe.lines=[{ingredientId:ingredient.id,quantity:600,unit:'unit'}];
    E.updateIngredient(m,{...ingredient},{recipeId:recipe.id,syncQuantity:true});
    expect(recipe.lines[0].quantity).toBe(500);expect(E.calculate(m,recipe).batchIngredients).toBe(55000);
  });
  it('conserva una cantidad usada parcial si sólo se edita el nombre o precio de compra',()=>{
    const m=fixture(),ingredient=m.ingredients[0],recipe=m.recipes[0];
    E.updateIngredient(m,{...ingredient,name:'Harina nueva',purchasePrice:12000},{recipeId:recipe.id});
    expect(recipe.lines[0].quantity).toBe(200);expect(E.calculate(m,recipe).batchIngredients).toBe(5000);
  });
  it('corrige la unidad de la fila abierta aunque no cambie el número de la compra',()=>{
    const m=fixture(),ingredient=m.ingredients[0],recipe=m.recipes[0];
    Object.assign(ingredient,{quantity:500,purchasePrice:55000});
    recipe.lines=[{ingredientId:ingredient.id,quantity:500,unit:'kg'}];
    E.updateIngredient(m,{...ingredient,unit:'g'},{recipeId:recipe.id});
    expect(recipe.lines[0]).toEqual({ingredientId:ingredient.id,quantity:500,unit:'g'});
    expect(E.calculate(m,recipe).batchIngredients).toBe(55000);
  });
  it('corrige kg a unidades en todas las recetas conservando costo y merma',()=>{
    const m=fixture();m.recipes.push({...structuredClone(m.recipes[0]),id:'other'});
    const before=m.recipes.map(r=>E.calculate(m,r).cost);
    E.updateIngredient(m,{...m.ingredients[0],name:'Harina por bolsa',unit:'unit'});E.validate(m);
    for(const [index,r] of m.recipes.entries()){
      expect(r.lines[0].unit).toBe('unit');expect(r.lines[0].quantity).toBe(.2);
      expect(r.lines[0].processing?.clean).toBe(20);expect(E.calculate(m,r).cost).toBeCloseTo(before[index]);
    }
  });
  it('conserva la conversión física al cambiar kg a gramos',()=>{
    const m=fixture(),before=E.calculate(m,m.recipes[0]).cost;
    E.updateIngredient(m,{...m.ingredients[0],unit:'g',quantity:1000});E.validate(m);
    expect(m.recipes[0].lines[0].quantity).toBe(200);expect(E.calculate(m,m.recipes[0]).cost).toBeCloseTo(before);
  });
  it('convierte unidades compatibles y rechaza conversiones físicas inventadas',()=>{expect(E.convert(1,'kg','g')).toBe(1000);expect(E.convert(500,'ml','l')).toBe(.5);expect(()=>E.convert(1,'kg','l')).toThrow();});
  it('calcula costo, precio, utilidad, margen y equilibrio con datos completos',()=>{const m=fixture(),c=E.calculate(E.validate(m),m.recipes[0]);expect(c.definitive).toBe(true);expect(c.ingredients).toBe(4500);expect(c.cost).toBe(6000);expect(c.net).toBeCloseTo(11000);expect(c.taxAmount).toBeCloseTo(2090);expect(c.fees).toBeCloseTo(1320);expect(c.profit).toBeCloseTo(3680);expect(c.recommended).toBeCloseTo(6000/.58*1.19);expect(c.margin).toBeCloseTo(3680/11000*100);expect(c.breakEven).toBe(22);});
  it('descuenta impuestos recuperables de compra una sola vez',()=>{const m=fixture();m.ingredients[0].purchasePrice=11900;m.ingredients[0].purchaseTaxRate=19;m.ingredients[0].recoverableTax=true;expect(E.ingredientCost(m.ingredients[0])).toBeCloseTo(10000);m.ingredients[0].recoverableTax=false;expect(E.ingredientCost(m.ingredients[0])).toBeCloseTo(11900);});
  it('aplica solamente la merma de la línea y divide por la producción real',()=>{const m=fixture();m.recipes[0].output=2;m.recipes[0].wastePercent=20;expect(E.calculate(m,m.recipes[0]).ingredients).toBeCloseTo(4500/2);});
  it('distingue margen de recargo',()=>{const m=fixture();m.recipes[0].marginMode='markup';const c=E.calculate(m,m.recipes[0]);expect(c.recommended).toBeCloseTo(6000*1.3/.88*1.19);expect(c.recommended).not.toBeCloseTo(6000/.58*1.19);});
  it('aplica la comisión sobre la base declarada y el impuesto adicional al vender',()=>{const m=fixture();m.channels[0].feeBase='gross';m.settings.taxMode='added';m.recipes[0].currentPrice=11000;const c=E.calculate(m,m.recipes[0]);expect(c.fees).toBeCloseTo(13090*.12);expect(c.gross).toBeCloseTo(13090);expect(c.recommended).toBeCloseTo(6000/(1-.3-.12*1.19));});
  it('no presenta un costeo definitivo sin capacidad mensual o canal',()=>{const m:any=fixture();m.settings.monthlyUnits=null;let c=E.calculate(m,m.recipes[0]);expect(c.definitive).toBe(false);expect(c.missing.join(' ')).toContain('unidades mensuales');m.recipes[0].channelId='';c=E.calculate(m,m.recipes[0]);expect(c.missing.join(' ')).toContain('canal');expect(c.breakEven).toBeNull();});
  it('normaliza anual a mensual y excluye gastos ya contabilizados',()=>{const m=fixture();m.expenses[0].amount=1200000;m.expenses[0].periodMonths=12;expect(E.calculate(m,m.recipes[0]).allocated).toBe(1000);m.expenses[0].includedElsewhere=true;expect(E.calculate(m,m.recipes[0]).allocated).toBe(0);});
  it('distribuye gastos por tiempo y exige capacidad explícita',()=>{const m:any=fixture();m.expenses[0].allocation='minutes';m.settings.monthlyMinutes=1000;m.recipes[0].minutes=5;expect(E.calculate(m,m.recipes[0]).allocated).toBe(500);m.recipes[0].minutes=null;expect(E.calculate(m,m.recipes[0]).definitive).toBe(false);});
  it('recalcula recetas relacionadas al variar un precio de ingrediente',()=>{const m=fixture();m.ingredients[1].purchasePrice=30000;expect(E.calculate(m,m.recipes[0]).cost).toBe(7000);});
  it('asigna por completo un gasto dedicado al producto y evita conceptos duplicados',()=>{const m:any=fixture();m.expenses[0].recipeId='pizza';m.expenses[0].allocation='minutes';m.recipes[0].minutes=5;m.settings.monthlyMinutes=10000;expect(E.calculate(m,m.recipes[0]).allocated).toBe(1000);m.expenses.push({...m.expenses[0],id:'rent-copy'});expect(()=>E.validate(m)).toThrow('ya está registrado');});
  it('detecta pérdidas y objetivos imposibles sin dividir por cero',()=>{const m=fixture();m.recipes[0].currentPrice=1000;expect(E.calculate(m,m.recipes[0]).profit).toBeLessThan(0);m.recipes[0].targetPercent=95;const c=E.calculate(m,m.recipes[0]);expect(c.definitive).toBe(false);expect(c.recommended).toBeNull();});
  it('no permite eliminar ingredientes vinculados, valores negativos o rendimiento cero',()=>{const m=fixture();m.ingredients=[];expect(()=>E.validate(m)).toThrow();const n=fixture();n.recipes[0].lines[0].processing!.clean=100;expect(()=>E.validate(n)).toThrow();n.recipes[0].lines[0].processing!.clean=0;n.ingredients[0].purchasePrice=-1;expect(()=>E.validate(n)).toThrow();});
});
