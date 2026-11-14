import {describe,it,expect} from 'vitest';
import '../operational/operations-engine.js';
const E=(globalThis as any).AllianceOperationsEngine;
const actor={id:'buyer',full_name:'Compradora',role:'boss'};
const units=['u','g','kg','ml','l','lb','oz'].map(id=>({id}));
let n=0;
const apply=(s:any,command:string,payload:any,who=actor)=>E.apply(s,{id:'job-'+ ++n,command,payload},who,units,'2026-11-14T20:00:00Z');
const purchase={id:'purchase',name:'Café',quantity:2.5,unit:'kg',total:100000};
describe('Registro de compras independiente del inventario',()=>{
  it.each(units.map(u=>u.id))('conserva la cantidad, precisión y unidad %s',unit=>{
    const s=apply(E.empty(),'purchase_record',{...purchase,unit});
    expect(s.purchases[0]).toMatchObject({quantity:2.5,unit,unitPrice:40000,revision:1,createdById:actor.id});
    expect(s.materialMovements).toEqual([]);expect(s.cashMovements).toEqual([]);
  });
  it('guarda texto libre sin inventar cantidades ni costo unitario',()=>{
    const s=apply(E.empty(),'purchase_record',{id:'text',name:'Vasos',quantityText:'  3 cajas de 12  ',total:18000});
    expect(s.purchases[0].quantityText).toBe('3 cajas de 12');
    expect(s.purchases[0]).not.toHaveProperty('quantity');expect(s.purchases[0]).not.toHaveProperty('unitPrice');
    expect(()=>apply(E.empty(),'purchase_record',{...purchase,quantityText:'2 cajas'})).toThrow();
    expect(()=>apply(E.empty(),'purchase_record',{...purchase,unit:'inventada'})).toThrow();
  });
  it('edita ambas modalidades sin dejar campos anteriores y conserva al creador',()=>{
    let s=apply(E.empty(),'purchase_record',purchase);
    s=apply(s,'purchase_update',{id:'purchase',revision:1,name:'Café molido',quantityText:'Un bulto',total:90000},{...actor,id:'editor',full_name:'Editora'});
    expect(s.purchases[0]).toMatchObject({revision:2,createdById:'buyer',actorId:'editor',quantityText:'Un bulto'});
    expect(s.purchases[0]).not.toHaveProperty('unitPrice');expect(s.purchases[0]).not.toHaveProperty('quantity');
    expect(()=>apply(s,'purchase_update',{...purchase,revision:1})).toThrow('cambió');
    s=apply(s,'purchase_update',{...purchase,revision:2});expect(s.purchases[0]).not.toHaveProperty('quantityText');
    expect(s.purchases[0].revision).toBe(3);
  });
  it('rechaza eliminación obsoleta y protege compras con pagos/inventario',()=>{
    const s=apply(E.empty(),'purchase_record',purchase);
    expect(()=>apply(s,'purchase_delete',{id:'purchase',revision:2})).toThrow('cambió');
    expect(apply(s,'purchase_delete',{id:'purchase',revision:1}).purchases).toEqual([]);
    s.purchases[0].kind='advanced';
    expect(()=>apply(s,'purchase_delete',{id:'purchase',revision:1})).toThrow('movimientos');
  });
  it('permite editar compras antiguas que no tenían revisión ni unidad',()=>{
    const s=E.empty();s.purchases=[{id:'purchase',kind:'simple',name:'Antigua',quantity:30,total:50000,unitPrice:50000/30,actorId:'original',actorName:'Original',at:'2026-10-01T12:00:00Z'}];
    const next=apply(s,'purchase_update',{...purchase,revision:1}).purchases[0];
    expect(next.createdById).toBe('original');expect(next.createdAt).toBe(s.purchases[0].at);expect(next.revision).toBe(2);
  });
});
