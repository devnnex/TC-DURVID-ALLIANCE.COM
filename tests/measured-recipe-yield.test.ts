import {describe,it,expect} from 'vitest';
import '../operational/operations-engine.js';
import '../operational/materials-engine.js';
import '../operational/jespresso-engine.js';
import '../operational/costing-engine.js';
const E=(globalThis as any).AllianceCosting,M=(globalThis as any).AllianceMaterialsEngine;
describe('Merma pesada en recetas',()=>{
 it('usa el mismo costo y consumo que la merma manual y no aplica etapas dos veces',()=>{const i={quantity:1,unit:'kg',purchasePrice:10000,purchaseTaxRate:0,recoverableTax:false};const line={quantity:200,unit:'g',processing:E.processingFromWeights(200,160)};expect(E.processingFactor(line)).toBeCloseTo(.8,12);expect(E.lineCost(i,line)).toBeCloseTo(2500,10);expect(E.lineQuantity(line)).toBeCloseTo(250,10);expect(line.processing).toMatchObject({thaw:0,cook:0});expect(line.processing.clean).toBeCloseTo(20,12);});
 it('rechaza pesos vacíos, cero, negativos y ganancia de peso sin producir costo infinito',()=>{for(const pair of [[null,2],[1,null],[0,0],[1,0],[1,2],[-1,1],[1,Infinity]])expect(()=>E.processingFromWeights(...pair)).toThrow();expect(E.processingFromWeights(5,5).clean).toBe(0);});
 it('conserva precisión decimal y funciona con unidades compatibles de peso y volumen',()=>{expect(E.processingFactor({processing:E.processingFromWeights(75,71.25)})).toBeCloseTo(.95,14);expect(E.processingFactor({processing:E.processingFromWeights(1.237,1.019)})).toBeCloseTo(1.019/1.237,14);});
 it('reduce la capacidad de todos los productos que comparten insumos, incluyendo reservas y el carrito',()=>{const state={operations:{ingredients:[{id:'raw',quantity:1000,unit:'g'}],recipes:[{productId:'a',managed:true,lines:[{ingredientId:'raw',quantity:250,unit:'g'}]},{productId:'b',managed:true,lines:[{ingredientId:'raw',quantity:100,unit:'g'}]}]},units:[{id:'g',dimension:'MASS',factor:1}],docs:{table_sessions:[{id:'open',status:'open'}],session_items:[{id:'held',session_id:'open',menu_item_id:'b',quantity:2}]}};expect(M.cartCapacity(state,'a',[])).toBe(3);expect(M.cartCapacity(state,'a',[{productId:'b',quantity:4}])).toBe(1);expect(M.cartCapacity(state,'b',[{productId:'a',quantity:3}])).toBe(0);expect(state.operations.ingredients[0].quantity).toBe(1000);});
});
