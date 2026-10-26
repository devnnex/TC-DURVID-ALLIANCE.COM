import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const ctx:any={structuredClone};runInNewContext(readFileSync('operational/costing-engine.js','utf8')+readFileSync('operational/operations-engine.js','utf8'),ctx);
export function productionFixture(){
  const x:any={};runInNewContext(readFileSync('operational/vendor/xlsx.js','utf8'),x);
  const workbook=x.XLSX.read(readFileSync(readdirSync('.').find(n=>n.startsWith('Excel base')&&n.endsWith('.xlsx'))!),{type:'buffer'}),sheet=workbook.Sheets['Dia Producción'];
  const ingredients=Array.from({length:7},(_,i)=>({id:'i'+i,name:sheet['F'+(i+8)].v,unit:'unit',quantity:1,purchasePrice:sheet['H'+(i+8)].v,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}));
  const expenses=Array.from({length:6},(_,i)=>({id:'e'+i,name:sheet['J'+(i+8)].v,amount:i===5?35000000:sheet['K'+(i+8)].v,periodMonths:i===5?120:1,kind:'fixed',allocation:'units',recipeId:'',includedElsewhere:false}));
  expenses.push({id:'labor',name:'Mano de obra del lote',amount:sheet.H15.v,periodMonths:1,kind:'batch',allocation:'units',recipeId:'batch',includedElsewhere:false});
  const model={settings:{monthlyUnits:sheet.K18.v,monthlyMinutes:null,taxRate:0,taxMode:'included'},ingredients,expenses,channels:[{id:'direct',name:'Venta directa',salesPercent:0,paymentPercent:0,flatFee:0,feeBase:'net'}],recipes:[{id:'batch',name:'Producción del Excel',size:'Lote',category:'Preparados',output:sheet.F30.v,wastePercent:0,minutes:null,monthlyUnits:sheet.K18.v,currentPrice:6000,targetPercent:30,marginMode:'margin',channelId:'direct',lines:ingredients.map(i=>({ingredientId:i.id,quantity:1,unit:'unit'}))}]};
  return {model,sheet};
}
describe('Producción y turnos: fórmulas y datos reales',()=>{
  it('reproduce el Excel: compras / producción real + gasto mensual / producción mensual',()=>{
    const {model,sheet}=productionFixture(),c=ctx.AllianceCosting.calculate(ctx.AllianceCosting.validate(model),model.recipes[0]);
    expect(c.batchIngredients+c.batchDirect).toBe(sheet.H16.v);expect(c.batchIngredients+c.batchDirect).toBe(610931);
    expect(model.recipes[0].output).toBe(248);expect(model.recipes[0].output).not.toBe(sheet.H6.v);
    expect(c.ingredients+c.direct).toBeCloseTo(sheet.F31.v,9);expect(c.allocated).toBeCloseTo(sheet.K25.v,9);expect(c.cost).toBeCloseTo(sheet.K26.v,9);
    expect(c.cost).toBeCloseTo(3948.6465053763445,9);expect(c.definitive).toBe(true);
  });
  it('no inventa producción mensual y exige asignar el costo del lote',()=>{const {model}:any=productionFixture();model.settings.monthlyUnits=null;expect(ctx.AllianceCosting.calculate(model,model.recipes[0]).definitive).toBe(false);model.expenses.at(-1).recipeId='';expect(()=>ctx.AllianceCosting.validate(model)).toThrow('lote');});
  it('corrige o suma base sin duplicar ingresos, conserva responsables y detecta concurrencia',()=>{
    const E=ctx.AllianceOperationsEngine,actor={id:'boss',full_name:'Jefe',role:'boss'},apply=(s:any,command:string,payload:any)=>E.apply(s,{id:'job-'+command,command,payload},actor,[],'2026-10-17T23:00:00Z');
    let state=apply(E.empty(),'cash_open',{id:'shift',name:'Noche',opening:50000,date:'2026-10-17',startTime:'18:00',endTime:'02:00'});
    state=apply(state,'cash_move',{sessionId:'shift',amount:10000,kind:'in',reason:'Entrada real'});
    const change={sessionId:'shift',revision:1,action:'add',opening:5000,date:'2026-10-17',startTime:'18:00',endTime:'02:00'};
    state=apply(state,'cash_shift_update',change);expect(state.cashSessions[0].opening).toBe(55000);expect(E.expected(state,state.cashSessions[0])).toBe(65000);expect(state.cashMovements).toHaveLength(1);expect(state.cashSessions[0].baseChanges[0].actorName).toBe('Jefe');
    expect(()=>apply(state,'cash_shift_update',change)).toThrow('cambió');expect(()=>apply(state,'cash_shift_update',{...change,revision:2,date:'2026-02-30'})).toThrow('fecha');
  });
});
