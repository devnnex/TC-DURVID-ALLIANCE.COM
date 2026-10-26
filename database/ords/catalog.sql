CREATE OR REPLACE PACKAGE alliance_catalog AUTHID DEFINER AS
  FUNCTION product_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION bootstrap(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE register_device(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T);
  FUNCTION apply_operation(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_operation JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_cursor NUMBER) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_catalog AS
  FUNCTION product_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();x products%ROWTYPE;category_value VARCHAR2(80);timestamp_value VARCHAR2(40);
  BEGIN
    SELECT * INTO x FROM products WHERE id=p_id AND business_id=p_business;SELECT name INTO category_value FROM product_categories WHERE id=x.category_id AND business_id=p_business;
    timestamp_value:=TO_CHAR(SYS_EXTRACT_UTC(x.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');
    r.put('id',x.id);r.put('business_id',x.business_id);r.put('name',x.name);r.put('sku',x.sku);r.put('category',category_value);r.put('price_minor',TO_CHAR(x.price_minor,'FM999999999999999999'));
    r.put('kind',x.kind);r.put('unit_id',x.unit_id);r.put('active',x.active=1);r.put('version',x.version);r.put('updated_at',timestamp_value);RETURN r;
  END;
  FUNCTION bootstrap(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();products_json JSON_ARRAY_T:=JSON_ARRAY_T();ingredients_json JSON_ARRAY_T:=JSON_ARRAY_T();units_json JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;
    ctx JSON_OBJECT_T;ls JSON_ARRAY_T;l JSON_OBJECT_T;loc locations%ROWTYPE;inventory_allowed BOOLEAN:=TRUE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');
    SELECT * INTO loc FROM locations WHERE id=p_location AND business_id=p_business;
    l:=JSON_OBJECT_T();l.put('id',loc.id);l.put('business_id',loc.business_id);l.put('slug',loc.slug);l.put('name',loc.name);l.put('color',loc.color);l.put('active',loc.active=1);
    FOR p IN (SELECT id FROM products WHERE business_id=p_business ORDER BY name) LOOP products_json.append(product_json(p.id,p_business));END LOOP;
    BEGIN alliance_security.require_location(p_user,p_business,p_location,'inventory.read');EXCEPTION WHEN OTHERS THEN IF SQLCODE=-20001 THEN inventory_allowed:=FALSE;ELSE RAISE;END IF;END;
    IF inventory_allowed THEN FOR i IN (SELECT * FROM ingredients WHERE business_id=p_business ORDER BY name) LOOP entry:=JSON_OBJECT_T();entry.put('id',i.id);entry.put('name',i.name);entry.put('unit_id',i.unit_id);entry.put('cost_minor',TO_CHAR(i.cost_minor,'FM999999999999999999'));ingredients_json.append(entry);END LOOP;END IF;
    FOR u IN (SELECT * FROM units_of_measure ORDER BY id) LOOP entry:=JSON_OBJECT_T();entry.put('id',u.id);entry.put('name',u.name);entry.put('dimension',u.dimension);entry.put('factor',TO_CHAR(u.factor,'TM9','NLS_NUMERIC_CHARACTERS=''.,'''));units_json.append(entry);END LOOP;
    r.put('location',l);r.put('products',products_json);r.put('ingredients',ingredients_json);r.put('units',units_json);r.put('cursor',loc.change_cursor);RETURN r;
  END;
  PROCEDURE register_device(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) IS id_value VARCHAR2(36);name_value VARCHAR2(120);d devices%ROWTYPE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');alliance_security.keys_only(p_body,'id,name');
    id_value:=alliance_security.text_value(p_body,'id',36,'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');name_value:=alliance_security.text_value(p_body,'name',120);
    BEGIN
      SELECT * INTO d FROM devices WHERE id=id_value FOR UPDATE;
      IF d.business_id<>p_business OR d.location_id<>p_location OR d.user_id<>p_user THEN alliance_security.fail(403,'FORBIDDEN','Este dispositivo pertenece a otro usuario o sucursal.');END IF;
      UPDATE devices SET name=name_value,last_seen=SYSTIMESTAMP WHERE id=id_value;
    EXCEPTION WHEN NO_DATA_FOUND THEN INSERT INTO devices(id,business_id,location_id,user_id,name,app_version) VALUES(id_value,p_business,p_location,p_user,name_value,'0.3.0');END;
  END;
  FUNCTION apply_operation(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_operation JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    ack JSON_OBJECT_T:=JSON_OBJECT_T();body JSON_OBJECT_T;operation_value VARCHAR2(36);key_value VARCHAR2(36);device_value VARCHAR2(36);entity_value VARCHAR2(36);hash_value VARCHAR2(64);previous_hash VARCHAR2(64);previous_operation VARCHAR2(36);saved_result CLOB;
    before_json CLOB;product_value JSON_OBJECT_T;product_clob CLOB;operation_clob CLOB;ack_clob CLOB;n NUMBER;version_value NUMBER:=0;base_value NUMBER;status_value VARCHAR2(24):='SYNCED';category_value VARCHAR2(36);name_value VARCHAR2(160);sku_value VARCHAR2(64);category_name VARCHAR2(80);price_value VARCHAR2(18);kind_value VARCHAR2(12);unit_value VARCHAR2(12);active_value NUMBER;created_value VARCHAR2(40);created_time TIMESTAMP WITH TIME ZONE;dummy VARCHAR2(36);
    FUNCTION ident(k VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN alliance_security.text_value(p_operation,k,36,'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');END;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_security.require_location(p_user,p_business,p_location,'products.read');
    alliance_security.keys_only(p_operation,'operation_id,idempotency_key,device_id,business_id,location_id,entity_type,entity_id,operation_type,payload,base_version,client_created_at');
    operation_value:=ident('operation_id');key_value:=ident('idempotency_key');device_value:=ident('device_id');entity_value:=ident('entity_id');
    IF ident('business_id')<>p_business OR ident('location_id')<>p_location THEN alliance_security.fail(403,'FORBIDDEN','La operacion pertenece a otro negocio o sucursal.');END IF;
    IF alliance_security.text_value(p_operation,'entity_type',7)<>'PRODUCT' OR alliance_security.text_value(p_operation,'operation_type',14)<>'PRODUCT_UPSERT' THEN alliance_security.fail(400,'INVALID_INPUT','Operacion no disponible.');END IF;
    base_value:=p_operation.get_number('base_version');IF base_value IS NULL OR base_value<0 OR base_value<>TRUNC(base_value) OR base_value>9999999998 THEN alliance_security.fail(400,'INVALID_INPUT','Version invalida.');END IF;
    body:=p_operation.get_object('payload');alliance_security.keys_only(body,'name,sku,category,price_minor,kind,unit_id,active');
    name_value:=alliance_security.text_value(body,'name',160);sku_value:=alliance_security.text_value(body,'sku',64);category_name:=alliance_security.text_value(body,'category',80);
    price_value:=alliance_security.text_value(body,'price_minor',18,'^(0|[1-9][0-9]{0,17})$');kind_value:=alliance_security.text_value(body,'kind',12,'^(SIMPLE|PREPARED|WEIGHT|VOLUME)$');unit_value:=alliance_security.text_value(body,'unit_id',12);active_value:=alliance_security.flag(body,'active');
    created_value:=alliance_security.text_value(p_operation,'client_created_at',40,'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$');
    IF INSTR(created_value,'.')=0 THEN created_value:=REPLACE(created_value,'Z','.000Z');END IF;
    created_time:=FROM_TZ(TO_TIMESTAMP(REPLACE(created_value,'Z',''),'YYYY-MM-DD"T"HH24:MI:SS.FF'),'UTC');
    SELECT COUNT(*) INTO n FROM devices WHERE id=device_value AND business_id=p_business AND location_id=p_location AND user_id=p_user;IF n<>1 THEN alliance_security.fail(403,'FORBIDDEN','Registra el dispositivo de esta sucursal.');END IF;
    -- Serialize all catalog writes per business, including first creation.
    SELECT id INTO dummy FROM businesses WHERE id=p_business FOR UPDATE;
    alliance_security.require_location(p_user,p_business,p_location,'products.write');
    hash_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(p_operation.to_clob,DBMS_CRYPTO.HASH_SH256)));
    BEGIN
      SELECT payload_hash,result,operation_id INTO previous_hash,saved_result,previous_operation FROM sync_operations WHERE business_id=p_business AND (operation_id=operation_value OR idempotency_key=key_value);
      IF previous_hash<>hash_value OR previous_operation<>operation_value THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La operacion ya existe con otro contenido.');END IF;RETURN JSON_OBJECT_T(saved_result);
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;
    BEGIN SELECT version INTO version_value FROM products WHERE id=entity_value AND business_id=p_business;before_json:=product_json(entity_value,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN version_value:=0;END;
    ack.put('operation_id',operation_value);
    IF version_value<>base_value THEN status_value:='CONFLICT';ack.put('code','VERSION_CONFLICT');ack.put('message','El producto cambio en otro dispositivo.');IF version_value>0 THEN ack.put('product',JSON_OBJECT_T(before_json));END IF;
    ELSE
      SELECT COUNT(*) INTO n FROM products WHERE business_id=p_business AND sku=sku_value AND id<>entity_value;
      IF n>0 THEN status_value:='REQUIRES_REVIEW';ack.put('code','SKU_EXISTS');ack.put('message','Ya existe un producto con esa referencia.');
      ELSE
        SELECT COUNT(*) INTO n FROM units_of_measure WHERE id=unit_value;
        IF n=0 THEN status_value:='REQUIRES_REVIEW';ack.put('code','INVALID_UNIT');ack.put('message','La unidad no existe.');
        ELSE
          BEGIN SELECT id INTO category_value FROM product_categories WHERE business_id=p_business AND name=category_name;
          EXCEPTION WHEN NO_DATA_FOUND THEN category_value:=alliance_security.new_id;INSERT INTO product_categories(id,business_id,name) VALUES(category_value,p_business,category_name);END;
          IF version_value=0 THEN INSERT INTO products(id,business_id,name,sku,category_id,price_minor,kind,unit_id,active,version) VALUES(entity_value,p_business,name_value,sku_value,category_value,TO_NUMBER(price_value),kind_value,unit_value,active_value,1);
          ELSE UPDATE products SET name=name_value,sku=sku_value,category_id=category_value,price_minor=TO_NUMBER(price_value),kind=kind_value,unit_id=unit_value,active=active_value,version=base_value+1,updated_at=SYSTIMESTAMP WHERE id=entity_value AND business_id=p_business;END IF;
          product_value:=product_json(entity_value,p_business);ack.put('product',product_value);product_clob:=product_value.to_clob;
          FOR l IN (SELECT id,change_cursor FROM locations WHERE business_id=p_business ORDER BY id FOR UPDATE) LOOP
            UPDATE locations SET change_cursor=change_cursor+1 WHERE id=l.id AND business_id=p_business;
            INSERT INTO change_feed(business_id,location_id,cursor_value,product_json) VALUES(p_business,l.id,l.change_cursor+1,product_clob);
          END LOOP;
        END IF;
      END IF;
    END IF;
    ack.put('status',status_value);
    operation_clob:=p_operation.to_clob;ack_clob:=ack.to_clob;
    INSERT INTO sync_operations(business_id,operation_id,idempotency_key,location_id,device_id,user_id,payload_hash,entity_id,operation_type,client_created_at,status,payload,result)
      VALUES(p_business,operation_value,key_value,p_location,device_value,p_user,hash_value,entity_value,'PRODUCT_UPSERT',created_time,status_value,operation_clob,ack_clob);
    INSERT INTO audit_log(id,business_id,location_id,user_id,device_id,operation_id,action,entity_id,before_json,after_json)
      VALUES(alliance_security.new_id,p_business,p_location,p_user,device_value,operation_value,CASE WHEN status_value='SYNCED' THEN 'PRODUCT_UPSERT' ELSE 'SYNC_REVIEW' END,entity_value,before_json,ack_clob);
    IF status_value='SYNCED' THEN alliance_activity.record_event(p_user,p_business,p_location,'inventory','PRODUCT_UPSERT','Guardó un producto del catálogo',entity_value);END IF;
    UPDATE devices SET last_seen=SYSTIMESTAMP WHERE id=device_value;RETURN ack;
  END;
  FUNCTION changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_cursor NUMBER) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();arr JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;n NUMBER:=0;last_cursor NUMBER:=p_cursor;more BOOLEAN:=FALSE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');
    IF p_cursor IS NULL OR p_cursor<0 OR p_cursor<>TRUNC(p_cursor) OR p_cursor>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','Cursor invalido.');END IF;
    FOR x IN (SELECT cursor_value,product_json FROM change_feed WHERE business_id=p_business AND location_id=p_location AND cursor_value>p_cursor ORDER BY cursor_value FETCH FIRST 101 ROWS ONLY) LOOP
      n:=n+1;IF n<=100 THEN entry:=JSON_OBJECT_T();entry.put('cursor',x.cursor_value);entry.put('product',JSON_OBJECT_T(x.product_json));arr.append(entry);last_cursor:=x.cursor_value;ELSE more:=TRUE;END IF;
    END LOOP;
    r.put('changes',arr);r.put('cursor',last_cursor);r.put('has_more',more);RETURN r;
  END;
END;
/
