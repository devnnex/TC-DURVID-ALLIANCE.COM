CREATE OR REPLACE PACKAGE alliance_stock_notifications AUTHID DEFINER AS
 FUNCTION is_boss(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN BOOLEAN;
 FUNCTION boss_allowed(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN NUMBER;
 FUNCTION stock_snapshot(b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T;
 FUNCTION scan_snapshot(b VARCHAR2,l VARCHAR2) RETURN CLOB;
 FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
 PROCEDURE sync_scope(b VARCHAR2,l VARCHAR2,alerts CLOB,expected_revision VARCHAR2);
 FUNCTION claim_delivery(identifier VARCHAR2,subscription VARCHAR2) RETURN NUMBER;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_stock_notifications AS
 FUNCTION is_boss(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN BOOLEAN IS n NUMBER;
 BEGIN
  SELECT COUNT(*) INTO n FROM users x JOIN locations v ON v.business_id=x.business_id AND v.id=l AND v.active=1 WHERE x.id=u AND x.business_id=b AND x.active=1 AND x.deleted_at IS NULL;
  IF n=0 THEN RETURN FALSE;END IF;
  IF alliance_security.owner(u,b) THEN RETURN TRUE;END IF;
  SELECT COUNT(*) INTO n FROM user_location_roles WHERE business_id=b AND location_id=l AND user_id=u AND role_code IN('BOSS','OWNER');RETURN n>0;
 END;
 FUNCTION boss_allowed(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN NUMBER IS ctx JSON_OBJECT_T;perms JSON_ARRAY_T;
 BEGIN
  IF NOT is_boss(u,b,l) THEN RETURN 0;END IF;
  ctx:=alliance_security.context_for(u);IF NOT ctx.get_object('permissions').has(l) THEN RETURN 0;END IF;perms:=ctx.get_object('permissions').get_array(l);
  FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i)='inventory.read' THEN RETURN 1;END IF;END LOOP;RETURN 0;
 END;
 FUNCTION stock_snapshot(b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T IS
  r JSON_OBJECT_T:=JSON_OBJECT_T();model JSON_OBJECT_T:=JSON_OBJECT_T();docs JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T;row_json JSON_OBJECT_T;o JSON_OBJECT_T;units JSON_ARRAY_T:=JSON_ARRAY_T();
 BEGIN
  items:=JSON_ARRAY_T();
  FOR x IN(SELECT s.* FROM alliance_raw_stock s WHERE s.business_id=b AND s.location_id=l AND NOT EXISTS(SELECT 1 FROM alliance_pos_documents d WHERE d.business_id=b AND d.location_id=l AND d.entity='op_archivedingredients' AND d.id=s.id)) LOOP
   o:=JSON_OBJECT_T();o.put('id',x.id);o.put('name',x.name);o.put('unit',x.unit_id);o.put('quantity',x.quantity);o.put('minStock',x.min_stock);items.append(o);
  END LOOP;model.put('ingredients',items);
  model.put('recipes',alliance_pos_store.list_documents(b,l,'op_recipes'));model.put('productions',alliance_pos_store.list_documents(b,l,'op_productions'));
  items:=JSON_ARRAY_T();FOR x IN(SELECT d.data_json FROM alliance_pos_documents d WHERE d.business_id=b AND d.location_id=l AND d.entity='op_preparations' AND EXISTS(SELECT 1 FROM alliance_pos_documents s WHERE s.business_id=b AND s.location_id=l AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.sessionId') AND JSON_VALUE(s.data_json,'$.status')='open'))LOOP items.append(JSON_OBJECT_T(x.data_json));END LOOP;model.put('preparations',items);
  items:=JSON_ARRAY_T();FOR x IN(SELECT data_json,id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='menu_items')LOOP
   row_json:=JSON_OBJECT_T(x.data_json);o:=JSON_OBJECT_T();o.put('id',x.id);o.put('name',row_json.get_string('name'));o.put('is_available',NVL(row_json.get_string('is_available'),'true')<>'false');items.append(o);
  END LOOP;docs.put('menu_items',items);
  items:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='table_sessions' AND JSON_VALUE(data_json,'$.status')='open')LOOP items.append(JSON_OBJECT_T(x.data_json));END LOOP;docs.put('table_sessions',items);
  items:=JSON_ARRAY_T();FOR x IN(SELECT d.data_json FROM alliance_pos_documents d WHERE d.business_id=b AND d.location_id=l AND d.entity='session_items' AND JSON_VALUE(d.data_json,'$.status')<>'cancelled' AND EXISTS(SELECT 1 FROM alliance_pos_documents s WHERE s.business_id=b AND s.location_id=l AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.session_id') AND JSON_VALUE(s.data_json,'$.status')='open'))LOOP items.append(JSON_OBJECT_T(x.data_json));END LOOP;docs.put('session_items',items);
  items:=JSON_ARRAY_T();FOR x IN(SELECT product_id,stock FROM alliance_pos_stock WHERE business_id=b AND location_id=l)LOOP o:=JSON_OBJECT_T();o.put('productId',x.product_id);o.put('stock',x.stock);items.append(o);END LOOP;r.put('inventory',items);
  FOR x IN(SELECT id,dimension,factor FROM units_of_measure)LOOP o:=JSON_OBJECT_T();o.put('id',x.id);o.put('dimension',x.dimension);o.put('factor',x.factor);units.append(o);END LOOP;
  r.put('units',units);r.put('model',model);r.put('docs',docs);RETURN r;
 END;
 FUNCTION scan_snapshot(b VARCHAR2,l VARCHAR2) RETURN CLOB IS
  PRAGMA AUTONOMOUS_TRANSACTION;
  j JSON_OBJECT_T;v CLOB;
 BEGIN
  alliance_pos_store.lock_scope(b,l);j:=stock_snapshot(b,l);
  j.put('_alertRevision',alliance_pos_store.report_revision(b,l));v:=j.to_clob;
  COMMIT;RETURN v;
 EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
 END;
 FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  r JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;sub JSON_OBJECT_T;keys_value JSON_OBJECT_T;endpoint_value VARCHAR2(2048);p256dh_value VARCHAR2(180);auth_value VARCHAR2(100);identifier VARCHAR2(64);v_public VARCHAR2(180);enabled_value NUMBER;n NUMBER;
 BEGIN
  IF NOT is_boss(u,b,l) THEN alliance_security.fail(403,'BOSS_REQUIRED','Las alertas de insumos son exclusivas para los jefes de este negocio.');END IF;
  alliance_security.require_location(u,b,l,'inventory.read');
  SELECT public_key,enabled INTO v_public,enabled_value FROM alliance_push_config WHERE id=1;
  r.put('configured',enabled_value=1 AND v_public IS NOT NULL);r.put('publicKey',v_public);
  IF a='stock_alert_feed' THEN
   alliance_security.keys_only(p,'');
   FOR x IN(SELECT payload FROM alliance_stock_alerts WHERE business_id=b AND location_id=l AND active=1 ORDER BY CASE level_value WHEN 'out' THEN 0 ELSE 1 END,id) LOOP items.append(JSON_OBJECT_T(x.payload));END LOOP;
   r.put('alerts',items);items:=JSON_ARRAY_T();FOR x IN(SELECT endpoint FROM alliance_push_subscriptions WHERE business_id=b AND location_id=l AND user_id=u AND active=1)LOOP items.append(alliance_security.hash_text(x.endpoint));END LOOP;r.put('subscriptionKeys',items);r.put('at',alliance_pos_store.stamp);RETURN r;
  ELSIF a='stock_alert_subscribe' THEN
   alliance_security.keys_only(p,'subscription');sub:=p.get_object('subscription');alliance_security.keys_only(sub,'endpoint,expirationTime,keys');keys_value:=sub.get_object('keys');alliance_security.keys_only(keys_value,'p256dh,auth');
   endpoint_value:=alliance_security.text_value(sub,'endpoint',2048);
   IF NOT REGEXP_LIKE(endpoint_value,'^https://(fcm[.]googleapis[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*push[.]apple[.]com|([a-z0-9-]+[.])+notify[.]windows[.]com)/','c') OR INSTR(endpoint_value,CHR(10))>0 OR INSTR(endpoint_value,CHR(13))>0 THEN alliance_security.fail(400,'PUSH_ENDPOINT','Proveedor de notificaciones no admitido.');END IF;
   IF enabled_value<>1 OR v_public IS NULL THEN alliance_security.fail(409,'PUSH_SETUP','El envío externo todavía necesita su configuración privada.');END IF;
   p256dh_value:=alliance_security.text_value(keys_value,'p256dh',180,'^[A-Za-z0-9_-]{80,180}$');auth_value:=alliance_security.text_value(keys_value,'auth',100,'^[A-Za-z0-9_-]{16,100}$');
   identifier:=alliance_security.hash_text(b||':'||l||':'||u||':'||endpoint_value);
   SELECT COUNT(*) INTO n FROM alliance_push_subscriptions WHERE business_id=b AND location_id=l AND user_id=u AND active=1 AND id<>identifier;
   IF n>=20 THEN alliance_security.fail(409,'PUSH_DEVICES','Ya tienes veinte dispositivos con avisos en este negocio.');END IF;
   MERGE INTO alliance_push_subscriptions t USING(SELECT identifier id FROM dual)s ON(t.id=s.id)
   WHEN MATCHED THEN UPDATE SET endpoint=endpoint_value,p256dh=p256dh_value,auth_key=auth_value,active=1,updated_at=SYSTIMESTAMP
   WHEN NOT MATCHED THEN INSERT(id,business_id,location_id,user_id,endpoint,p256dh,auth_key,active)VALUES(identifier,b,l,u,endpoint_value,p256dh_value,auth_value,1);
   r.put('id',identifier);r.put('ok',TRUE);RETURN r;
  ELSIF a='stock_alert_unsubscribe' THEN
   alliance_security.keys_only(p,'endpoint');endpoint_value:=alliance_security.text_value(p,'endpoint',2048);UPDATE alliance_push_subscriptions SET active=0,updated_at=SYSTIMESTAMP WHERE business_id=b AND location_id=l AND user_id=u AND endpoint=endpoint_value;r.put('ok',TRUE);RETURN r;
  END IF;
  alliance_security.fail(404,'NOT_FOUND','Acción de notificaciones no disponible.');RETURN r;
 END;
 -- Only the trusted SQL maintenance connection can call this procedure. The
 -- browser cannot submit quantities, create recipients, or schedule deliveries.
 PROCEDURE sync_scope(b VARCHAR2,l VARCHAR2,alerts CLOB,expected_revision VARCHAR2) IS
  entries JSON_ARRAY_T:=JSON_ARRAY_T(alerts);o JSON_OBJECT_T;identifier VARCHAR2(160);payload_value CLOB;new_level VARCHAR2(12);scan_value VARCHAR2(64):=alliance_security.new_id;previous_level VARCHAR2(12);was_active NUMBER;gen NUMBER;opened TIMESTAMP WITH TIME ZONE;scope_count NUMBER;
 BEGIN
  SELECT COUNT(*) INTO scope_count FROM locations WHERE id=l AND business_id=b AND active=1;IF scope_count<>1 THEN RAISE_APPLICATION_ERROR(-20010,'Negocio no disponible');END IF;
  alliance_pos_store.lock_scope(b,l);
  IF expected_revision IS NULL OR expected_revision<>alliance_pos_store.report_revision(b,l) THEN RAISE_APPLICATION_ERROR(-20011,'STOCK_CHANGED');END IF;
  IF entries.get_size>10000 THEN RAISE_APPLICATION_ERROR(-20010,'Demasiadas alertas');END IF;
  FOR i IN 0..entries.get_size-1 LOOP
   o:=TREAT(entries.get(i) AS JSON_OBJECT_T);identifier:=o.get_string('id');IF identifier IS NULL OR LENGTH(identifier)>160 OR o.get_string('level') NOT IN('out','low') THEN RAISE_APPLICATION_ERROR(-20010,'Alerta inválida');END IF;
   payload_value:=o.to_clob;new_level:=o.get_string('level');
   BEGIN
    SELECT active,generation,level_value,opened_at INTO was_active,gen,previous_level,opened FROM alliance_stock_alerts WHERE business_id=b AND location_id=l AND id=identifier FOR UPDATE;
    IF was_active=0 OR previous_level='low' AND o.get_string('level')='out' THEN gen:=gen+1;opened:=SYSTIMESTAMP;END IF;
    UPDATE alliance_stock_alerts SET active=1,generation=gen,opened_at=opened,payload=payload_value,level_value=new_level,scan_id=scan_value,stock_revision=expected_revision WHERE business_id=b AND location_id=l AND id=identifier;
   EXCEPTION WHEN NO_DATA_FOUND THEN INSERT INTO alliance_stock_alerts(business_id,location_id,id,payload,level_value,scan_id,stock_revision)VALUES(b,l,identifier,payload_value,new_level,scan_value,expected_revision);END;
  END LOOP;
  UPDATE alliance_stock_alerts SET active=0 WHERE business_id=b AND location_id=l AND active=1 AND NVL(scan_id,'-')<>scan_value;
 END;
 FUNCTION claim_delivery(identifier VARCHAR2,subscription VARCHAR2) RETURN NUMBER IS
  PRAGMA AUTONOMOUS_TRANSACTION;
  claimed NUMBER;
 BEGIN
  BEGIN INSERT INTO alliance_push_deliveries(id,subscription_id,status,lease_until)VALUES(identifier,subscription,'sending',SYSTIMESTAMP+INTERVAL '2' MINUTE);claimed:=1;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
   UPDATE alliance_push_deliveries SET status='sending',lease_until=SYSTIMESTAMP+INTERVAL '2' MINUTE,attempts=attempts+1,updated_at=SYSTIMESTAMP WHERE id=identifier AND status<>'sent' AND lease_until<=SYSTIMESTAMP;
   claimed:=SQL%ROWCOUNT;
  END;
  COMMIT;RETURN claimed;
 EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
 END;
END;
/
