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

describe('Clientes existentes y visitas diarias del CRM',()=>{
  it('elige por ID del negocio, conserva el nombre real y rechaza inactivos, IDs ajenos y datos incompatibles',()=>{
    const s=state();s.operations.customers=[{id:'existing',name:'María registrada',phone:'3001234567',active:true,birthDate:'1990-01-01',allowCredit:true,creditLimit:90000},{id:'inactive',name:'Inactiva',active:false}];const original=structuredClone(s.operations.customers);
    const chosen=orders(s,'order_submit',order({customerSelection:{id:'existing',contactConsent:true}}),actor);expect(chosen.order).toMatchObject({customerId:'existing',customerName:'María registrada'});expect(s.operations.customers).toEqual(original);expect(JSON.stringify(chosen)).not.toContain('creditLimit');
    for(const selection of [{id:'other-branch',contactConsent:true},{id:'inactive',contactConsent:true},{id:'existing',contactConsent:false},null])expect(()=>orders(s,'order_submit',order({id:'new-order',customerSelection:selection}),actor)).toThrow();
    expect(()=>orders(s,'order_submit',order({id:'both',customerSelection:{id:'existing',contactConsent:true},customerRegistration:profile}),actor)).toThrow('existente');
    const duplicate=orders(s,'order_submit',order({id:'duplicate-phone',customerRegistration:{...profile,name:'Nombre escrito distinto'}}),actor);expect(duplicate.order.customerName).toBe('María registrada');expect(s.operations.customers).toEqual(original);
  });
  it('el directorio limitado permite asociar sin descargar cumpleaños ni cartera',()=>{
    const s=state();s.operations.orderCustomers=[{id:'one',name:'Ana',phoneLast4:'4567'},{id:'blocked',name:'Bloqueada',active:false,phoneLast4:'9876'}];expect(E.orderCustomerDirectory(s.operations)).toEqual([{id:'one',name:'Ana',phoneLast4:'4567'}]);const request=orders(s,'order_submit',order({customerSelection:{id:'one',contactConsent:true}}),actor);expect(request.order.customerId).toBe('one');expect(s.operations.customers).toEqual([]);
  });
  const visitState=()=>({model:{...E.empty(),customers:[{id:'a',name:'Ana'},{id:'b',name:'Beatriz'}]},docs:{service_requests:[],session_items:[],table_sessions:[]},sales:[]} as any);
  function accepted(s:any,id:string,customerId:string,stamp:string,session='session-'+id){s.docs.service_requests.push({id,request_type:'order',status:'acknowledged',created_at:stamp,acknowledged_at:stamp,session_id:session,order:{customerId}});s.docs.session_items.push({id:'line-'+id,order_id:id,session_id:session,status:'served'});}
  it('cuenta una visita diaria aunque haya varias rondas, mesas y facturas; usa el calendario de Colombia',()=>{
    const s=visitState();accepted(s,'one','a','2026-11-01T04:59:00Z');accepted(s,'two','a','2026-11-01T05:00:00Z');accepted(s,'three','a','2026-11-01T23:00:00Z','another-table');accepted(s,'four','a','2026-11-02T05:00:00Z');s.sales=[{id:'sale',customerId:'a',createdAt:'2026-11-01T17:00:00Z',items:[]},{id:'second',customerId:'a',createdAt:'2026-11-01T18:00:00Z',items:[]}];const report=E.crmDailyVisits(s,{type:'month',period:'2026-11'});expect(report.rows[0]).toMatchObject({visits:2,days:['2026-11-01','2026-11-02']});expect(report.total).toBe(2);expect(E.crmDailyVisits(s,{type:'month',period:'2026-10'}).total).toBe(1);expect(E.crmDailyVisits(s,{type:'year',period:'2026'}).total).toBe(3);
  });
  it('excluye pendientes, rechazos, cancelaciones y facturas anuladas; reconoce varios clientes por cuenta',()=>{
    const s=visitState();accepted(s,'one','a','2026-11-01T16:00:00Z','same');accepted(s,'two','b','2026-11-01T16:00:00Z','same');accepted(s,'cancelled','a','2026-11-02T16:00:00Z');s.docs.session_items.at(-1).status='cancelled';accepted(s,'rejected','a','2026-11-03T16:00:00Z');s.docs.service_requests.at(-1).acknowledged_at=null;accepted(s,'pending','a','2026-11-04T16:00:00Z');s.docs.service_requests.at(-1).status='pending';s.sales=[{id:'void',customerId:'a',voided:true,createdAt:'2026-11-05T16:00:00Z',items:[]}];const r=E.crmDailyVisits(s,{type:'month',period:'2026-11'});expect(r.total).toBe(2);expect(r.leaders.map((r:any)=>r.customer.id)).toEqual(['a','b']);expect(r.returning).toBe(0);
  });
  it('incluye ventas antiguas fuera de la descarga reciente, admite rectificaciones locales y no cuenta abonos como visitas',()=>{
    const s=visitState();s.salesHistoryPartial=true;s.model.crmSaleDays=[{saleId:'old',customerId:'a',day:'2026-01-01'},{saleId:'new',customerId:'b',day:'2026-02-01'}];s.sales=[{id:'new',customerId:'b',voided:true,createdAt:'2026-02-01T15:00:00Z',items:[]}];s.model.customerPayments=[{id:'payment',customerId:'a',at:'2026-11-02T15:00:00Z'}];const r=E.crmDailyVisits(s,{type:'year',period:'2026'});expect(r.total).toBe(1);expect(r.leaders[0].customer.id).toBe('a');expect(r.partial).toBe(false);delete s.model.crmSaleDays;expect(E.crmDailyVisits(s,{type:'year',period:'2026'}).partial).toBe(true);
  });
});

it('el cobro de una cuenta después de medianoche no crea una visita adicional',()=>{
  const s:any={model:{...E.empty(),customers:[{id:'client',name:'Ana'}],crmSaleDays:[{saleId:'historical-sale',sessionId:'account',customerId:'client',day:'2026-11-02'}]},docs:{service_requests:[{id:'order',request_type:'order',status:'resolved',session_id:'account',created_at:'2026-11-02T04:55:00Z',acknowledged_at:'2026-11-02T04:56:00Z',order:{customerId:'client'}}],session_items:[{id:'line',order_id:'order',status:'served'}],table_sessions:[]},sales:[]};
  expect(E.crmDailyVisits(s,{type:'month',period:'2026-11'}).rows[0].days).toEqual(['2026-11-01']);
  s.sales=[{id:'historical-sale',sessionId:'account',customerId:'client',createdAt:'2026-11-02T05:05:00Z',items:[]}];expect(E.crmDailyVisits(s,{type:'month',period:'2026-11'}).total).toBe(1);
});
