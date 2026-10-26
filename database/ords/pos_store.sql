CREATE OR REPLACE PACKAGE alliance_pos_store AUTHID DEFINER AS
  FUNCTION stamp RETURN VARCHAR2;
  FUNCTION report_revision(b VARCHAR2,l VARCHAR2) RETURN VARCHAR2;
  PROCEDURE lock_scope(p_business VARCHAR2,p_location VARCHAR2);
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_id VARCHAR2,p_before CLOB,p_after CLOB);
  FUNCTION document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE put_document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2,p_data JSON_OBJECT_T);
  FUNCTION list_documents(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2) RETURN JSON_ARRAY_T;
  PROCEDURE reconcile_session(u VARCHAR2,b VARCHAR2,l VARCHAR2,sid VARCHAR2);
  FUNCTION inventory(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION matches(p_row JSON_OBJECT_T,p_filters JSON_ARRAY_T) RETURN BOOLEAN;
  FUNCTION query(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  PROCEDURE movement(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_id VARCHAR2,p_product VARCHAR2,p_delta NUMBER,p_kind VARCHAR2,p_reference VARCHAR2,p_session VARCHAR2);
  FUNCTION stock_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_pos_store AS
  PROCEDURE reconcile_session(u VARCHAR2,b VARCHAR2,l VARCHAR2,sid VARCHAR2) IS
  account JSON_OBJECT_T;ticket JSON_OBJECT_T;line JSON_OBJECT_T;entry JSON_OBJECT_T;request JSON_OBJECT_T;sync_value JSON_OBJECT_T;items JSON_ARRAY_T;kept JSON_ARRAY_T;count_value NUMBER;actor VARCHAR2(160);
  BEGIN
  account:=document(b,l,'table_sessions',sid);IF account IS NULL THEN RETURN;END IF;
  SELECT full_name INTO actor FROM users WHERE business_id=b AND id=u;
  SELECT COUNT(*) INTO count_value FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=sid AND NVL(JSON_VALUE(data_json,'$.status'),'served')<>'cancelled';
  IF account.get_string('status')='open' AND count_value=0 THEN account.put('status','closed');account.put('closed_at',stamp);put_document(b,l,'table_sessions',sid,account);END IF;
  FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_tickets' AND JSON_VALUE(data_json,'$.sessionId')=sid) LOOP
    ticket:=JSON_OBJECT_T(x.data_json);items:=ticket.get_array('items');kept:=JSON_ARRAY_T();
    FOR i IN 0..items.get_size-1 LOOP entry:=TREAT(items.get(i) AS JSON_OBJECT_T);line:=document(b,l,'session_items',entry.get_string('id'));IF line IS NOT NULL AND line.get_string('session_id')=sid AND NVL(line.get_string('status'),'served')<>'cancelled' THEN entry.put('name',line.get_string('item_name'));entry.put('quantity',line.get_number('quantity'));entry.put('notes',line.get_string('notes'));kept.append(entry);END IF;END LOOP;
    ticket.put('items',kept);IF account.get_string('status')<>'open' OR kept.get_size=0 THEN ticket.put('status',CASE WHEN account.get_string('status') IN('closed','paid') AND kept.get_size>0 THEN 'delivered' ELSE 'cancelled' END);END IF;
    ticket.put('updatedAt',stamp);ticket.put('updatedById',u);ticket.put('updatedBy',actor);put_document(b,l,'op_tickets',x.id,ticket);
  END LOOP;
  IF account.get_string('status')<>'open' THEN
    FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='service_requests' AND JSON_VALUE(data_json,'$.session_id')=sid) LOOP request:=JSON_OBJECT_T(x.data_json);request.put('status','resolved');request.put('resolved_at',stamp);put_document(b,l,'service_requests',x.id,request);END LOOP;
  END IF;
  sync_value:=document(b,l,'op_ordersync','primary');IF sync_value IS NULL THEN sync_value:=JSON_OBJECT_T('{"revision":0}');END IF;sync_value.put('revision',sync_value.get_number('revision')+1);put_document(b,l,'op_ordersync','primary',sync_value);
  END;
  FUNCTION report_revision(b VARCHAR2,l VARCHAR2) RETURN VARCHAR2 IS n NUMBER;
  BEGIN SELECT NVL(MAX(version),0) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_reportsync' AND id='primary';RETURN 'oracle-'||TO_CHAR(n);END;
  FUNCTION stamp RETURN VARCHAR2 IS BEGIN RETURN TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');END;
  PROCEDURE lock_scope(p_business VARCHAR2,p_location VARCHAR2) IS n VARCHAR2(36);
  BEGIN SELECT id INTO n FROM locations WHERE business_id=p_business AND id=p_location AND active=1 FOR UPDATE;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible.');END;
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_id VARCHAR2,p_before CLOB,p_after CLOB) IS id_value VARCHAR2(36):=alliance_security.new_id;
  BEGIN INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json)VALUES(id_value,p_business,p_user,p_action,SUBSTR(p_id,1,36),p_before,p_after);END;
  FUNCTION document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2) RETURN JSON_OBJECT_T IS t CLOB;
  BEGIN SELECT data_json INTO t FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=p_entity AND id=p_id;RETURN JSON_OBJECT_T(t);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;END;
  PROCEDURE put_document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2,p_data JSON_OBJECT_T) IS t CLOB:=p_data.to_clob;
  BEGIN
  MERGE INTO alliance_pos_documents d USING(SELECT p_business b,p_location l,p_entity e,p_id i FROM dual)s
  ON(d.business_id=s.b AND d.location_id=s.l AND d.entity=s.e AND d.id=s.i)
  WHEN MATCHED THEN UPDATE SET data_json=t,version=d.version+1
  WHEN NOT MATCHED THEN INSERT(business_id,location_id,entity,id,data_json)VALUES(s.b,s.l,s.e,s.i,t);
  END;
  FUNCTION list_documents(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2) RETURN JSON_ARRAY_T IS a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;other JSON_OBJECT_T;items JSON_ARRAY_T;session_value VARCHAR2(80);
  BEGIN
  FOR r IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=p_entity ORDER BY created_at,id) LOOP
    o:=JSON_OBJECT_T(r.data_json);
    IF p_entity IN('table_sessions','service_requests') THEN other:=document(p_business,p_location,'restaurant_tables',o.get_string('table_id'));IF other IS NULL THEN o.put_null('restaurant_tables');ELSE o.put('restaurant_tables',other);END IF;END IF;
    IF p_entity='table_sessions' THEN
      session_value:=o.get_string('id');items:=JSON_ARRAY_T();FOR i IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=session_value ORDER BY created_at,id) LOOP items.append(JSON_OBJECT_T(i.data_json));END LOOP;o.put('session_items',items);
    ELSIF p_entity='menu_items' THEN other:=document(p_business,p_location,'menu_categories',o.get_string('category_id'));IF other IS NOT NULL THEN o.put('menu_categories',other);END IF;END IF;
    a.append(o);
  END LOOP;RETURN a;
  END;
  FUNCTION inventory(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_ARRAY_T IS a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;item JSON_OBJECT_T;
  BEGIN
  FOR r IN(SELECT s.*,p.name,p.price_minor,p.active,c.name category FROM alliance_pos_stock s JOIN products p ON p.id=s.product_id AND p.business_id=s.business_id JOIN product_categories c ON c.id=p.category_id AND c.business_id=p.business_id WHERE s.business_id=p_business AND s.location_id=p_location AND EXISTS(SELECT 1 FROM alliance_pos_documents d WHERE d.business_id=s.business_id AND d.location_id=s.location_id AND d.entity='menu_items' AND d.id=s.product_id) ORDER BY p.name) LOOP
    o:=JSON_OBJECT_T();o.put('productId',r.product_id);o.put('version',r.version);o.put('code',r.code);o.put('name',r.name);o.put('category',r.category);o.put('unit',r.unit_name);o.put('costPrice',r.cost_minor/100);o.put('stock',r.stock);o.put('minStock',r.min_stock);o.put('isAvailable',r.active=1);o.put('salePrice',r.price_minor/100);o.put('updatedAt',TO_CHAR(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));a.append(o);
  END LOOP;RETURN a;
  END;
  FUNCTION matches(p_row JSON_OBJECT_T,p_filters JSON_ARRAY_T) RETURN BOOLEAN IS f JSON_OBJECT_T;key_value VARCHAR2(80);mode_value VARCHAR2(12);actual JSON_ELEMENT_T;expected JSON_ELEMENT_T;xs JSON_ARRAY_T;hit BOOLEAN;
  BEGIN
  IF p_filters IS NULL THEN RETURN TRUE;END IF;IF p_filters.get_size>20 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados filtros.');END IF;
  FOR i IN 0..p_filters.get_size-1 LOOP f:=TREAT(p_filters.get(i) AS JSON_OBJECT_T);key_value:=f.get_string('field');mode_value:=f.get_string('op');
    IF NOT REGEXP_LIKE(key_value,'^[a-z_]{1,60}$') OR mode_value NOT IN('eq','neq','in','is') THEN alliance_security.fail(400,'INVALID_INPUT','Filtro no permitido.');END IF;
    actual:=p_row.get(key_value);expected:=f.get('value');
    IF mode_value='in' THEN xs:=f.get_array('value');hit:=FALSE;FOR j IN 0..xs.get_size-1 LOOP IF actual IS NOT NULL AND actual.to_string=xs.get(j).to_string THEN hit:=TRUE;END IF;END LOOP;IF NOT hit THEN RETURN FALSE;END IF;
    ELSIF mode_value='neq' THEN IF actual IS NOT NULL AND expected IS NOT NULL AND actual.to_string=expected.to_string THEN RETURN FALSE;END IF;
    ELSE IF actual IS NULL THEN IF expected IS NOT NULL AND NOT expected.is_null THEN RETURN FALSE;END IF;ELSIF expected IS NULL OR actual.to_string<>expected.to_string THEN RETURN FALSE;END IF;END IF;
  END LOOP;RETURN TRUE;
  END;
  FUNCTION query(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  entity_value VARCHAR2(32):=p_body.get_string('table');op VARCHAR2(12):=p_body.get_string('op');permission_value VARCHAR2(80);rows_json JSON_ARRAY_T;out_json JSON_ARRAY_T:=JSON_ARRAY_T();filters JSON_ARRAY_T:=p_body.get_array('filters');patch JSON_OBJECT_T;row_json JSON_OBJECT_T;old_json JSON_OBJECT_T;parent JSON_OBJECT_T;keys_json JSON_KEY_LIST;
  id_value VARCHAR2(80);category_value VARCHAR2(36);name_value VARCHAR2(160);price_value NUMBER;active_value NUMBER;data_value CLOB;n NUMBER;search_value VARCHAR2(80);result_json JSON_OBJECT_T:=JSON_OBJECT_T();
  BEGIN
  alliance_security.keys_only(p_body,'table,op,filters,values,single,order,limit,expected_versions');
  IF entity_value NOT IN('business_settings','restaurant_tables','menu_categories','menu_items','table_sessions','session_items','service_requests') OR op NOT IN('select','insert','update','upsert','delete') OR entity_value IS NULL OR op IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Operacion no permitida.');END IF;
  IF op='select' THEN
    permission_value:=CASE entity_value WHEN 'table_sessions' THEN 'accounts.read' WHEN 'session_items' THEN 'accounts.read' WHEN 'service_requests' THEN 'service.read' ELSE 'products.read' END;
  ELSE
    permission_value:=CASE entity_value WHEN 'business_settings' THEN 'brand.manage' WHEN 'restaurant_tables' THEN 'tables.manage' WHEN 'menu_categories' THEN 'products.write' WHEN 'menu_items' THEN 'products.write' ELSE 'service.write' END;
    IF op='delete' AND entity_value IN('table_sessions','session_items') THEN alliance_security.fail(409,'AUDIT_REQUIRED','Cancela el consumo para conservar su historial.');END IF;
    lock_scope(p_business,p_location);
  END IF;
  alliance_security.require_location(p_user,p_business,p_location,permission_value);
  rows_json:=list_documents(p_business,p_location,entity_value);
  IF op='insert' OR op='upsert' THEN
    patch:=p_body.get_object('values');IF patch IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Faltan datos.');END IF;
    id_value:=patch.get_string('id');IF entity_value='business_settings' THEN id_value:='primary';END IF;
    IF id_value IS NULL THEN id_value:=alliance_security.new_id;END IF;
    old_json:=document(p_business,p_location,entity_value,id_value);
    IF old_json IS NOT NULL AND op='insert' THEN result_json.put('value',old_json);RETURN result_json;END IF;
    IF old_json IS NULL THEN old_json:=JSON_OBJECT_T();old_json.put('id',id_value);old_json.put('created_at',stamp);END IF;rows_json:=JSON_ARRAY_T();rows_json.append(old_json);
  END IF;
  IF op<>'select' AND op<>'delete' THEN patch:=p_body.get_object('values');
    IF entity_value='business_settings' THEN alliance_security.keys_only(patch,'id,is_primary,business_name,subtitle,accent_color,currency,logo_url,cover_url,background_url,whatsapp,phone,address,tips_enabled,tip_percentage,business_type,persons_enabled');IF patch.has('persons_enabled') THEN n:=alliance_security.flag(patch,'persons_enabled');END IF;
    ELSIF entity_value='restaurant_tables' THEN alliance_security.keys_only(patch,'id,table_number,table_name,qr_code,qr_image_url,is_active');
    ELSIF entity_value='menu_categories' THEN alliance_security.keys_only(patch,'id,name,sort_order,is_active');
    ELSIF entity_value='menu_items' THEN alliance_security.keys_only(patch,'id,category_id,name,description,price,image_url,is_available,sort_order');
    ELSIF entity_value='table_sessions' THEN alliance_security.keys_only(patch,'id,table_id,status,sale_channel,assigned_waiter_id,payer_name,discount,tax,service_fee,discount_amount,tax_amount,service_fee_amount,closed_at,payment_method,paid_at,subtotal,total');
    ELSIF entity_value='session_items' THEN alliance_security.keys_only(patch,'id,session_id,table_id,menu_item_id,item_name,quantity,unit_price,status,notes,created_by_user_id,updated_by_user_id');
    ELSE alliance_security.keys_only(patch,'id,table_id,session_id,request_type,message,status,acknowledged_by_user_id,acknowledged_at,resolved_at');END IF;
  END IF;
  FOR i IN 0..rows_json.get_size-1 LOOP row_json:=TREAT(rows_json.get(i) AS JSON_OBJECT_T);
    IF op IN('insert','upsert') OR matches(row_json,filters) THEN
      id_value:=row_json.get_string('id');
      IF entity_value='service_requests' AND row_json.get_string('request_type')='order' AND op<>'select' THEN alliance_security.fail(409,'ORDER_WORKFLOW','Acepta o rechaza esta comanda desde su detalle en Inicio.');END IF;
      IF op='delete' THEN
        IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede eliminar registros.');END IF;
        IF entity_value='restaurant_tables' THEN SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=id_value AND JSON_VALUE(data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','La mesa tiene una cuenta abierta.');END IF;END IF;
        DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=entity_value AND id=id_value;
      ELSIF op<>'select' THEN
        old_json:=JSON_OBJECT_T(row_json.to_clob);keys_json:=patch.get_keys;
        FOR j IN 1..keys_json.COUNT LOOP IF keys_json(j)<>'id' THEN row_json.put(keys_json(j),patch.get(keys_json(j)));END IF;END LOOP;
        row_json.remove('restaurant_tables');row_json.remove('session_items');row_json.remove('menu_categories');row_json.put('updated_at',stamp);
        IF entity_value IN('menu_categories','menu_items') THEN name_value:=alliance_security.text_value(row_json,'name',160);END IF;
        IF entity_value='menu_categories' AND NOT row_json.has('is_active') THEN row_json.put('is_active',TRUE);END IF;
        IF entity_value='menu_items' AND NOT row_json.has('is_available') THEN row_json.put('is_available',TRUE);END IF;
        IF entity_value='restaurant_tables' THEN IF row_json.get_number('table_number')<1 OR row_json.get_number('table_number')>10000 THEN alliance_security.fail(400,'INVALID_INPUT','Numero de mesa invalido.');END IF;IF NOT row_json.has('is_active') THEN row_json.put('is_active',TRUE);END IF;IF NOT row_json.has('qr_code') THEN row_json.put('qr_code',LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32))));END IF;END IF;
        IF entity_value='business_settings' THEN row_json.put('is_primary',TRUE);row_json.put('currency','COP');END IF;
        IF entity_value='menu_items' THEN
          IF NOT REGEXP_LIKE(id_value,'^[0-9a-fA-F-]{36}$') THEN alliance_security.fail(400,'INVALID_INPUT','ID de producto invalido.');END IF;
          price_value:=ROUND(row_json.get_number('price')*100);IF price_value IS NULL OR price_value<0 OR price_value>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','Precio invalido.');END IF;
          category_value:=row_json.get_string('category_id');parent:=document(p_business,p_location,'menu_categories',category_value);
          IF parent IS NULL THEN category_value:=NULL;SELECT MIN(id) INTO category_value FROM product_categories WHERE business_id=p_business AND name='Otros';IF category_value IS NULL THEN category_value:=alliance_security.new_id;INSERT INTO product_categories(id,business_id,name)VALUES(category_value,p_business,'Otros');END IF;
          ELSE SELECT COUNT(*) INTO n FROM product_categories WHERE business_id=p_business AND id=category_value;IF n=0 THEN name_value:=parent.get_string('name');SELECT MIN(id) INTO search_value FROM product_categories WHERE business_id=p_business AND name=name_value;IF search_value IS NOT NULL THEN category_value:=search_value;ELSE INSERT INTO product_categories(id,business_id,name)VALUES(category_value,p_business,name_value);END IF;END IF;END IF;
          name_value:=row_json.get_string('name');active_value:=1;IF row_json.has('is_available') AND NOT row_json.get_boolean('is_available') THEN active_value:=0;END IF;
          SELECT COUNT(*) INTO n FROM products WHERE id=id_value AND business_id=p_business;
          IF n=0 THEN INSERT INTO products(id,business_id,sku,name,category_id,price_minor,kind,unit_id,active)VALUES(id_value,p_business,SUBSTR(id_value,1,64),name_value,category_value,price_value,'SIMPLE','u',active_value);
          ELSE UPDATE products SET name=name_value,price_minor=price_value,active=active_value,version=version+1,updated_at=SYSTIMESTAMP WHERE id=id_value AND business_id=p_business;END IF;
          row_json.put('price',price_value/100);IF NOT row_json.has('is_available') THEN row_json.put('is_available',TRUE);END IF;
        ELSIF entity_value='table_sessions' THEN
          IF NOT row_json.has('status') THEN row_json.put('status','open');END IF;
          IF NOT row_json.has('sale_channel') THEN row_json.put('sale_channel','table');END IF;
          IF row_json.get_string('table_id') IS NOT NULL THEN parent:=document(p_business,p_location,'restaurant_tables',row_json.get_string('table_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Mesa no disponible.');END IF;END IF;
          IF row_json.get_string('status') NOT IN('open','paid','closed','cancelled') THEN alliance_security.fail(400,'INVALID_INPUT','Estado de cuenta invalido.');END IF;
          IF row_json.get_string('status')='open' THEN
            search_value:=row_json.get_string('table_id');SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='table_sessions' AND id<>id_value AND JSON_VALUE(data_json,'$.table_id')=search_value AND JSON_VALUE(data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','La mesa ya tiene una cuenta abierta.');END IF;
          ELSE
            alliance_security.require_location(p_user,p_business,p_location,'sales.write');
            IF row_json.get_string('status') IN('paid','closed') THEN SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=id_value AND NVL(JSON_VALUE(data_json,'$.status'),'served')<>'cancelled';IF n>0 THEN alliance_security.fail(409,'PAYMENT_REQUIRED','Registra el pago para cerrar una cuenta con consumos.');END IF;
            ELSIF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede cancelar una cuenta.');END IF;
          END IF;
          IF NOT row_json.has('opened_at') THEN row_json.put('opened_at',stamp);END IF;
        ELSIF entity_value='session_items' THEN
          IF row_json.get_string('status')='cancelled' AND NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede retirar consumos.');END IF;
          parent:=document(p_business,p_location,'table_sessions',row_json.get_string('session_id'));IF parent IS NULL OR parent.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;
          IF row_json.get_number('quantity') IS NULL OR row_json.get_number('quantity')<=0 OR row_json.get_number('quantity')>10000 OR row_json.get_number('unit_price') IS NULL OR row_json.get_number('unit_price')<0 THEN alliance_security.fail(400,'INVALID_INPUT','Cantidad o precio invalido.');END IF;
          IF row_json.get_string('menu_item_id') IS NOT NULL THEN parent:=document(p_business,p_location,'menu_items',row_json.get_string('menu_item_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Producto no disponible.');END IF;END IF;
          IF NOT row_json.has('status') THEN row_json.put('status','confirmed');END IF;row_json.put('updated_by_user_id',p_user);IF op='insert' THEN row_json.put('created_by_user_id',p_user);END IF;
        ELSIF entity_value='service_requests' THEN
          parent:=document(p_business,p_location,'restaurant_tables',row_json.get_string('table_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Mesa no disponible.');END IF;
          IF NOT row_json.has('status') THEN row_json.put('status','pending');END IF;
          IF row_json.get_string('status') NOT IN('pending','acknowledged','resolved') THEN alliance_security.fail(400,'INVALID_INPUT','Estado de solicitud invalido.');END IF;
        END IF;
        put_document(p_business,p_location,entity_value,id_value,row_json);audit(p_user,p_business,'POS_'||UPPER(entity_value),id_value,old_json.to_clob,row_json.to_clob);
      END IF;
      out_json.append(row_json);
    END IF;
  END LOOP;
  IF op='update' AND (entity_value='session_items' OR (entity_value='table_sessions' AND patch.get_string('status') IN('closed','paid'))) THEN FOR i IN 0..out_json.get_size-1 LOOP row_json:=TREAT(out_json.get(i) AS JSON_OBJECT_T);reconcile_session(p_user,p_business,p_location,CASE WHEN entity_value='session_items' THEN row_json.get_string('session_id') ELSE row_json.get_string('id') END);END LOOP;END IF;
  IF op<>'select' AND entity_value IN('session_items','table_sessions') THEN alliance_materials.guard_open(p_business,p_location);END IF;
  IF p_body.get_string('single') IN('single','maybeSingle') THEN
    IF out_json.get_size=0 THEN result_json.put_null('value');ELSIF out_json.get_size=1 THEN result_json.put('value',out_json.get(0));ELSE alliance_security.fail(409,'MULTIPLE_ROWS','El filtro devolvio varios registros.');END IF;
  ELSE result_json.put('value',out_json);END IF;RETURN result_json;
  END;
  PROCEDURE movement(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_id VARCHAR2,p_product VARCHAR2,p_delta NUMBER,p_kind VARCHAR2,p_reference VARCHAR2,p_session VARCHAR2) IS before_value NUMBER;cost_value NUMBER;n NUMBER;negative_value NUMBER;
  BEGIN
  SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND id=p_id;IF n>0 THEN RETURN;END IF;
  BEGIN SELECT stock,cost_minor,allow_negative INTO before_value,cost_value,negative_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=p_product FOR UPDATE;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Configura el inventario del producto.');END;
  IF p_delta IS NULL OR (before_value+p_delta<0 AND negative_value=0) THEN alliance_security.fail(409,'INSUFFICIENT_STOCK','No hay existencias suficientes.');END IF;
  UPDATE alliance_pos_stock SET stock=before_value+p_delta,version=version+1,updated_at=SYSTIMESTAMP WHERE business_id=p_business AND location_id=p_location AND product_id=p_product;
  INSERT INTO alliance_pos_movements(business_id,location_id,id,product_id,actor_user_id,delta,stock_before,stock_after,cost_minor,kind,reference,session_id,allow_negative)VALUES(p_business,p_location,p_id,p_product,p_user,p_delta,before_value,before_value+p_delta,cost_value,p_kind,SUBSTR(p_reference,1,160),p_session,negative_value);
  END;
  FUNCTION stock_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  r JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T;item JSON_OBJECT_T;row_json JSON_OBJECT_T;id_value VARCHAR2(36);event_value VARCHAR2(160);code_value VARCHAR2(64);unit_value VARCHAR2(80);cost_value NUMBER;min_value NUMBER;stock_value NUMBER;before_value NUMBER;n NUMBER;cost_current NUMBER;entity VARCHAR2(36);search_value VARCHAR2(160);ctx JSON_OBJECT_T;pa JSON_ARRAY_T;can_read_cost BOOLEAN:=FALSE;
  BEGIN
  IF p_action IN('get_inventory','status','bootstrap') THEN alliance_security.require_location(p_user,p_business,p_location,'products.read');ctx:=alliance_security.context_for(p_user);pa:=ctx.get_object('permissions').get_array(p_location);FOR i IN 0..pa.get_size-1 LOOP IF pa.get_string(i)='inventory.read' THEN can_read_cost:=TRUE;END IF;END LOOP;items:=inventory(p_business,p_location);IF NOT can_read_cost THEN FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);item.put('costPrice',0);items.put(i,item,TRUE);END LOOP;END IF;r.put('items',items);r.put('everInitialized',TRUE);r.put('timezone','America/Bogota');r.put('syncedAt',stamp);r.put('historyRevision',report_revision(p_business,p_location));r.put('movementRevision',report_revision(p_business,p_location));r.put('ok',TRUE);RETURN r;END IF;
  lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'inventory.write');
  IF p_action IN('upsert_inventory','sync_inventory') THEN
    IF p_action='upsert_inventory' THEN items:=JSON_ARRAY_T();items.append(p_payload.get_object('item'));ELSE items:=p_payload.get_array('items');END IF;
    IF items.get_size>500 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados productos.');END IF;
    FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);id_value:=item.get_string('productId');row_json:=document(p_business,p_location,'menu_items',id_value);IF row_json IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Producto no disponible en esta sucursal.');END IF;
      cost_value:=ROUND(item.get_number('costPrice')*100);min_value:=item.get_number('minStock');stock_value:=item.get_number('stock');code_value:=SUBSTR(item.get_string('code'),1,64);unit_value:=SUBSTR(item.get_string('unit'),1,80);
      IF cost_value IS NULL OR cost_value<0 OR min_value IS NULL OR min_value<0 OR stock_value IS NULL OR stock_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Costo o existencias invalidos.');END IF;
      SELECT COUNT(*) INTO n FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      IF n=0 THEN INSERT INTO alliance_pos_stock(business_id,location_id,product_id,code,unit_name,cost_minor,min_stock)VALUES(p_business,p_location,id_value,code_value,unit_value,cost_value,min_value);ctx:=document(p_business,p_location,'op_settings','primary');IF ctx IS NOT NULL AND ctx.get_boolean('allowNegative') THEN UPDATE alliance_pos_stock SET allow_negative=1 WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;END IF;END IF;
      SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      IF item.has('expectedStockVersion') THEN SELECT version INTO cost_current FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;IF cost_current<>item.get_number('expectedStockVersion') THEN alliance_security.fail(409,'STOCK_CONFLICT','Las existencias cambiaron en otro equipo. Revisa el registro pendiente.');END IF;END IF;
      UPDATE alliance_pos_stock SET cost_minor=cost_value,min_stock=min_value,code=code_value,unit_name=unit_value,updated_at=SYSTIMESTAMP WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      event_value:=NVL(item.get_string('movementEventId'),alliance_security.new_id);movement(p_user,p_business,p_location,event_value,id_value,stock_value-before_value,CASE WHEN n=0 THEN 'NUEVO_PRODUCTO' WHEN stock_value>=before_value THEN 'ENTRADA_EDICION' ELSE 'SALIDA_EDICION' END,'FICHA_PRODUCTO',NULL);
    END LOOP;
  ELSIF p_action='adjust_inventory' THEN
    item:=p_payload.get_object('adjustment');id_value:=item.get_string('productId');event_value:=alliance_security.text_value(item,'eventId',160);
    IF item.get_string('reversesEventId') IS NOT NULL THEN search_value:=item.get_string('reversesEventId');SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND id=search_value;IF n=0 THEN r.put('skippedReversal',TRUE);ELSE movement(p_user,p_business,p_location,event_value,id_value,item.get_number('delta'),NVL(item.get_string('movementType'),'AJUSTE'),item.get_string('reference'),item.get_string('sessionId'));END IF;
    ELSE movement(p_user,p_business,p_location,event_value,id_value,item.get_number('delta'),NVL(item.get_string('movementType'),'AJUSTE'),item.get_string('reference'),item.get_string('sessionId'));END IF;
  ELSIF p_action='set_inventory_stock' THEN id_value:=p_payload.get_string('productId');SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;stock_value:=p_payload.get_number('stock');IF stock_value IS NULL OR stock_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Existencia invalida.');END IF;movement(p_user,p_business,p_location,alliance_security.new_id,id_value,stock_value-before_value,'AJUSTE_INVENTARIO','AJUSTE',NULL);
  ELSIF p_action IN('clear_inventory','clear_inventory_movements') THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede reiniciar el historial.');END IF;
    IF p_action='clear_inventory_movements' THEN row_json:=document(p_business,p_location,'configuration','history');IF row_json IS NULL THEN row_json:=JSON_OBJECT_T();END IF;row_json.put('movements_cutoff',stamp);put_document(p_business,p_location,'configuration','history',row_json);r.put('movements',JSON_ARRAY_T());
    ELSE
      SELECT COUNT(*) INTO n FROM alliance_pos_documents d JOIN alliance_pos_documents s ON s.business_id=d.business_id AND s.location_id=d.location_id AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.session_id') WHERE d.business_id=p_business AND d.location_id=p_location AND d.entity='session_items' AND NVL(JSON_VALUE(d.data_json,'$.status'),'served')<>'cancelled' AND JSON_VALUE(s.data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','Cobra las cuentas abiertas antes de vaciar el inventario.');END IF;
      FOR x IN(SELECT product_id,stock FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location) LOOP movement(p_user,p_business,p_location,alliance_security.new_id,x.product_id,-x.stock,'RETIRO_CATALOGO','REINICIO_INVENTARIO',NULL);END LOOP;
      DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='menu_items';
    END IF;r.put('cleared',TRUE);
  ELSIF p_action='delete_inventory' THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede retirar productos.');END IF;
    id_value:=p_payload.get_string('productId');SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;movement(p_user,p_business,p_location,alliance_security.new_id,id_value,-before_value,'RETIRO_CATALOGO','RETIRO_PRODUCTO',NULL);
  ELSIF p_action='update_inventory_movement_cost' THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede corregir costos historicos.');END IF;
    cost_value:=ROUND(p_payload.get_number('unitCost')*100);IF cost_value IS NULL OR cost_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Costo invalido.');END IF;
    search_value:=p_payload.get_string('movementId');UPDATE alliance_pos_movements SET cost_minor=cost_value WHERE business_id=p_business AND location_id=p_location AND id=search_value AND delta>0;IF SQL%ROWCOUNT=0 THEN alliance_security.fail(404,'NOT_FOUND','Compra no disponible.');END IF;
  ELSE alliance_security.fail(409,'AUDIT_REQUIRED','El historial se conserva para auditoria. Usa ajustes o anulaciones individuales.');END IF;
  audit(p_user,p_business,'POS_STOCK_'||UPPER(p_action),NVL(id_value,p_location),NULL,p_payload.to_clob);
  r.put('items',inventory(p_business,p_location));r.put('ok',TRUE);RETURN r;
  END;
END;
/
