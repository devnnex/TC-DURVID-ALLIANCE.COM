import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const sandbox:any={};runInNewContext(readFileSync('operational/waiter-flow.js','utf8'),sandbox);const flow=sandbox.WaiterFlow;
describe('Comandas por pasos',()=>{
 it('calcula importes monetarios sin arrastrar decimales binarios e invalida cantidades incorrectas',()=>{expect(flow.amount([{quantity:3,unitPrice:.1},{quantity:1,unitPrice:.2}])).toBe(.5);expect(flow.amount([{quantity:0,unitPrice:10}])).toBeNull();expect(flow.amount([{quantity:NaN,unitPrice:10}])).toBeNull();});
 it('los controles respetan capacidad, límites y cantidades fraccionarias',()=>{expect(flow.adjustQuantity(2,1,2)).toBe(2);expect(flow.adjustQuantity(1,1,0)).toBeNull();expect(flow.adjustQuantity(9999,1,null)).toBe(10000);expect(flow.adjustQuantity(1,-1)).toBe(1);expect(flow.adjustQuantity(2.5,-1)).toBe(1.5);});
 it('separa mesas libres, cuentas abiertas y comandas pendientes y excluye consumos anulados',()=>{const result=flow.tableStates([{id:'free'},{id:'busy'},{id:'pending'},{id:'inactive',is_active:false}],{docs:{table_sessions:[{id:'s',table_id:'busy',status:'open'},{id:'closed',table_id:'free',status:'closed'}],session_items:[{session_id:'s',quantity:1,unit_price:49098},{session_id:'s',quantity:1,unit_price:10000,status:'cancelled'},{session_id:'closed',quantity:1,unit_price:10000}],service_requests:[{id:'o',table_id:'pending',request_type:'order',status:'pending'}]}});expect(result).toHaveLength(3);expect(result[0]).toMatchObject({occupied:false,total:0});expect(result[1]).toMatchObject({occupied:true,total:49098});expect(result[2]).toMatchObject({occupied:false,pending:1});});
});
