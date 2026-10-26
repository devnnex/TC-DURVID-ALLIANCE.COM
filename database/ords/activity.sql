CREATE OR REPLACE PACKAGE alliance_activity AUTHID DEFINER AS
  PROCEDURE client_context(p_device VARCHAR2 DEFAULT NULL,p_at VARCHAR2 DEFAULT NULL);
  FUNCTION occurred_at RETURN VARCHAR2;
  PROCEDURE record_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_section VARCHAR2,p_action VARCHAR2,p_summary VARCHAR2,p_entity VARCHAR2 DEFAULT NULL);
  PROCEDURE pos_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T);
  PROCEDURE costing_changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_before CLOB,p_model JSON_OBJECT_T);
  FUNCTION visit(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION feed(p_user VARCHAR2,p_business VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_activity AS
  client_device VARCHAR2(80);client_date TIMESTAMP WITH TIME ZONE;
  FUNCTION occurred_at RETURN VARCHAR2 IS BEGIN RETURN TO_CHAR(NVL(client_date,SYSTIMESTAMP) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');END;
  PROCEDURE client_context(p_device VARCHAR2 DEFAULT NULL,p_at VARCHAR2 DEFAULT NULL) IS BEGIN
    client_device:=NULL;client_date:=NULL;
    IF p_device IS NOT NULL THEN IF LENGTH(p_device)>80 OR NOT REGEXP_LIKE(p_device,'^[a-zA-Z0-9_-]+$') THEN alliance_security.fail(400,'INVALID_INPUT','Identificador de equipo invalido.');END IF;client_device:=p_device;END IF;
    IF p_at IS NOT NULL THEN BEGIN client_date:=FROM_TZ(TO_TIMESTAMP(p_at,'FXYYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del equipo.');END;IF client_date>SYSTIMESTAMP+INTERVAL '1' DAY OR client_date<SYSTIMESTAMP-INTERVAL '180' DAY THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del equipo antes de sincronizar.');END IF;END IF;
  END;
  PROCEDURE record_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_section VARCHAR2,p_action VARCHAR2,p_summary VARCHAR2,p_entity VARCHAR2 DEFAULT NULL) IS actor_value VARCHAR2(160):='Cliente de mesa';
  BEGIN
    IF p_user IS NOT NULL THEN SELECT full_name INTO actor_value FROM users WHERE business_id=p_business AND id=p_user;END IF;
    INSERT INTO alliance_activity_events(id,business_id,location_id,actor_user_id,actor_name,section_code,action_code,summary,entity_id,device_id,client_created_at)
      VALUES(alliance_security.new_id,p_business,p_location,p_user,actor_value,SUBSTR(p_section,1,40),SUBSTR(p_action,1,80),SUBSTR(p_summary,1,240),SUBSTR(p_entity,1,160),client_device,client_date);
  END;
  PROCEDURE costing_changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_before CLOB,p_model JSON_OBJECT_T) IS
    old_model JSON_OBJECT_T:=JSON_OBJECT_T();old_rows JSON_ARRAY_T;new_rows JSON_ARRAY_T;old_row JSON_OBJECT_T;new_row JSON_OBJECT_T;matched JSON_OBJECT_T;old_lookup JSON_OBJECT_T;new_lookup JSON_OBJECT_T;
    keys_value JSON_ARRAY_T:=JSON_ARRAY_T('["ingredients","recipes","expenses","channels"]');key_value VARCHAR2(40);label_value VARCHAR2(50);count_value NUMBER:=0;
    PROCEDURE changed_row(p_row JSON_OBJECT_T,p_verb VARCHAR2) IS
    BEGIN record_event(p_user,p_business,p_location,'costing','costing_save',p_verb||' '||label_value||': '||p_row.get_string('name'),p_row.get_string('id'));count_value:=count_value+1;END;
  BEGIN
    IF p_before IS NOT NULL THEN old_model:=JSON_OBJECT_T.parse(p_before).get_object('model');END IF;
    FOR k IN 0..keys_value.get_size-1 LOOP
      key_value:=keys_value.get_string(k);label_value:=CASE key_value WHEN 'ingredients' THEN 'un ingrediente' WHEN 'recipes' THEN 'una receta' WHEN 'expenses' THEN 'un gasto' ELSE 'un canal de venta' END;
      new_rows:=p_model.get_array(key_value);old_rows:=old_model.get_array(key_value);IF old_rows IS NULL THEN old_rows:=JSON_ARRAY_T();END IF;old_lookup:=JSON_OBJECT_T();new_lookup:=JSON_OBJECT_T();
      FOR i IN 0..old_rows.get_size-1 LOOP old_row:=TREAT(old_rows.get(i) AS JSON_OBJECT_T);old_lookup.put(old_row.get_string('id'),old_row);END LOOP;
      FOR i IN 0..new_rows.get_size-1 LOOP new_row:=TREAT(new_rows.get(i) AS JSON_OBJECT_T);new_lookup.put(new_row.get_string('id'),new_row);END LOOP;
      FOR i IN 0..new_rows.get_size-1 LOOP new_row:=TREAT(new_rows.get(i) AS JSON_OBJECT_T);matched:=old_lookup.get_object(new_row.get_string('id'));
        IF matched IS NULL THEN changed_row(new_row,'Agregó');ELSIF DBMS_LOB.COMPARE(new_row.to_clob,matched.to_clob)<>0 THEN changed_row(new_row,'Editó');END IF;
      END LOOP;
      FOR i IN 0..old_rows.get_size-1 LOOP old_row:=TREAT(old_rows.get(i) AS JSON_OBJECT_T);matched:=new_lookup.get_object(old_row.get_string('id'));IF matched IS NULL THEN changed_row(old_row,'Eliminó');END IF;END LOOP;
    END LOOP;
    IF NOT old_model.has('settings') OR DBMS_LOB.COMPARE(old_model.get_object('settings').to_clob,p_model.get_object('settings').to_clob)<>0 THEN record_event(p_user,p_business,p_location,'costing','costing_save','Actualizó capacidad e impuestos del costeo');count_value:=count_value+1;END IF;
    IF count_value=0 THEN record_event(p_user,p_business,p_location,'costing','costing_save','Confirmó los datos del costeo');END IF;
  END;
  PROCEDURE pos_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) IS
    section_value VARCHAR2(40):='service';summary_value VARCHAR2(240);entity_value VARCHAR2(160);table_value VARCHAR2(80);verb_value VARCHAR2(30);o JSON_OBJECT_T;e JSON_ELEMENT_T;
  BEGIN
    IF p_action IN('broadcast','costing_save') THEN RETURN;END IF;
    IF p_action LIKE 'costing_%' THEN
      section_value:='costing';summary_value:=CASE p_action WHEN 'costing_save' THEN 'Actualizó ingredientes, recetas o gastos del costeo' WHEN 'costing_approve' THEN 'Guardó un producto listo para vender' ELSE 'Retiró un producto del historial de costeo' END;
      entity_value:=p_payload.get_string('recipeId');
    ELSIF p_action='query' THEN
      table_value:=p_payload.get_string('table');section_value:=CASE table_value WHEN 'menu_items' THEN 'inventory' WHEN 'menu_categories' THEN 'inventory' WHEN 'restaurant_tables' THEN 'menu' WHEN 'business_settings' THEN 'brand' WHEN 'table_sessions' THEN 'accounts' ELSE 'service' END;
      verb_value:=CASE p_payload.get_string('op') WHEN 'insert' THEN 'Agregó' WHEN 'delete' THEN 'Eliminó' WHEN 'update' THEN 'Editó' ELSE 'Guardó' END;
      summary_value:=verb_value||' '||CASE table_value WHEN 'menu_items' THEN 'productos' WHEN 'menu_categories' THEN 'categorías' WHEN 'restaurant_tables' THEN 'mesas o puntos de atención' WHEN 'business_settings' THEN 'la configuración de la sucursal' WHEN 'table_sessions' THEN 'una cuenta de atención' WHEN 'session_items' THEN 'productos de una cuenta' WHEN 'service_requests' THEN 'solicitudes de atención' ELSE 'registros de atención' END;
      e:=p_payload.get('values');IF e IS NOT NULL AND e.is_object THEN o:=TREAT(e AS JSON_OBJECT_T);entity_value:=o.get_string('id');IF o.get_string('name') IS NOT NULL THEN summary_value:=SUBSTR(summary_value||': '||o.get_string('name'),1,240);END IF;END IF;
    ELSIF p_action IN('record_sale','edit_sale','delete_sale','clear_income') THEN
      section_value:='income';summary_value:=CASE p_action WHEN 'record_sale' THEN 'Registró una venta' WHEN 'edit_sale' THEN 'Editó una venta' WHEN 'delete_sale' THEN 'Eliminó una venta' ELSE 'Eliminó el registro de ventas' END;entity_value:=p_payload.get_string('saleId');
    ELSIF p_action LIKE '%inventory%' OR p_action LIKE '%stock%' THEN
      section_value:=CASE WHEN p_action IN('update_inventory_movement_cost','clear_inventory_movements') THEN 'movements' ELSE 'inventory' END;
      summary_value:=CASE p_action WHEN 'upsert_inventory' THEN 'Guardó un producto de inventario' WHEN 'delete_inventory' THEN 'Eliminó un producto de inventario' WHEN 'clear_inventory' THEN 'Eliminó los productos de inventario' WHEN 'clear_inventory_movements' THEN 'Eliminó el registro de movimientos' WHEN 'update_inventory_movement_cost' THEN 'Editó el costo de un movimiento' ELSE 'Registró un ajuste de existencias' END;entity_value:=p_payload.get_string('productId');
    ELSE
      summary_value:=CASE p_action WHEN 'acknowledgeServiceRequests' THEN 'Atendió solicitudes de clientes' WHEN 'resolveBill' THEN 'Resolvió una solicitud de cuenta' WHEN 'sendChatMessage' THEN 'Envió un mensaje de atención' WHEN 'closeChatSession' THEN 'Cerró una conversación de atención' ELSE 'Registró una solicitud de atención' END;
      entity_value:=NVL(p_payload.get_string('p_session_id'),p_payload.get_string('session_id'));
    END IF;
    record_event(p_user,p_business,p_location,section_value,p_action,summary_value,entity_value);
  END;
  FUNCTION visit(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    section_value VARCHAR2(40);permission_value VARCHAR2(80);n NUMBER;
  BEGIN
    alliance_security.keys_only(p_body,'section,device_id,client_created_at');client_context(p_body.get_string('device_id'),p_body.get_string('client_created_at'));section_value:=alliance_security.text_value(p_body,'section',40);
    permission_value:=CASE section_value WHEN 'dashboard' THEN 'home.read' WHEN 'service' THEN 'service.read' WHEN 'accounts' THEN 'accounts.read' WHEN 'tips' THEN 'sales.read' WHEN 'inventory' THEN 'inventory.read' WHEN 'costing' THEN 'inventory.read' WHEN 'movements' THEN 'movements.read' WHEN 'income' THEN 'sales.read' WHEN 'assistant' THEN 'assistant.read' WHEN 'menu' THEN 'tables.manage' WHEN 'brand' THEN 'brand.manage' WHEN 'users' THEN 'administration.manage' WHEN 'activity' THEN 'administration.manage' WHEN 'supplies' THEN 'supplies.read' WHEN 'kitchen' THEN 'kitchen.read' WHEN 'customers' THEN 'customers.read' WHEN 'cash' THEN 'cash.read' END;
    IF permission_value IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Sección no disponible.');END IF;
    IF section_value IN('users','activity') THEN IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe puede entrar al centro operativo.');END IF;
    ELSE alliance_security.require_location(p_user,p_business,p_location,permission_value);END IF;
    IF p_location IS NOT NULL THEN SELECT COUNT(*) INTO n FROM locations WHERE business_id=p_business AND id=p_location AND active=1;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible.');END IF;END IF;
    -- Visits are debounced server-side. Ordinary reads and polling produce no events.
    SELECT COUNT(*) INTO n FROM alliance_activity_events WHERE business_id=p_business AND actor_user_id=p_user AND NVL(location_id,'-')=NVL(p_location,'-') AND section_code=section_value AND action_code='VIEW' AND NVL(client_created_at,created_at) BETWEEN NVL(client_date,SYSTIMESTAMP)-INTERVAL '30' SECOND AND NVL(client_date,SYSTIMESTAMP)+INTERVAL '30' SECOND;
    IF n=0 THEN record_event(p_user,p_business,p_location,section_value,'VIEW','Consultó esta sección');END IF;
    RETURN JSON_OBJECT_T('{"ok":true}');
  END;
  FUNCTION feed(p_user VARCHAR2,p_business VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;branch_value VARCHAR2(36);actor_value VARCHAR2(36);section_value VARCHAR2(40);kind_value VARCHAR2(10);offset_value NUMBER;day_value NUMBER;n NUMBER:=0;
  BEGIN
    IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe puede consultar el seguimiento del equipo.');END IF;
    alliance_security.keys_only(p_body,'location_id,actor_user_id,section,kind,offset,days');
    branch_value:=p_body.get_string('location_id');actor_value:=p_body.get_string('actor_user_id');section_value:=p_body.get_string('section');kind_value:=p_body.get_string('kind');offset_value:=NVL(p_body.get_number('offset'),0);day_value:=NVL(p_body.get_number('days'),30);
    IF offset_value<0 OR offset_value<>TRUNC(offset_value) OR offset_value>100000 OR day_value NOT IN(1,7,30,90) OR NVL(kind_value,'all') NOT IN('all','views','changes') THEN alliance_security.fail(400,'INVALID_INPUT','Filtro no válido.');END IF;
    FOR x IN(SELECT e.*,l.name location_name FROM alliance_activity_events e LEFT JOIN locations l ON l.business_id=e.business_id AND l.id=e.location_id
      WHERE e.business_id=p_business AND (branch_value IS NULL OR e.location_id=branch_value) AND (actor_value IS NULL OR e.actor_user_id=actor_value) AND (section_value IS NULL OR e.section_code=section_value)
      AND (kind_value IS NULL OR kind_value='all' OR (kind_value='views' AND e.action_code='VIEW') OR (kind_value='changes' AND e.action_code<>'VIEW'))
      AND e.created_at>=SYSTIMESTAMP-NUMTODSINTERVAL(day_value,'DAY') ORDER BY e.created_at DESC,e.id DESC OFFSET offset_value ROWS FETCH NEXT 51 ROWS ONLY) LOOP
      n:=n+1;IF n<=50 THEN o:=JSON_OBJECT_T();o.put('id',x.id);o.put('actorId',x.actor_user_id);o.put('actorName',x.actor_name);o.put('locationId',x.location_id);o.put('locationName',NVL(x.location_name,'Centro operativo'));o.put('section',x.section_code);o.put('action',x.action_code);o.put('summary',x.summary);o.put('entityId',x.entity_id);o.put('deviceId',x.device_id);IF x.client_created_at IS NOT NULL THEN o.put('occurredAt',TO_CHAR(x.client_created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));END IF;o.put('at',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));a.append(o);END IF;
    END LOOP;r.put('items',a);r.put('hasMore',n>50);RETURN r;
  END;
END;
/
