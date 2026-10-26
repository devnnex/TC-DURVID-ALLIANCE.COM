const allianceOrderVersion=(state,entity,id)=>{state.docVersions||={};state.docVersions[entity]||={};state.docVersions[entity][id]=(state.docVersions[entity][id]||0)+1;};
/* Keep account lines and preparation tickets consistent without changing inventory. */
globalThis.AllianceReconcileSession=(state,sessionId,user)=>{
 const session=state.docs.table_sessions.find(s=>s.id===sessionId);if(!session)return;
 const active=state.docs.session_items.filter(l=>l.session_id===sessionId&&l.status!=='cancelled');
 if(session.status==='open'&&!active.length){session.status='closed';session.closed_at=new Date().toISOString();allianceOrderVersion(state,'table_sessions',sessionId);}
 for(const ticket of state.operations.tickets.filter(t=>t.sessionId===sessionId)){
   const previous=ticket.items;ticket.items=previous.flatMap(l=>{const current=active.find(i=>i.id===l.id);return current?[{...l,name:current.item_name,quantity:current.quantity,notes:current.notes||''}]:[];});
   if(session.status!=='open'||!ticket.items.length){ticket.status=['closed','paid'].includes(session.status)&&ticket.items.length?'delivered':'cancelled';}
   ticket.updatedAt=new Date().toISOString();ticket.updatedBy=user.full_name;ticket.updatedById=user.id;
 }
 for(const request of state.docs.service_requests.filter(r=>r.session_id===sessionId))if(session.status!=='open'){request.status='resolved';request.resolved_at=new Date().toISOString();allianceOrderVersion(state,'service_requests',request.id);}
};
/* The same order rules for the local queue, demonstration and reconnection tests. */
globalThis.AllianceOrdersLocal=(state,action,p,user)=>{
  const now=new Date().toISOString(),copy=v=>structuredClone(v),fail=message=>{throw new Error(message);};
  const requests=state.docs.service_requests,tables=state.docs.restaurant_tables;
  if(action==='order_cancel'){
    const ticket=state.operations.tickets.find(t=>t.id===p.ticketId);if(!ticket)fail('Esta comanda no está disponible.');
    if(ticket.status==='cancelled')return copy(ticket);
    const session=state.docs.table_sessions.find(s=>s.id===ticket.sessionId);if(!session||session.status!=='open')fail('Esta cuenta ya fue cobrada o cerrada. No se puede eliminar su consumo.');
    const ids=new Set(ticket.items.map(i=>i.id));for(const line of state.docs.session_items)if(line.session_id===session.id&&ids.has(line.id)){Object.assign(line,{status:'cancelled',updated_by_user_id:user.id});allianceOrderVersion(state,'session_items',line.id);}
    ticket.status='cancelled';AllianceReconcileSession(state,session.id,user);return copy(ticket);
  }
  if(action==='order_submit'){
    const table=tables.find(t=>t.id===p.tableId&&t.is_active!==false);
    if(!table)fail('Elige una mesa disponible en esta sucursal.');
    if(requests.some(r=>r.id===p.id))fail('Esta comanda ya existe.');
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(p.id)||!p.items?.length||p.items.length>50||String(p.notes||'').length>500)fail('Completa la mesa y los productos de la comanda.');
    const items=p.items.map(line=>{
      const item=state.docs.menu_items.find(i=>i.id===line.productId&&i.is_available!==false);
      if(!item)fail('Un producto ya no está disponible. Revisa la comanda.');
      if(!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>10000||String(line.notes||'').length>300)fail('Revisa la cantidad y observaciones del producto.');
      if(line.unitPrice!==item.price)fail('El precio cambió. Actualiza y revisa la comanda antes de enviarla.');
      return {productId:item.id,name:item.name,quantity:line.quantity,unitPrice:item.price,notes:String(line.notes||'')};
    });
    const request={id:p.id,table_id:p.tableId,request_type:'order',status:'pending',created_at:now,actor_user_id:user.id,actor_name:user.full_name,order:{items,notes:String(p.notes||''),total:items.reduce((n,i)=>n+Math.round(i.quantity*i.unitPrice*100)/100,0)},message:'Comanda enviada por '+user.full_name};
    requests.push(request);globalThis.AllianceMaterialsEngine?.guard(state);allianceOrderVersion(state,'service_requests',request.id);return copy(request);
  }
  const request=requests.find(r=>r.id===p.requestId&&r.request_type==='order');
  if(!request)fail('La comanda no está disponible.');
  if(request.status!=='pending'){
    if(action==='order_accept'&&request.status==='acknowledged'){if(request.session_id!==(p.expectedSessionId||request.id))fail('La comanda ya se agregó a otra cuenta. Revisa el registro para conservar los consumos correctos.');return copy(request);}if(action==='order_reject'&&request.status==='resolved')return copy(request);
    fail('Otro usuario ya atendió esta comanda. Actualiza Inicio.');
  }
  if(action==='order_accept'){
    const table=tables.find(t=>t.id===request.table_id&&t.is_active!==false);if(!table)fail('La mesa ya no está disponible.');
    const open=state.docs.table_sessions.filter(s=>s.table_id===request.table_id&&s.status==='open');
    if(open.length>1||(open[0]?.id||request.currentSessionId||null)!==(p.expectedSessionId||null))fail('La cuenta de esta mesa cambió en otro equipo. Actualiza y revisa la comanda.');
    let session=open[0];if(!session){session={id:request.currentSessionId||request.id,table_id:request.table_id,status:'open',opened_at:now,created_at:now,created_by_user_id:user.id,assigned_waiter_id:request.actor_user_id,assigned_waiter:{id:request.actor_user_id,full_name:request.actor_name}};state.docs.table_sessions.push(session);allianceOrderVersion(state,'table_sessions',session.id);}
    const lines=request.order.items.map((i,index)=>({id:'order-'+request.id+'-'+index,session_id:session.id,menu_item_id:i.productId,item_name:i.name,quantity:i.quantity,unit_price:i.unitPrice,notes:i.notes,status:'pending',created_at:now,created_by_user_id:request.actor_user_id,created_by_user:{id:request.actor_user_id,full_name:request.actor_name},accepted_by_user_id:user.id,order_id:request.id}));
    state.docs.session_items.push(...lines);for(const line of lines)allianceOrderVersion(state,'session_items',line.id);
    state.operations.tickets.push({id:request.id,orderId:request.id,sessionId:session.id,table:table.table_name,status:'preparing',items:lines.map(i=>({id:i.id,name:i.item_name,quantity:i.quantity,notes:i.notes})),notes:request.order.notes,sentById:request.actor_user_id,sentBy:request.actor_name,actorId:user.id,actorName:user.full_name,at:now,updatedAt:now,updatedBy:user.full_name,updatedById:user.id});
    Object.assign(request,{session_id:session.id,ticket_id:request.id,status:'acknowledged',acknowledged_at:now,acknowledged_by_user_id:user.id,accepted_by_name:user.full_name});
  }else if(action==='order_reject')Object.assign(request,{status:'resolved',resolved_at:now,resolved_by_user_id:user.id,resolved_by_name:user.full_name});
  else fail('Acción no disponible.');
  allianceOrderVersion(state,'service_requests',request.id);return copy(request);
};
