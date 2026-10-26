CREATE OR REPLACE PACKAGE alliance_pos AUTHID DEFINER AS
  PROCEDURE initialize(p_business VARCHAR2,p_location VARCHAR2);
  FUNCTION dispatch(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION public_dispatch(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_pos AS
  FUNCTION events(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T,p_public_table VARCHAR2 DEFAULT NULL) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();event_object JSON_OBJECT_T;data_object JSON_OBJECT_T;session_object JSON_OBJECT_T;channel_value VARCHAR2(100):=p_payload.get_string('channel');table_value VARCHAR2(80);session_value VARCHAR2(80);event_name VARCHAR2(30);id_value VARCHAR2(80);data_text CLOB;
  BEGIN
    IF p_public_table IS NOT NULL THEN table_value:=p_public_table;IF channel_value<>'table:'||table_value THEN alliance_security.fail(403,'TABLE_ACCESS','Canal de otra mesa.');END IF;
    ELSE alliance_security.require_location(p_user,p_business,p_location,'service.read');
      IF channel_value<>'admin' THEN table_value:=SUBSTR(channel_value,7);IF SUBSTR(channel_value,1,6)<>'table:' OR alliance_pos_store.document(p_business,p_location,'restaurant_tables',table_value) IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Canal no disponible.');END IF;END IF;
    END IF;
    IF p_action='broadcast' THEN
      event_name:=p_payload.get_string('event');IF event_name NOT IN('typing','chat-refresh','admin-presence','chat-closed','refresh') OR event_name IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Evento invalido.');END IF;
      data_object:=p_payload.get_object('payload');IF data_object IS NULL THEN data_object:=JSON_OBJECT_T();END IF;data_text:=data_object.to_clob;IF DBMS_LOB.GETLENGTH(data_text)>2000 THEN alliance_security.fail(400,'INVALID_INPUT','Evento demasiado grande.');END IF;
      IF p_public_table IS NOT NULL THEN
        IF event_name NOT IN('typing','chat-refresh') THEN alliance_security.fail(403,'TABLE_ACCESS','Evento reservado al personal.');END IF;data_object.put('role','client');
      ELSE alliance_security.require_location(p_user,p_business,p_location,'service.write');data_object.put('role','staff');END IF;
      session_value:=data_object.get_string('sessionId');IF table_value IS NOT NULL THEN session_object:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);IF session_object IS NULL OR session_object.get_string('table_id')<>table_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible para este evento.');END IF;END IF;
      alliance_pos_store.lock_scope(p_business,p_location);event_object:=JSON_OBJECT_T();event_object.put('id',alliance_security.new_id);event_object.put('channel',channel_value);event_object.put('event',event_name);event_object.put('payload',data_object);event_object.put('sender',NVL(p_user,'client:'||table_value));event_object.put('created_at',alliance_pos_store.stamp);
      id_value:=alliance_security.hash_text(channel_value||':'||event_name||':'||NVL(p_user,'client')||':'||session_value);alliance_pos_store.put_document(p_business,p_location,'realtime',id_value,event_object);r.put('ok',TRUE);RETURN r;
    END IF;
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='realtime' AND JSON_VALUE(data_json,'$.channel')=channel_value ORDER BY JSON_VALUE(data_json,'$.created_at')) LOOP a.append(JSON_OBJECT_T(x.data_json));END LOOP;r.put('events',a);RETURN r;
  END;
  PROCEDURE initialize(p_business VARCHAR2,p_location VARCHAR2) IS o JSON_OBJECT_T;n NUMBER;name_value VARCHAR2(160);color_value VARCHAR2(7);id_value VARCHAR2(36);code_value VARCHAR2(64);
  BEGIN
    alliance_pos_store.lock_scope(p_business,p_location);
    SELECT name,color INTO name_value,color_value FROM locations WHERE business_id=p_business AND id=p_location;
    o:=alliance_pos_store.document(p_business,p_location,'business_settings','primary');IF o IS NULL THEN
      o:=JSON_OBJECT_T();o.put('id','primary');o.put('is_primary',TRUE);o.put('business_name',name_value);o.put('subtitle','Panel operativo');o.put('accent_color',color_value);o.put('currency','COP');o.put('tips_enabled',FALSE);o.put('tip_percentage',10);alliance_pos_store.put_document(p_business,p_location,'business_settings','primary',o);
    END IF;
    SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='configuration' AND id='initialized';
    IF n=0 THEN
      FOR i IN 1..24 LOOP id_value:=alliance_security.new_id;code_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));o:=JSON_OBJECT_T();o.put('id',id_value);o.put('table_number',i);o.put('table_name','M'||TO_CHAR(i));o.put('qr_code',code_value);o.put('is_active',TRUE);o.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'restaurant_tables',id_value,o);END LOOP;
      FOR i IN 1..12 LOOP id_value:=alliance_security.new_id;o:=JSON_OBJECT_T();o.put('id',id_value);o.put('table_number',24+i);o.put('table_name',CASE WHEN i<=6 THEN 'Terraza '||TO_CHAR(i) ELSE 'Matera '||TO_CHAR(i-6) END);o.put('qr_code',CASE WHEN i<=6 THEN 'interno-bar-' ELSE 'interno-planter-' END||id_value);o.put('is_active',TRUE);o.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'restaurant_tables',id_value,o);END LOOP;
      o:=JSON_OBJECT_T('{"initialized":true}');alliance_pos_store.put_document(p_business,p_location,'configuration','initialized',o);
    END IF;
  END;
  FUNCTION snapshot(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T;filtered JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;
  BEGIN
    a:=alliance_pos_store.list_documents(p_business,p_location,'table_sessions');FOR i IN 0..a.get_size-1 LOOP o:=TREAT(a.get(i) AS JSON_OBJECT_T);IF o.get_string('status')='open' THEN filtered.append(o);END IF;END LOOP;r.put('sessions',filtered);
    a:=alliance_pos_store.list_documents(p_business,p_location,'service_requests');filtered:=JSON_ARRAY_T();FOR i IN 0..a.get_size-1 LOOP o:=TREAT(a.get(i) AS JSON_OBJECT_T);IF o.get_string('status') IN('pending','acknowledged') THEN filtered.append(o);END IF;END LOOP;r.put('requests',filtered);RETURN r;
  END;
  FUNCTION dispatch(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    action_value VARCHAR2(50):=p_body.get_string('action');payload JSON_OBJECT_T:=p_body.get_object('payload');r JSON_OBJECT_T:=JSON_OBJECT_T();q JSON_OBJECT_T;value_json JSON_OBJECT_T;arr JSON_ARRAY_T;out_json JSON_ARRAY_T;row_json JSON_OBJECT_T;filters JSON_ARRAY_T;f JSON_OBJECT_T;
    job_id VARCHAR2(160):=p_body.get_string('operation_id');digest VARCHAR2(64);saved_hash VARCHAR2(64);saved_user VARCHAR2(36);saved_value CLOB;save_value CLOB;id_value VARCHAR2(80);table_value VARCHAR2(80);code_value VARCHAR2(64);n NUMBER;permission_value VARCHAR2(32767);is_write BOOLEAN:=FALSE;
  BEGIN
    alliance_security.keys_only(p_body,'action,payload,operation_id,device_id,client_created_at');IF payload IS NULL THEN payload:=JSON_OBJECT_T();END IF;
    alliance_activity.client_context(p_body.get_string('device_id'),p_body.get_string('client_created_at'));
    -- Base scope check does not require a particular operational section.
    value_json:=alliance_security.context_for(p_user);q:=value_json.get_object('permissions');IF p_location IS NULL OR NOT q.has(p_location) THEN alliance_security.fail(403,'FORBIDDEN','No tienes acceso a esta sucursal.');END IF;
    IF action_value='bootstrap' THEN
      initialize(p_business,p_location);r.put('business',alliance_pos_store.document(p_business,p_location,'business_settings','primary'));r.put('tables',alliance_pos_store.list_documents(p_business,p_location,'restaurant_tables'));r.put('categories',alliance_pos_store.list_documents(p_business,p_location,'menu_categories'));r.put('items',alliance_pos_store.list_documents(p_business,p_location,'menu_items'));arr:=JSON_ARRAY_T();FOR x IN(SELECT id FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='op_recipes') LOOP arr.append(x.id);END LOOP;r.put('preparedProductIds',arr);r.put('value',JSON_OBJECT_T(r.to_clob));RETURN r;
    END IF;
    is_write:=action_value NOT IN('getAdminSnapshot','query','get_inventory','get_inventory_movements','get_income_report','status','remote_bootstrap','listChatMessages','getClientSnapshot','getEvents','costing_load','costing_product_load','operations_snapshot','operations_device','orders_revision','customer_history');
    IF action_value='query' THEN is_write:=payload.get_string('op')<>'select';END IF;
    IF is_write THEN
      alliance_pos_store.lock_scope(p_business,p_location);
      IF job_id IS NOT NULL THEN
        IF LENGTH(job_id)>160 THEN alliance_security.fail(400,'INVALID_INPUT','Operacion invalida.');END IF;
        save_value:=p_body.to_clob;digest:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(save_value,DBMS_CRYPTO.HASH_SH256)));
        BEGIN SELECT fingerprint,actor_user_id,result_json INTO saved_hash,saved_user,saved_value FROM alliance_pos_receipts WHERE business_id=p_business AND location_id=p_location AND id=job_id;
          IF saved_hash<>digest OR saved_user<>p_user THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La operacion ya se uso con otros datos.');END IF;RETURN JSON_OBJECT_T(saved_value);
        EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;
      END IF;
    END IF;
    IF action_value IN('operations_snapshot','operations_apply','operations_device','customer_history') THEN r.put('value',alliance_operations_commands.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('orders_revision','order_submit','order_accept','order_reject','order_cancel') THEN r.put('value',alliance_orders.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('costing_load','costing_product_load','costing_save','costing_approve','costing_product_delete') THEN r.put('value',alliance_costing.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('broadcast','getEvents') THEN r.put('value',events(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value='query' THEN
      IF is_write THEN alliance_operations.guard_versions(p_business,p_location,payload);END IF;
      IF payload.has('values') AND payload.get('values').is_array THEN
        IF payload.get_string('op') NOT IN('insert','upsert') THEN alliance_security.fail(400,'INVALID_INPUT','Operacion por lote invalida.');END IF;
        arr:=payload.get_array('values');IF arr.get_size<1 OR arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Envia de 1 a 100 registros.');END IF;out_json:=JSON_ARRAY_T();
        FOR i IN 0..arr.get_size-1 LOOP q:=JSON_OBJECT_T(payload.to_clob);q.put('values',arr.get(i));q.put('single','single');value_json:=alliance_pos_store.query(p_user,p_business,p_location,q);out_json.append(value_json.get('value'));END LOOP;r.put('value',out_json);
      ELSE r:=alliance_pos_store.query(p_user,p_business,p_location,payload);END IF;
    ELSIF action_value='getAdminSnapshot' THEN
      -- Service and accounts are independently granted; only permitted arrays return.
      value_json:=alliance_security.context_for(p_user);arr:=value_json.get_object('permissions').get_array(p_location);permission_value:=',';
      FOR i IN 0..arr.get_size-1 LOOP permission_value:=permission_value||arr.get_string(i)||',';END LOOP;
      r:=snapshot(p_business,p_location);IF INSTR(permission_value,',service.read,')=0 OR (INSTR(permission_value,',kitchen.write,')>0 AND INSTR(permission_value,',service.write,')=0 AND INSTR(permission_value,',accounts.read,')=0) THEN out_json:=JSON_ARRAY_T();IF INSTR(permission_value,',kitchen.read,')>0 THEN arr:=r.get_array('requests');FOR i IN 0..arr.get_size-1 LOOP value_json:=TREAT(arr.get(i) AS JSON_OBJECT_T);IF value_json.get_string('request_type')='order' THEN out_json.append(value_json);END IF;END LOOP;END IF;r.put('requests',out_json);END IF;IF (INSTR(permission_value,',accounts.read,')=0 AND INSTR(permission_value,',service.read,')=0) OR (INSTR(permission_value,',kitchen.write,')>0 AND INSTR(permission_value,',service.write,')=0 AND INSTR(permission_value,',accounts.read,')=0) THEN r.put('sessions',JSON_ARRAY_T());END IF;q:=JSON_OBJECT_T();q.put('value',r);r:=q;
    ELSIF action_value IN('remote_bootstrap','get_inventory','status','upsert_inventory','sync_inventory','adjust_inventory','set_inventory_stock','delete_inventory','update_inventory_movement_cost','clear_inventory','clear_inventory_movements') THEN
      value_json:=alliance_pos_store.stock_action(p_user,p_business,p_location,CASE WHEN action_value='remote_bootstrap' THEN 'bootstrap' ELSE action_value END,payload);r.put('value',value_json);
    ELSIF action_value='customer_payment' THEN r.put('value',alliance_customer_payments.collect_payment(p_user,p_business,p_location,payload));
    ELSIF action_value IN('record_sale','edit_sale','delete_sale','clear_income','get_inventory_movements','get_income_report') THEN value_json:=alliance_pos_finance.run_action(p_user,p_business,p_location,action_value,payload);r.put('value',value_json);
    ELSIF action_value IN('createServiceRequest','createServiceRequestsBatch','acknowledgeServiceRequests','resolveBill') THEN
      alliance_security.require_location(p_user,p_business,p_location,'service.write');
      IF action_value='createServiceRequestsBatch' THEN arr:=payload.get_array('requests');ELSE arr:=JSON_ARRAY_T();arr.append(payload);END IF;out_json:=JSON_ARRAY_T();
      FOR i IN 0..arr.get_size-1 LOOP row_json:=TREAT(arr.get(i) AS JSON_OBJECT_T);q:=JSON_OBJECT_T();q.put('table','service_requests');q.put('single','single');q.put('filters',JSON_ARRAY_T());
        IF action_value IN('createServiceRequest','createServiceRequestsBatch') THEN
          value_json:=JSON_OBJECT_T();id_value:=row_json.get_string('request_id');IF id_value IS NULL THEN id_value:=row_json.get_string('id');END IF;value_json.put('id',id_value);value_json.put('table_id',row_json.get_string('table_id'));value_json.put('session_id',row_json.get_string('session_id'));value_json.put('request_type',row_json.get_string('request_type'));value_json.put('message',row_json.get_string('message'));q.put('op','insert');q.put('values',value_json);
        ELSE
          q.put('op','update');value_json:=JSON_OBJECT_T();filters:=JSON_ARRAY_T();f:=JSON_OBJECT_T();f.put('field','id');
          IF action_value='acknowledgeServiceRequests' THEN f.put('op','in');f.put('value',payload.get_array('ids'));value_json.put('status','acknowledged');value_json.put('acknowledged_by_user_id',p_user);value_json.put('acknowledged_at',alliance_pos_store.stamp);q.remove('single');
          ELSE f.put('op','eq');f.put('value',payload.get_string('request_id'));value_json.put('status','resolved');value_json.put('resolved_at',alliance_pos_store.stamp);END IF;filters.append(f);q.put('filters',filters);q.put('values',value_json);
        END IF;
        value_json:=alliance_pos_store.query(p_user,p_business,p_location,q);
        IF action_value='acknowledgeServiceRequests' THEN r:=value_json;EXIT;
        ELSIF action_value='createServiceRequestsBatch' THEN q:=JSON_OBJECT_T();q.put('request',value_json.get('value'));q.put('duplicate',FALSE);out_json.append(q);
        ELSE q:=JSON_OBJECT_T();q.put('request',value_json.get('value'));q.put('duplicate',FALSE);r.put('value',q);END IF;
      END LOOP;IF action_value='createServiceRequestsBatch' THEN value_json:=JSON_OBJECT_T();value_json.put('results',out_json);r.put('value',value_json);END IF;
    ELSIF action_value IN('listChatMessages','sendChatMessage','closeChatSession') THEN
      alliance_security.require_location(p_user,p_business,p_location,'service.read');id_value:=payload.get_string('p_session_id');value_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',id_value);IF value_json IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Cuenta no disponible.');END IF;
      IF action_value='sendChatMessage' THEN
        alliance_security.require_location(p_user,p_business,p_location,'service.write');q:=JSON_OBJECT_T();q.put('id',NVL(payload.get_string('p_message_id'),alliance_security.new_id));q.put('session_id',id_value);q.put('table_id',value_json.get_string('table_id'));q.put('sender_type','staff');q.put('sender_user_id',p_user);SELECT full_name INTO table_value FROM users WHERE id=p_user AND business_id=p_business;q.put('sender_name',table_value);q.put('body',alliance_security.text_value(payload,'p_body',600));q.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'chat_messages',q.get_string('id'),q);value_json:=JSON_OBJECT_T();value_json.put('message',q);
      ELSIF action_value='closeChatSession' THEN alliance_security.require_location(p_user,p_business,p_location,'service.write');DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value;value_json:=JSON_OBJECT_T('{"closed":true}');
      ELSE out_json:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP out_json.append(JSON_OBJECT_T(x.data_json));END LOOP;value_json:=JSON_OBJECT_T();value_json.put('messages',out_json);END IF;r.put('value',value_json);
    ELSE alliance_security.fail(404,'NOT_FOUND','Accion no disponible.');END IF;
    IF is_write AND action_value<>'operations_apply' THEN alliance_activity.pos_event(p_user,p_business,p_location,action_value,payload);END IF;
    IF is_write THEN alliance_pos_store.put_document(p_business,p_location,'op_reportsync','primary',JSON_OBJECT_T('{}'));END IF;
    IF is_write AND job_id IS NOT NULL THEN save_value:=r.to_clob;INSERT INTO alliance_pos_receipts(business_id,location_id,id,actor_user_id,fingerprint,result_json)VALUES(p_business,p_location,job_id,p_user,digest,save_value);END IF;RETURN r;
  END;
  FUNCTION public_dispatch(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();payload JSON_OBJECT_T:=p_body.get_object('payload');action_value VARCHAR2(50):=p_body.get_string('action');business_value VARCHAR2(36);location_value VARCHAR2(36);table_id_value VARCHAR2(80);table_json CLOB;table_object JSON_OBJECT_T;arr JSON_ARRAY_T;out_json JSON_ARRAY_T;row_json JSON_OBJECT_T;session_object JSON_OBJECT_T;id_value VARCHAR2(80);body_value VARCHAR2(600);business_slug_value VARCHAR2(80);branch_slug_value VARCHAR2(80);table_code_value VARCHAR2(64);request_object JSON_OBJECT_T;entry JSON_OBJECT_T;product_object JSON_OBJECT_T;duplicate BOOLEAN;
  BEGIN
    alliance_security.keys_only(p_body,'action,payload,business_slug,branch_slug,table_code');
    business_slug_value:=p_body.get_string('business_slug');branch_slug_value:=p_body.get_string('branch_slug');table_code_value:=p_body.get_string('table_code');
    IF action_value='bootstrap' AND table_code_value IS NULL THEN
      BEGIN SELECT l.business_id,l.id INTO business_value,location_value FROM businesses b JOIN locations l ON l.business_id=b.id WHERE b.slug=business_slug_value AND l.slug=branch_slug_value AND l.active=1;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Sucursal no disponible.');END;
      r.put('business',alliance_pos_store.document(business_value,location_value,'business_settings','primary'));r.put('tables',JSON_ARRAY_T());r.put('categories',alliance_pos_store.list_documents(business_value,location_value,'menu_categories'));r.put('items',alliance_pos_store.list_documents(business_value,location_value,'menu_items'));row_json:=JSON_OBJECT_T();row_json.put('value',r);RETURN row_json;
    END IF;
    BEGIN SELECT l.business_id,l.id,d.id,d.data_json INTO business_value,location_value,table_id_value,table_json FROM businesses b JOIN locations l ON l.business_id=b.id AND l.active=1 JOIN alliance_pos_documents d ON d.business_id=l.business_id AND d.location_id=l.id AND d.entity='restaurant_tables' WHERE b.slug=business_slug_value AND l.slug=branch_slug_value AND JSON_VALUE(d.data_json,'$.qr_code')=table_code_value AND JSON_VALUE(d.data_json,'$.is_active')='true';
    EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(403,'TABLE_ACCESS','Escanea el QR vigente de tu mesa.');END;
    table_object:=JSON_OBJECT_T(table_json);
    IF action_value IN('broadcast','getEvents') THEN r:=events(NULL,business_value,location_value,action_value,payload,table_id_value);
    ELSIF action_value='bootstrap' THEN r.put('business',alliance_pos_store.document(business_value,location_value,'business_settings','primary'));arr:=JSON_ARRAY_T();arr.append(table_object);r.put('tables',arr);r.put('categories',alliance_pos_store.list_documents(business_value,location_value,'menu_categories'));r.put('items',alliance_pos_store.list_documents(business_value,location_value,'menu_items'));
    ELSIF action_value IN('getClientTableState','getClientSnapshot') THEN
      alliance_pos_store.lock_scope(business_value,location_value);id_value:=NULL;
      FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=table_id_value AND JSON_VALUE(data_json,'$.status')='open') LOOP id_value:=x.id;session_object:=JSON_OBJECT_T(x.data_json);END LOOP;
      IF id_value IS NULL AND action_value='getClientTableState' THEN id_value:=alliance_security.new_id;session_object:=JSON_OBJECT_T();session_object.put('id',id_value);session_object.put('table_id',table_id_value);session_object.put('status','open');session_object.put('sale_channel','table');session_object.put('opened_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'table_sessions',id_value,session_object);alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_ACCOUNT_OPEN','Abrió una cuenta desde '||table_object.get_string('table_name'),id_value);END IF;
      IF session_object IS NULL THEN r.put_null('session');ELSE r.put('session',session_object);END IF;arr:=JSON_ARRAY_T();out_json:=JSON_ARRAY_T();
      FOR x IN(SELECT entity,data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity IN('session_items','service_requests') AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP IF x.entity='session_items' THEN arr.append(JSON_OBJECT_T(x.data_json));ELSE out_json.append(JSON_OBJECT_T(x.data_json));END IF;END LOOP;r.put('sessionItems',arr);r.put('requests',out_json);
    ELSE
      alliance_pos_store.lock_scope(business_value,location_value);
      id_value:=NVL(payload.get_string('p_session_id'),payload.get_string('session_id'));
      session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
      IF action_value IN('createServiceRequest','createServiceRequestsBatch') THEN
        IF action_value='createServiceRequestsBatch' THEN arr:=payload.get_array('requests');ELSE arr:=JSON_ARRAY_T();arr.append(payload);END IF;
        IF arr IS NULL OR arr.get_size>20 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiadas solicitudes.');END IF;out_json:=JSON_ARRAY_T();
        FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);id_value:=entry.get_string('session_id');session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
          IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','La cuenta no pertenece a tu mesa o esta cerrada.');END IF;
          IF entry.get_string('request_type') NOT IN('waiter','bill','other','chat','song') THEN alliance_security.fail(400,'INVALID_INPUT','Solicitud invalida.');END IF;
          request_object:=alliance_pos_store.document(business_value,location_value,'service_requests',entry.get_string('request_id'));duplicate:=request_object IS NOT NULL;
          IF NOT duplicate THEN request_object:=JSON_OBJECT_T();request_object.put('id',alliance_security.text_value(entry,'request_id',80));request_object.put('session_id',id_value);request_object.put('table_id',table_id_value);request_object.put('request_type',entry.get_string('request_type'));request_object.put('message',SUBSTR(entry.get_string('message'),1,600));request_object.put('status','pending');request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'service_requests',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'service','CLIENT_REQUEST','Solicitó atención en '||table_object.get_string('table_name'),request_object.get_string('id'));END IF;
          row_json:=JSON_OBJECT_T();row_json.put('request',request_object);row_json.put('duplicate',duplicate);out_json.append(row_json);
        END LOOP;IF action_value='createServiceRequestsBatch' THEN r.put('results',out_json);ELSE r:=TREAT(out_json.get(0) AS JSON_OBJECT_T);END IF;
      ELSIF action_value='resolveBill' THEN
        request_object:=alliance_pos_store.document(business_value,location_value,'service_requests',payload.get_string('request_id'));
        IF request_object IS NULL OR request_object.get_string('table_id')<>table_id_value OR request_object.get_string('request_type')<>'bill' THEN alliance_security.fail(403,'TABLE_ACCESS','Solicitud no disponible.');END IF;IF request_object.get_string('status')<>'resolved' THEN alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_BILL_RESOLVE','Resolvió una solicitud de cuenta en '||table_object.get_string('table_name'),request_object.get_string('id'));END IF;request_object.put('status','resolved');request_object.put('resolved_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'service_requests',request_object.get_string('id'),request_object);r.put('request',request_object);
      ELSIF action_value IN('sendChatMessage','listChatMessages') THEN
        IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible.');END IF;
        IF action_value='sendChatMessage' THEN request_object:=JSON_OBJECT_T();request_object.put('id',alliance_security.text_value(payload,'p_message_id',80));request_object.put('session_id',id_value);request_object.put('table_id',table_id_value);request_object.put('sender_type','client');request_object.put('sender_name','Cliente');request_object.put('body',alliance_security.text_value(payload,'p_body',600));request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'chat_messages',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'service','CLIENT_CHAT','Envió un mensaje desde '||table_object.get_string('table_name'),request_object.get_string('id'));r.put('message',request_object);
        ELSE arr:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP arr.append(JSON_OBJECT_T(x.data_json));END LOOP;r.put('messages',arr);END IF;
      ELSIF action_value='query' AND payload.get_string('table')='session_items' AND payload.get_string('op')='insert' THEN
        entry:=payload.get_object('values');id_value:=entry.get_string('session_id');session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
        IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible.');END IF;
        product_object:=alliance_pos_store.document(business_value,location_value,'menu_items',entry.get_string('menu_item_id'));
        IF product_object IS NULL OR NOT product_object.get_boolean('is_available') OR entry.get_number('quantity') IS NULL OR entry.get_number('quantity')<=0 OR entry.get_number('quantity')>100 THEN alliance_security.fail(400,'INVALID_INPUT','Producto no disponible o cantidad invalida.');END IF;
        request_object:=JSON_OBJECT_T();request_object.put('id',NVL(entry.get_string('id'),alliance_security.new_id));request_object.put('session_id',id_value);request_object.put('menu_item_id',product_object.get_string('id'));request_object.put('item_name',product_object.get_string('name'));request_object.put('unit_price',product_object.get_number('price'));request_object.put('quantity',entry.get_number('quantity'));request_object.put('status','pending');request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'session_items',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_ITEM_ADD','Agregó un producto a su cuenta: '||product_object.get_string('name'),request_object.get_string('id'));r:=request_object;
      ELSE alliance_security.fail(403,'TABLE_ACCESS','Operacion no autorizada para clientes.');END IF;
    END IF;
    row_json:=JSON_OBJECT_T();row_json.put('value',r);RETURN row_json;
  END;
END;
/
