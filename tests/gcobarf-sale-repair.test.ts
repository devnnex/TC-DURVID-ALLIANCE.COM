import {describe,it,expect} from 'vitest';
import {reconstructZeroSale} from '../scripts/repair-gcobarf-zero-sales';
const invoice=()=>({id:'sale',totals:{subtotal:0,total:0,discount:0,tax:0},items:[{id:'line',menu_item_id:'p',item_name:'Pollo',quantity:21,unit_price:0,unit_cost:1511.36}],paymentMethod:'cash',payments:[{method:'cash',amount:0}],cashReceived:0,changeDue:0});
const evidence=new Map([['line',{price:5000,source:'Auditoría anterior a la venta'}]]);
describe('Reconstrucción comprobada de ventas antiguas',()=>{
 it('reconstruye 21 × 5.000, conserva costo y registra la evidencia sin inventar el efectivo recibido',()=>{const original=invoice(),fixed=reconstructZeroSale(original,evidence,{delivery_date:'2026-10-29',delivery_time:'09:00'});expect(fixed.totals.total).toBe(105000);expect(fixed.payments).toEqual([{method:'cash',amount:105000}]);expect(fixed.items[0].unit_cost).toBe(1511.36);expect(fixed.cashReceived).toBeNull();expect(fixed.priceRepair.sources[0].source).toContain('Auditoría');expect(fixed.deliveryDate).toBe('2026-10-29');expect(original.totals.total).toBe(0);});
 it('exige evidencia, rechaza repetir una reparación y no reconstruye un pago mixto sin distribución conocida',()=>{expect(()=>reconstructZeroSale(invoice(),new Map())).toThrow('histórico');const fixed=reconstructZeroSale(invoice(),evidence);expect(()=>reconstructZeroSale(fixed,evidence)).toThrow('ya tiene');const mixed=invoice();mixed.payments.push({method:'transfer',amount:0});expect(()=>reconstructZeroSale(mixed,evidence)).toThrow('distribución');});
});
