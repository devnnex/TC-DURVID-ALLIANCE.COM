import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const fixture=()=>({settings:{monthlyUnits:100,monthlyMinutes:null,taxRate:19,taxMode:'included'},ingredients:[{id:'base',name:'Ingrediente',unit:'kg',quantity:1,purchasePrice:10000,yieldPercent:100,purchaseTaxRate:0,recoverableTax:false}],expenses:[{id:'rent',name:'Alquiler',amount:100000,periodMonths:1,kind:'fixed',allocation:'units',recipeId:'',includedElsewhere:false}],channels:[{id:'direct',name:'Domicilio',salesPercent:10,paymentPercent:2,flatFee:0,feeBase:'net'}],recipes:[{id:'product',name:'Producto',size:'',category:'',output:1,wastePercent:0,minutes:null,monthlyUnits:100,currentPrice:13090,targetPercent:30,marginMode:'margin',channelId:'direct',lines:[{ingredientId:'base',quantity:.5,unit:'kg'}]}]});
const ctx:any={};runInNewContext(readFileSync('operational/costing-engine.js','utf8'),ctx);const E=ctx.AllianceCosting;
describe('Precio mínimo y sugerido de la hoja de producción',()=>{
  it('cubre costo completo, comisiones y tarifa fija sin necesitar precio actual',()=>{
    const m:any=fixture();m.channels[0].flatFee=500;m.recipes[0].currentPrice=null;
    const g=E.priceGuide(m,m.recipes[0]);expect(g.complete).toBe(true);expect(g.cost).toBe(6000);
    expect(g.minimum).toBe(Math.ceil(6500/.88*1.19));expect(g.recommended).toBe(Math.ceil(6500/.58*1.19));
    expect(E.calculate(m,{...m.recipes[0],currentPrice:g.minimum}).profit).toBeGreaterThanOrEqual(0);
    expect(E.calculate(m,{...m.recipes[0],currentPrice:g.minimum-1}).profit).toBeLessThan(0);
  });
  it('separa precio sin impuesto del total cobrado y respeta comisión sobre el total',()=>{
    const m=fixture();m.settings.taxMode='added';m.channels[0].feeBase='gross';const g=E.priceGuide(m,m.recipes[0]);
    expect(g.minimum).toBe(Math.ceil(6000/(1-.12*1.19)));expect(g.minimumTotal).toBeCloseTo(g.minimum*1.19);
    expect(E.calculate(m,{...m.recipes[0],currentPrice:g.minimum}).profit).toBeGreaterThanOrEqual(0);
  });
  it('no recomienda un valor definitivo si falta volumen o un canal confirmado',()=>{
    const m:any=fixture();m.settings.monthlyUnits=null;let g=E.priceGuide(m,m.recipes[0]);expect(g.minimum).toBeNull();expect(g.recommended).toBeNull();
    m.settings.monthlyUnits=100;m.recipes[0].channelId='';g=E.priceGuide(m,m.recipes[0]);expect(g.complete).toBe(false);expect(g.minimum).toBeNull();
  });
  it('distingue recargo de margen y conserva el mínimo aunque la meta sea imposible',()=>{
    const m=fixture();m.recipes[0].marginMode='markup';let g=E.priceGuide(m,m.recipes[0]);expect(g.recommended).toBe(Math.ceil(6000*1.3/.88*1.19));
    m.recipes[0].marginMode='margin';m.recipes[0].targetPercent=95;g=E.priceGuide(m,m.recipes[0]);expect(g.minimum).toBeGreaterThan(0);expect(g.recommended).toBeNull();
  });
  it('usa producción para el precio y conserva el reparto mensual como referencia separada',()=>{
    const m:any=fixture();m.settings={monthlyUnits:50,monthlyMinutes:null,taxRate:0,taxMode:'included'};m.ingredients[0].purchasePrice=549600;m.expenses[0].amount=641000;m.channels[0].salesPercent=0;m.channels[0].paymentPercent=0;
    Object.assign(m.recipes[0],{output:204,currentPrice:5000,targetPercent:50,pricingBasis:'production',lines:[{ingredientId:'base',quantity:1,unit:'kg'}]});
    const c=E.calculate(m,m.recipes[0]),g=E.priceGuide(m,m.recipes[0]);expect(c.cost).toBeCloseTo(2694.117647);expect(c.fullCost).toBeCloseTo(15514.117647);expect(c.contribution).toBeCloseTo(2305.882353);expect(c.margin).toBeCloseTo(46.117647);expect(g.minimum).toBe(2695);expect(g.recommended).toBe(5389);expect(Math.ceil(c.monthlyFixed/c.contribution)).toBe(278);
    m.recipes[0].targetPercent=46.11;expect(E.priceGuide(m,m.recipes[0]).recommended).toBe(5000);
    m.settings.monthlyUnits=null;expect(E.priceGuide(m,m.recipes[0]).minimum).toBe(2695);expect(E.calculate(m,m.recipes[0]).operatingMissing).toHaveLength(1);
  });
});
