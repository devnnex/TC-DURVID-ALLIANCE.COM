-- Executed only by test-gcobarf-orders-live.ts; every change rolls back.
DECLARE
 b VARCHAR2(36);l VARCHAR2(36);u VARCHAR2(36);p JSON_OBJECT_T;req JSON_OBJECT_T;order_data JSON_OBJECT_T;items JSON_ARRAY_T;item JSON_OBJECT_T;r JSON_OBJECT_T;again JSON_OBJECT_T;account JSON_OBJECT_T;row_json JSON_OBJECT_T;sid VARCHAR2(36);customer_id VARCHAR2(80);q NUMBER;n NUMBER;invoice_clob CLOB;cgi_names OWA.vc_arr;cgi_values OWA.vc_arr;
 PROCEDURE check_value(ok BOOLEAN,label_value VARCHAR2) IS BEGIN IF ok IS NULL OR NOT ok THEN RAISE_APPLICATION_ERROR(-20088,label_value);END IF;END;
 PROCEDURE rejected(request_json JSON_OBJECT_T,expected_code VARCHAR2) IS v JSON_OBJECT_T;BEGIN
   SAVEPOINT invalid_order;
   BEGIN v:=alliance_gcobarf_orders.dispatch(request_json);RAISE_APPLICATION_ERROR(-20088,'Se acepto: '||expected_code);
   EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-20001 OR alliance_security.error_code<>expected_code THEN RAISE;END IF;ROLLBACK TO invalid_order;END;
 END;
BEGIN
 cgi_names(1):='REMOTE_ADDR';cgi_values(1):='test-__PRODUCT__';OWA.init_cgi_env(1,cgi_names,cgi_values);
 SELECT loc.business_id,loc.id INTO b,l FROM locations loc JOIN businesses biz ON biz.id=loc.business_id WHERE biz.slug='tc-alliance' AND loc.slug='gcobarf';
 SELECT usr.id INTO u FROM users usr WHERE usr.business_id=b AND usr.active=1 AND EXISTS(SELECT 1 FROM user_location_roles role_row WHERE role_row.business_id=b AND role_row.user_id=usr.id AND (role_row.role_code='OWNER' OR (role_row.location_id=l AND role_row.role_code='BOSS'))) ORDER BY usr.id FETCH FIRST 1 ROW ONLY;
 alliance_pos_store.lock_scope(b,l);
 p:=JSON_OBJECT_T('{"table":"menu_items","op":"insert","values":{"id":"__PRODUCT__","name":"Prueba temporal pedidos online","price":10000,"is_available":true}}');r:=alliance_pos_store.query(u,b,l,p);
 p:=JSON_OBJECT_T('{"item":{"productId":"__PRODUCT__","stock":5,"minStock":0,"unit":"unidad","salePrice":10000,"costPrice":1000}}');r:=alliance_pos_store.stock_action(u,b,l,'upsert_inventory',p);
 UPDATE alliance_pos_stock SET allow_negative=1 WHERE business_id=b AND location_id=l AND product_id='__PRODUCT__';
 order_data:=JSON_OBJECT_T('{"name":"Prueba rollback online __PRODUCT__","phone":"__PHONE__","mode":"delivery","city":"Ciudad temporal","address":"Direccion de prueba","notes":"No es un pedido real","consent":true,"date":"2000-01-01","time":"09:30","items":[{"productId":"__PRODUCT__","quantity":2,"unitPrice":10000}]}');
 req:=JSON_OBJECT_T();req.put('action','create');req.put('token','__TOKEN__');req.put('order',order_data);rejected(req,'INVALID_DATE');
 order_data.put('date','2027-02-30');req.put('order',order_data);rejected(req,'INVALID_DATE');
 order_data.put('date',TO_CHAR((SYSTIMESTAMP AT TIME ZONE 'America/Bogota')+INTERVAL '2' DAY,'YYYY-MM-DD'));req.put('order',order_data);
 items:=order_data.get_array('items');item:=TREAT(items.get(0) AS JSON_OBJECT_T);item.put('quantity',6);items.put(0,item,TRUE);order_data.put('items',items);req.put('order',order_data);rejected(req,'INSUFFICIENT_STOCK');
 item.put('quantity',1.5);items.put(0,item,TRUE);order_data.put('items',items);req.put('order',order_data);rejected(req,'INVALID_INPUT');
 item.put('quantity',2);item.put('unitPrice',1);items.put(0,item,TRUE);order_data.put('items',items);req.put('order',order_data);rejected(req,'PRICE_CHANGED');
 item.put('unitPrice',10000);items.put(0,item,TRUE);items.append(item);order_data.put('items',items);req.put('order',order_data);rejected(req,'INVALID_INPUT');items.remove(1);
 order_data.put('items',items);order_data.put('consent',FALSE);req.put('order',order_data);rejected(req,'CONSENT_REQUIRED');order_data.put('consent',TRUE);
 order_data.put('business_id',b);req.put('order',order_data);rejected(req,'INVALID_INPUT');order_data.remove('business_id');req.put('order',order_data);
 r:=alliance_gcobarf_orders.dispatch(req);sid:=r.get_string('id');check_value(r.get_string('status')='Pendiente de pago','Queda pendiente');check_value(r.get_number('total')=20000,'Total del servidor');
 SELECT stock INTO q FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND product_id='__PRODUCT__';check_value(q=3,'Reserva dos unidades');
 account:=alliance_pos_store.document(b,l,'table_sessions',sid);customer_id:=account.get_string('customer_id');check_value(account.get_string('source')='online' AND account.get_string('delivery_address')='Direccion de prueba','Origen y domicilio en admin');
 r:=alliance_operations.snapshot(u,b,l);SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_deliveryholds' AND id=sid;check_value(n=1,'Reserva persistente');
 again:=alliance_gcobarf_orders.dispatch(req);check_value(again.get_string('id')=sid,'Reintento idempotente');SELECT stock INTO q FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND product_id='__PRODUCT__';check_value(q=3,'Reintento no descuenta otra vez');
 order_data.put('notes','Cambio posterior');req.put('order',order_data);rejected(req,'ORDER_CHANGED');order_data.put('notes','No es un pedido real');req.put('order',order_data);
 r:=alliance_gcobarf_orders.dispatch(JSON_OBJECT_T('{"action":"status","token":"__TOKEN__"}'));check_value(r.get_string('id')=sid,'Consulta privada por token');check_value(NOT r.has('phone') AND NOT r.has('customerId'),'Respuesta publica limitada');
 rejected(JSON_OBJECT_T('{"action":"status","token":"__OTHER_TOKEN__"}'),'ORDER_NOT_FOUND');
 row_json:=JSON_OBJECT_T('{"id":"__PRODUCT__","payments":[{"method":"credit","amount":20000}]}');row_json.put('sessionId',sid);
 invoice_clob:=row_json.to_clob;INSERT INTO alliance_pos_sales(business_id,location_id,id,session_id,actor_user_id,invoice_json,subtotal_minor,total_minor,cost_minor)VALUES(b,l,'__PRODUCT__',sid,u,invoice_clob,2000000,2000000,200000);
 row_json:=JSON_OBJECT_T('{"id":"__PRODUCT__","saleId":"__PRODUCT__","total":20000,"paid":5000,"voided":false}');alliance_pos_store.put_document(b,l,'op_debts','__PRODUCT__',row_json);
 r:=alliance_gcobarf_orders.dispatch(JSON_OBJECT_T('{"action":"status","token":"__TOKEN__"}'));check_value(r.get_string('status')='Pago parcial' AND r.get_number('pending')=15000,'Sigue abono parcial');
 row_json.put('paid',20000);alliance_pos_store.put_document(b,l,'op_debts','__PRODUCT__',row_json);r:=alliance_gcobarf_orders.dispatch(JSON_OBJECT_T('{"action":"status","token":"__TOKEN__"}'));check_value(r.get_string('status')='Pagado','Sigue pago del jefe');
 DELETE FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND id='__PRODUCT__';DELETE FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_debts' AND id='__PRODUCT__';
 p:=JSON_OBJECT_T('{"table":"table_sessions","op":"update","values":{"status":"cancelled"},"filters":[]}');items:=JSON_ARRAY_T();row_json:=JSON_OBJECT_T();row_json.put('field','id');row_json.put('op','eq');row_json.put('value',sid);items.append(row_json);p.put('filters',items);r:=alliance_pos_store.query(u,b,l,p);
 SELECT stock INTO q FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND product_id='__PRODUCT__';check_value(q=5,'Cancelar desde admin devuelve las unidades');
 r:=alliance_gcobarf_orders.dispatch(JSON_OBJECT_T('{"action":"status","token":"__TOKEN__"}'));check_value(r.get_string('status')='Cancelado','Cancelacion visible al cliente');
 SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_customers' AND id=customer_id;check_value(n=1,'Conserva el cliente');
 ROLLBACK;
EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE_APPLICATION_ERROR(-20089,DBMS_UTILITY.format_error_stack||DBMS_UTILITY.format_error_backtrace);END;
