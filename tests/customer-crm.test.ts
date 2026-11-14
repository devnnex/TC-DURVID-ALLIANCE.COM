import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import '../operational/operations-engine.js';
import '../operational/orders-local.js';
const E=(globalThis as any).AllianceOperationsEngine,orders=(globalThis as any).AllianceOrdersLocal;
const at='2026-11-14T15:00:00.000Z',actor={id:'staff',full_name:'Laura Mesera'},profile={name:'María Pérez',phone:'300 123 4567',birthDate:'1990-11-14',contactConsent:true};
const command=(payload:any)=>({id:'job',command:'customer_crm_save',payload:{id:'client',revision:0,active:true,...profile,...payload}});
const state=():any=>({operations:E.empty(),docs:{restaurant_tables:[{id:'table',is_active:true,table_name:'M1'}],menu_items:[{id:'product',name:'Café',price:5000,is_available:true}],table_sessions:[],session_items:[],service_requests:[]}});
const order=(extra:any={})=>({id:'order-1',tableId:'table',items:[{productId:'product',quantity:1,unitPrice:5000,notes:''}],notes:'',...extra});
beforeEach(()=>{(globalThis as any).BRANCH_CONFIG={slug:'cocteleria'};});afterEach(()=>{delete (globalThis as any).BRANCH_CONFIG;});
describe('CRM de clientes y registro autorizado desde comandas',()=>{
  it('guarda perfil y responsable sin otorgar crédito, y conserva creación y saldos al editar',()=>{
    let s=E.apply(E.empty(),command({}),actor,[],at);expect(s.customers[0]).toMatchObject({...profile,phoneKey:'573001234567',allowCredit:false,createdAt:at,createdByName:'Laura Mesera',revision:1});
    expect(()=>E.apply(s,{id:'debt-job',command:'debt_add',payload:{id:'new-debt',customerId:'client',total:1000,dueDate:'2026-12-01',reference:'Saldo'}},actor,[],at)).toThrow('crédito habilitado');
    s.customers[0].allowCredit=true;s.customers[0].creditLimit=50000;s.debts.push({id:'debt',customerId:'client',total:4000,paid:1000});
    const next=E.apply(s,command({revision:1,name:'María Actualizada'}),{id:'boss',full_name:'Jefe'},[],'2026-11-15T15:00:00.000Z');
    expect(next.customers[0]).toMatchObject({createdById:'staff',createdAt:at,actorId:'boss',creditLimit:50000,allowCredit:true,revision:2});expect(next.debts).toEqual(s.debts);
  });
  it('rechaza fechas inválidas, teléfonos, falta de autorización y duplicados equivalentes',()=>{
    for(const patch of [{birthDate:'2026-02-30'},{birthDate:'2026-11-15'},{phone:'abc3001234'},{phone:'123'},{contactConsent:false}])expect(()=>E.apply(E.empty(),command(patch),actor,[],at)).toThrow();
    const s=E.apply(E.empty(),command({}),actor,[],at);expect(()=>E.apply(s,command({id:'second',phone:'+57 3001234567'}),actor,[],at)).toThrow('Ya existe');
    expect(()=>E.apply(s,command({revision:0}),actor,[],at)).toThrow('modificó');
  });
  it('cuenta cumpleaños de hoy y del mes en Colombia, incluyendo 29 de febrero',()=>{
    expect(E.colombiaDate('2026-11-14T03:59:00Z')).toBe('2026-11-13');
    const clients=[{id:'today',name:'Hoy',active:true,birthDate:'1990-11-14'},{id:'month',name:'Mes',active:true,birthDate:'1993-11-29'},{id:'other',name:'Otro',active:true,birthDate:'2000-12-01'},{id:'inactive',name:'Inactivo',active:false,birthDate:'2000-11-14'},{id:'old',name:'Anterior',active:true}];
    const summary=E.crmBirthdays(clients,'2026-11-14');expect(summary.today.map((r:any)=>r.customer.id)).toEqual(['today']);expect(summary.month).toHaveLength(2);expect(summary.upcoming[0].date).toBe('2026-11-14');
    expect(E.crmBirthdays([{id:'leap',name:'Bisiesto',birthDate:'2000-02-29'}],'2027-02-28').today).toHaveLength(1);
  });
  it('registra al cliente con su comanda, sin devolver teléfono ni cumpleaños al mesero',()=>{
    const s=state(),request=orders(s,'order_submit',order({customerRegistration:profile}),actor);
    expect(s.operations.customers).toHaveLength(1);expect(s.operations.customers[0]).toMatchObject({source:'waiter',sourceOrderId:'order-1',createdById:'staff',allowCredit:false});
    expect(request.order).toMatchObject({customerId:'crm-order-1',customerName:'María Pérez'});expect(JSON.stringify(request)).not.toContain('1990-11-14');expect(JSON.stringify(request)).not.toContain('300 123');
    orders(s,'order_accept',{requestId:'order-1',expectedSessionId:null},{id:'cashier',full_name:'Cajera'});expect(s.docs.session_items[0]).toMatchObject({customer_id:'crm-order-1'});expect(s.operations.tickets[0]).toMatchObject({customerId:'crm-order-1'});
  });
  it('reutiliza teléfonos sin sobrescribir datos previos y un envío inválido no crea clientes',()=>{
    const s=state();orders(s,'order_submit',order({customerRegistration:profile}),actor);const original=structuredClone(s.operations.customers[0]);
    orders(s,'order_submit',order({id:'order-2',customerRegistration:{...profile,name:'Nombre distinto',phone:'+57 3001234567',birthDate:'1993-01-01'}}),actor);
    expect(s.operations.customers).toEqual([original]);expect(s.docs.service_requests[1].order.customerId).toBe(original.id);
    const invalid=state();expect(()=>orders(invalid,'order_submit',order({customerRegistration:{...profile,contactConsent:false}}),actor)).toThrow('autorizó');expect(invalid.operations.customers).toEqual([]);expect(invalid.docs.service_requests).toEqual([]);
    expect(()=>orders(invalid,'order_submit',order({tableId:'wrong',customerRegistration:profile}),actor)).toThrow();expect(invalid.operations.customers).toEqual([]);
  });
  it('mantiene los pedidos normales y limita el CRM a los dos negocios solicitados',()=>{
    const s=state();orders(s,'order_submit',order(),actor);expect(s.operations.customers).toEqual([]);expect(s.docs.service_requests[0].order).not.toHaveProperty('customerId');
    (globalThis as any).BRANCH_CONFIG={slug:'gcobarf'};expect(()=>E.apply(E.empty(),command({}),actor,[],at)).toThrow('cafetería y coctelería');
  });
});
