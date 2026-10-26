CREATE OR REPLACE PACKAGE alliance_orders AUTHID DEFINER AS
  PROCEDURE touch(b VARCHAR2,l VARCHAR2);
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_orders AS
  PROCEDURE touch(b VARCHAR2,l VARCHAR2) IS row_value JSON_OBJECT_T;BEGIN row_value:=alliance_pos_store.document(b,l,'op_ordersync','primary');IF row_value IS NULL THEN row_value:=JSON_OBJECT_T('{"revision":0}');END IF;row_value.put('revision',row_value.get_number('revision')+1);alliance_pos_store.put_document(b,l,'op_ordersync','primary',row_value);END;
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T;tab JSON_OBJECT_T;product JSON_OBJECT_T;line JSON_OBJECT_T;item JSON_OBJECT_T;order_value JSON_OBJECT_T;session_value JSON_OBJECT_T;ticket JSON_OBJECT_T;sender JSON_OBJECT_T;
    items JSON_ARRAY_T;lines JSON_ARRAY_T:=JSON_ARRAY_T();ticket_lines JSON_ARRAY_T:=JSON_ARRAY_T();id_value VARCHAR2(80);session_id VARCHAR2(80);table_id_value VARCHAR2(80);line_id VARCHAR2(80);actor_name VARCHAR2(160);stamp VARCHAR2(30):=alliance_pos_store.stamp;
    context_value JSON_OBJECT_T;perms JSON_ARRAY_T;allowed BOOLEAN:=FALSE;quantity NUMBER;price NUMBER;total NUMBER:=0;n NUMBER;notes VARCHAR2(500);
  BEGIN
    IF a='orders_revision' THEN alliance_security.keys_only(p,'');context_value:=alliance_security.context_for(u);perms:=context_value.get_object('permissions').get_array(l);IF perms IS NOT NULL THEN FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i) IN('service.read','kitchen.read') THEN allowed:=TRUE;END IF;END LOOP;END IF;IF NOT allowed THEN alliance_security.fail(403,'FORBIDDEN','No puedes consultar comandas en esta sucursal.');END IF;r:=alliance_pos_store.document(b,l,'op_ordersync','primary');IF r IS NULL THEN r:=JSON_OBJECT_T('{"revision":0}');END IF;RETURN r;END IF;
    IF a='order_submit' THEN alliance_security.require_location(u,b,l,'service.write');ELSE context_value:=alliance_security.context_for(u);perms:=context_value.get_object('permissions').get_array(l);IF perms IS NOT NULL THEN FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i) IN('service.write','kitchen.write') THEN allowed:=TRUE;END IF;END LOOP;END IF;IF NOT allowed THEN alliance_security.fail(403,'FORBIDDEN','Tu usuario no puede atender comandas en esta sucursal.');END IF;END IF;alliance_pos_store.lock_scope(b,l);
    SELECT full_name INTO actor_name FROM users WHERE business_id=b AND id=u;
    IF a='order_cancel' THEN
      IF NOT alliance_security.location_owner(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede retirar comandas y sus consumos.');END IF;
      alliance_security.keys_only(p,'ticketId');id_value:=alliance_security.text_value(p,'ticketId',80);ticket:=alliance_pos_store.document(b,l,'op_tickets',id_value);IF ticket IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Comanda no disponible.');END IF;IF ticket.get_string('status')='cancelled' THEN RETURN ticket;END IF;
      session_id:=ticket.get_string('sessionId');session_value:=alliance_pos_store.document(b,l,'table_sessions',session_id);IF session_value IS NULL OR session_value.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta ya fue cobrada o cerrada.');END IF;
      items:=ticket.get_array('items');FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);line_id:=item.get_string('id');line:=alliance_pos_store.document(b,l,'session_items',line_id);IF line IS NOT NULL AND line.get_string('session_id')=session_id THEN line.put('status','cancelled');line.put('updated_by_user_id',u);alliance_pos_store.put_document(b,l,'session_items',line_id,line);END IF;END LOOP;
      ticket.put('status','cancelled');alliance_pos_store.put_document(b,l,'op_tickets',id_value,ticket);alliance_pos_store.reconcile_session(u,b,l,session_id);alliance_pos_store.audit(u,b,'ORDER_CANCEL',id_value,NULL,ticket.to_clob);alliance_activity.record_event(u,b,l,'service','ORDER_CANCEL','Retiró la comanda y sus consumos de la cuenta',id_value);RETURN ticket;
    END IF;
    IF a='order_submit' THEN
      alliance_security.keys_only(p,'id,tableId,items,notes');id_value:=alliance_security.text_value(p,'id',60,'^[a-zA-Z0-9_-]+$');
      IF alliance_pos_store.document(b,l,'service_requests',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_ORDER','Esta comanda ya existe.');END IF;
      tab:=alliance_pos_store.document(b,l,'restaurant_tables',p.get_string('tableId'));
      IF tab IS NULL OR NOT tab.get_boolean('is_active') THEN alliance_security.fail(400,'INVALID_TABLE','Elige una mesa disponible en esta sucursal.');END IF;
      items:=p.get_array('items');IF items IS NULL OR items.get_size<1 OR items.get_size>50 THEN alliance_security.fail(400,'INVALID_INPUT','Elige de 1 a 50 productos.');END IF;
      IF LENGTH(p.get_string('notes'))>500 THEN alliance_security.fail(400,'INVALID_INPUT','La observacion debe tener hasta 500 caracteres.');END IF;
      FOR i IN 0..items.get_size-1 LOOP
        line:=TREAT(items.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(line,'productId,quantity,notes,unitPrice');product:=alliance_pos_store.document(b,l,'menu_items',line.get_string('productId'));
        IF product IS NULL OR NOT product.get_boolean('is_available') THEN alliance_security.fail(409,'PRODUCT_UNAVAILABLE','Un producto ya no esta disponible. Revisa la comanda.');END IF;
        quantity:=alliance_operations.numeric_value(line,'quantity',0.000001,10000);price:=product.get_number('price');
        IF line.get_number('unitPrice') IS NULL OR line.get_number('unitPrice')<>price THEN alliance_security.fail(409,'PRICE_CHANGED','El precio cambio. Actualiza y revisa la comanda antes de enviarla.');END IF;
        IF LENGTH(line.get_string('notes'))>300 THEN alliance_security.fail(400,'INVALID_INPUT','La observacion del producto debe tener hasta 300 caracteres.');END IF;
        item:=JSON_OBJECT_T();item.put('productId',product.get_string('id'));item.put('name',product.get_string('name'));item.put('quantity',quantity);item.put('unitPrice',price);item.put('notes',line.get_string('notes'));lines.append(item);total:=total+ROUND(quantity*price,2);
      END LOOP;
      order_value:=JSON_OBJECT_T();order_value.put('items',lines);order_value.put('notes',p.get_string('notes'));order_value.put('total',total);
      r:=JSON_OBJECT_T();r.put('id',id_value);r.put('table_id',tab.get_string('id'));r.put('request_type','order');r.put('status','pending');r.put('created_at',stamp);r.put('actor_user_id',u);r.put('actor_name',actor_name);r.put('order',order_value);r.put('message','Comanda enviada por '||actor_name);
      alliance_materials.guard_open(b,l);alliance_pos_store.put_document(b,l,'service_requests',id_value,r);alliance_pos_store.audit(u,b,'ORDER_SUBMIT',id_value,NULL,r.to_clob);alliance_activity.record_event(u,b,l,'service','ORDER_SUBMIT','Envio una comanda a '||tab.get_string('table_name'),id_value);
    ELSIF a IN('order_accept','order_reject') THEN
      alliance_security.keys_only(p,CASE WHEN a='order_accept' THEN 'requestId,expectedSessionId' ELSE 'requestId' END);id_value:=alliance_security.text_value(p,'requestId',80);
      r:=alliance_pos_store.document(b,l,'service_requests',id_value);IF r IS NULL OR r.get_string('request_type')<>'order' THEN alliance_security.fail(404,'ORDER_MISSING','La comanda no esta disponible.');END IF;
      IF r.get_string('status')<>'pending' THEN
        IF a='order_accept' AND r.get_string('status')='acknowledged' THEN IF r.get_string('session_id')<>NVL(p.get_string('expectedSessionId'),id_value) THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La comanda ya se agrego a otra cuenta. Revisa el registro para conservar los consumos correctos.');END IF;RETURN r;END IF;IF a='order_reject' AND r.get_string('status')='resolved' THEN RETURN r;END IF;
        alliance_security.fail(409,'ORDER_CHANGED','Otro usuario ya atendio esta comanda. Actualiza Inicio.');
      END IF;
      tab:=alliance_pos_store.document(b,l,'restaurant_tables',r.get_string('table_id'));
      IF a='order_accept' THEN
        IF tab IS NULL OR NOT tab.get_boolean('is_active') THEN alliance_security.fail(409,'INVALID_TABLE','La mesa ya no esta disponible.');END IF;
        table_id_value:=r.get_string('table_id');session_id:=NULL;FOR x IN(SELECT id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=table_id_value AND JSON_VALUE(data_json,'$.status')='open') LOOP
          IF session_id IS NOT NULL THEN alliance_security.fail(409,'ACCOUNT_CHANGED','Hay mas de una cuenta abierta para esta mesa. Revisa sus cuentas.');END IF;session_id:=x.id;
        END LOOP;
        IF NVL(session_id,'-')<>NVL(p.get_string('expectedSessionId'),'-') THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta de esta mesa cambio en otro equipo. Actualiza y revisa la comanda.');END IF;
        IF session_id IS NULL THEN session_id:=id_value;session_value:=JSON_OBJECT_T();session_value.put('id',session_id);session_value.put('table_id',r.get_string('table_id'));session_value.put('status','open');session_value.put('opened_at',stamp);session_value.put('created_at',stamp);session_value.put('created_by_user_id',u);session_value.put('assigned_waiter_id',r.get_string('actor_user_id'));item:=JSON_OBJECT_T();item.put('id',r.get_string('actor_user_id'));item.put('full_name',r.get_string('actor_name'));session_value.put('assigned_waiter',item);alliance_pos_store.put_document(b,l,'table_sessions',session_id,session_value);END IF;
        sender:=JSON_OBJECT_T();sender.put('id',r.get_string('actor_user_id'));sender.put('full_name',r.get_string('actor_name'));
        items:=r.get_object('order').get_array('items');
        FOR i IN 0..items.get_size-1 LOOP
          line:=TREAT(items.get(i) AS JSON_OBJECT_T);line_id:='order-'||id_value||'-'||TO_CHAR(i);item:=JSON_OBJECT_T();item.put('id',line_id);item.put('session_id',session_id);item.put('menu_item_id',line.get_string('productId'));item.put('item_name',line.get_string('name'));item.put('quantity',line.get_number('quantity'));item.put('unit_price',line.get_number('unitPrice'));item.put('notes',line.get_string('notes'));item.put('status','pending');item.put('created_at',stamp);item.put('created_by_user_id',r.get_string('actor_user_id'));item.put('created_by_user',sender);item.put('accepted_by_user_id',u);item.put('order_id',id_value);alliance_pos_store.put_document(b,l,'session_items',line_id,item);
          item:=JSON_OBJECT_T();item.put('id',line_id);item.put('name',line.get_string('name'));item.put('quantity',line.get_number('quantity'));item.put('notes',line.get_string('notes'));ticket_lines.append(item);
        END LOOP;
        ticket:=JSON_OBJECT_T();ticket.put('id',id_value);ticket.put('orderId',id_value);ticket.put('sessionId',session_id);ticket.put('table',tab.get_string('table_name'));ticket.put('status','preparing');ticket.put('items',ticket_lines);ticket.put('notes',r.get_object('order').get_string('notes'));ticket.put('sentById',r.get_string('actor_user_id'));ticket.put('sentBy',r.get_string('actor_name'));ticket.put('updatedBy',actor_name);ticket.put('updatedById',u);ticket.put('updatedAt',stamp);alliance_operations.put_row(u,b,l,'tickets',id_value,ticket);
        r.put('session_id',session_id);r.put('ticket_id',id_value);r.put('status','acknowledged');r.put('acknowledged_at',stamp);r.put('acknowledged_by_user_id',u);r.put('accepted_by_name',actor_name);
      ELSE r.put('status','resolved');r.put('resolved_at',stamp);r.put('resolved_by_user_id',u);r.put('resolved_by_name',actor_name);END IF;
      alliance_pos_store.put_document(b,l,'service_requests',id_value,r);alliance_pos_store.audit(u,b,UPPER(a),id_value,NULL,r.to_clob);alliance_activity.record_event(u,b,l,'service',UPPER(a),CASE WHEN a='order_accept' THEN 'Acepto y agrego la comanda a la mesa' ELSE 'Rechazo la comanda sin agregar consumos' END,id_value);
    ELSE alliance_security.fail(404,'NOT_FOUND','Accion no disponible.');END IF;
    touch(b,l);RETURN r;
  END;
END;
/
