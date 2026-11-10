-- Public ordering is deliberately bound to the existing GCOBARF branch.
CREATE OR REPLACE PACKAGE alliance_gcobarf_orders AUTHID DEFINER AS
  FUNCTION dispatch(body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_gcobarf_orders AS
  FUNCTION optional_text(p JSON_OBJECT_T,k VARCHAR2,maximum NUMBER) RETURN VARCHAR2 IS v VARCHAR2(32767);
  BEGIN
    IF NOT p.has(k) THEN RETURN NULL;END IF;IF p.get(k).is_null THEN RETURN NULL;END IF;
    IF NOT p.get(k).is_string THEN alliance_security.fail(400,'INVALID_INPUT','Revisa el campo '||k||'.');END IF;
    v:=TRIM(p.get_string(k));IF LENGTH(v)>maximum THEN alliance_security.fail(400,'INVALID_INPUT','El campo '||k||' es demasiado largo.');END IF;RETURN v;
  END;
  PROCEDURE scope(b OUT VARCHAR2,l OUT VARCHAR2) IS
  BEGIN
    SELECT business.id,branch.id INTO b,l FROM businesses business JOIN locations branch ON branch.business_id=business.id
      WHERE business.slug='tc-alliance' AND branch.slug='gcobarf' AND branch.active=1;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'STORE_UNAVAILABLE','GCOBARF no esta disponible en este momento.');END;

  FUNCTION catalog(b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;menu JSON_OBJECT_T;
  BEGIN
    FOR x IN(SELECT p.id,p.name,p.price_minor,p.active,s.stock,s.unit_name,c.name category,d.data_json
      FROM alliance_pos_stock s JOIN products p ON p.business_id=s.business_id AND p.id=s.product_id
      JOIN product_categories c ON c.business_id=p.business_id AND c.id=p.category_id
      JOIN alliance_pos_documents d ON d.business_id=s.business_id AND d.location_id=s.location_id AND d.entity='menu_items' AND d.id=s.product_id
      WHERE s.business_id=b AND s.location_id=l AND NOT EXISTS(SELECT 1 FROM alliance_pos_documents recipe WHERE recipe.business_id=b AND recipe.location_id=l AND recipe.entity='op_recipes' AND recipe.id=p.id)
      ORDER BY p.name) LOOP
      menu:=JSON_OBJECT_T(x.data_json);o:=JSON_OBJECT_T();o.put('id',x.id);o.put('name',x.name);o.put('category',x.category);o.put('price',x.price_minor/100);
      o.put('stock',GREATEST(0,FLOOR(x.stock)));o.put('unit',x.unit_name);o.put('available',x.active=1 AND x.stock>=1 AND x.price_minor>0 AND NVL(menu.get_boolean('is_available'),TRUE));
      o.put('description',menu.get_string('description'));IF menu.has('image_url') THEN o.put('image',menu.get('image_url'));ELSE o.put_null('image');END IF;items.append(o);
    END LOOP;
    r.put('name','GCOBARF Nutripet’s');
    r.put('products',items);r.put('updatedAt',alliance_pos_store.stamp);RETURN r;
  END;

  FUNCTION receipt(b VARCHAR2,l VARCHAR2,order_row JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    account JSON_OBJECT_T;line JSON_OBJECT_T;o JSON_OBJECT_T;r JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T:=JSON_ARRAY_T();invoice JSON_OBJECT_T;payments JSON_ARRAY_T;payment JSON_OBJECT_T;
    total_value NUMBER:=0;pending_value NUMBER:=0;credit_value NUMBER:=0;debt_count NUMBER:=0;sale_id VARCHAR2(80);session_value VARCHAR2(80);
  BEGIN
    account:=alliance_pos_store.document(b,l,'table_sessions',order_row.get_string('sessionId'));
    IF account IS NULL THEN alliance_security.fail(404,'ORDER_NOT_FOUND','No encontramos esta programacion.');END IF;
    session_value:=account.get_string('id');
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=session_value AND NVL(JSON_VALUE(data_json,'$.status'),'confirmed')<>'cancelled') LOOP
      line:=JSON_OBJECT_T(x.data_json);o:=JSON_OBJECT_T();o.put('name',line.get_string('item_name'));o.put('quantity',line.get_number('quantity'));o.put('unitPrice',line.get_number('unit_price'));items.append(o);total_value:=total_value+line.get_number('quantity')*line.get_number('unit_price');
    END LOOP;
    pending_value:=total_value;
    FOR x IN(SELECT id,invoice_json,total_minor FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND session_id=session_value AND voided=0) LOOP
      sale_id:=x.id;invoice:=JSON_OBJECT_T(x.invoice_json);total_value:=x.total_minor/100;pending_value:=0;
      SELECT COUNT(*),NVL(SUM(GREATEST(0,JSON_VALUE(data_json,'$.total' RETURNING NUMBER)-JSON_VALUE(data_json,'$.paid' RETURNING NUMBER))),0) INTO debt_count,pending_value FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_debts' AND NVL(JSON_VALUE(data_json,'$.voided'),'false')<>'true' AND (id=sale_id OR JSON_VALUE(data_json,'$.saleId')=sale_id);
      IF debt_count=0 THEN payments:=invoice.get_array('payments');IF payments IS NOT NULL THEN FOR i IN 0..payments.get_size-1 LOOP payment:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF payment.get_string('method')='credit' THEN credit_value:=credit_value+payment.get_number('amount');END IF;END LOOP;END IF;pending_value:=credit_value;END IF;
    END LOOP;
    r.put('id',account.get_string('id'));r.put('number',order_row.get_string('number'));r.put('date',account.get_string('delivery_date'));r.put('time',account.get_string('delivery_time'));r.put('items',items);r.put('total',ROUND(total_value,2));r.put('pending',ROUND(pending_value,2));
    r.put('status',CASE WHEN account.get_string('status')='cancelled' THEN 'Cancelado' WHEN sale_id IS NOT NULL AND pending_value=0 THEN 'Pagado' WHEN sale_id IS NOT NULL AND pending_value<total_value THEN 'Pago parcial' ELSE 'Pendiente de pago' END);RETURN r;
  END;

  FUNCTION dispatch(body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    b VARCHAR2(36);l VARCHAR2(36);u VARCHAR2(36);action_value VARCHAR2(20);token_value VARCHAR2(64);order_key VARCHAR2(64);fingerprint VARCHAR2(64);old JSON_OBJECT_T;payload JSON_OBJECT_T;
    name_value VARCHAR2(160);phone_value VARCHAR2(40);address_value VARCHAR2(300);city_value VARCHAR2(100);neighborhood_value VARCHAR2(160);notes_value VARCHAR2(500);mode_value VARCHAR2(10);date_value VARCHAR2(10);time_value VARCHAR2(5);moment TIMESTAMP;today_value DATE;
    items JSON_ARRAY_T;item JSON_OBJECT_T;seen JSON_OBJECT_T:=JSON_OBJECT_T();menu JSON_OBJECT_T;account JSON_OBJECT_T;line JSON_OBJECT_T;customer JSON_OBJECT_T;order_row JSON_OBJECT_T;result_json JSON_OBJECT_T;
    customer_id VARCHAR2(80);sid VARCHAR2(36);product_value VARCHAR2(36);quantity_value NUMBER;price_value NUMBER;stock_value NUMBER;active_value NUMBER;n NUMBER;customer_name VARCHAR2(160);
  BEGIN
    scope(b,l);action_value:=alliance_security.text_value(body,'action',20,'^(catalog|create|status)$');
    IF action_value='catalog' THEN alliance_security.keys_only(body,'action');RETURN catalog(b,l);END IF;
    token_value:=alliance_security.text_value(body,'token',64,'^[a-f0-9]{64}$');order_key:=alliance_security.hash_text(token_value);
    IF action_value='status' THEN
      alliance_security.keys_only(body,'action,token');old:=alliance_pos_store.document(b,l,'op_onlineorders',order_key);
      IF old IS NULL THEN alliance_security.fail(404,'ORDER_NOT_FOUND','No encontramos esta programacion.');END IF;RETURN receipt(b,l,old);
    END IF;
    alliance_security.keys_only(body,'action,token,order');payload:=body.get_object('order');IF payload IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Completa tu pedido.');END IF;
    alliance_security.keys_only(payload,'name,phone,address,city,neighborhood,mode,date,time,notes,consent,items');fingerprint:=alliance_security.hash_text(payload.to_string);
    alliance_pos_store.lock_scope(b,l);
    old:=alliance_pos_store.document(b,l,'op_onlineorders',order_key);IF old IS NOT NULL THEN
      IF old.get_string('fingerprint')<>fingerprint THEN alliance_security.fail(409,'ORDER_CHANGED','Este pedido ya fue enviado. Consulta su confirmacion.');END IF;RETURN receipt(b,l,old);
    END IF;
    name_value:=alliance_security.text_value(payload,'name',160);phone_value:=alliance_security.text_value(payload,'phone',40,'^[+0-9 ()-]{7,40}$');phone_value:=REGEXP_REPLACE(phone_value,'[^0-9]','');
    IF LENGTH(phone_value)<7 OR LENGTH(phone_value)>15 THEN alliance_security.fail(400,'INVALID_INPUT','Revisa tu telefono.');END IF;
    IF alliance_security.flag(payload,'consent')<>1 THEN alliance_security.fail(400,'CONSENT_REQUIRED','Autoriza el uso de tus datos para gestionar la entrega.');END IF;
    mode_value:=alliance_security.text_value(payload,'mode',10,'^(delivery|pickup)$');
    IF mode_value='delivery' THEN
      address_value:=optional_text(payload,'address',300);city_value:=optional_text(payload,'city',100);neighborhood_value:=optional_text(payload,'neighborhood',160);
      IF address_value IS NOT NULL AND NOT REGEXP_LIKE(address_value,'(^|[^A-Za-z0-9_])barrio([^A-Za-z0-9_]|$)','i') AND neighborhood_value IS NULL THEN alliance_security.fail(400,'NEIGHBORHOOD_REQUIRED','Escribe el barrio para completar esta direccion.');END IF;
      IF address_value IS NULL THEN neighborhood_value:=NULL;END IF;
    END IF;
    notes_value:=payload.get_string('notes');IF LENGTH(notes_value)>500 THEN alliance_security.fail(400,'INVALID_INPUT','Usa hasta 500 caracteres en las observaciones.');END IF;
    date_value:=alliance_security.text_value(payload,'date',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');time_value:=alliance_security.text_value(payload,'time',5,'^([01][0-9]|2[0-3]):[0-5][0-9]$');
    BEGIN moment:=TO_TIMESTAMP(date_value||' '||time_value,'FXYYYY-MM-DD HH24:MI');
    EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_DATE','Revisa la fecha y hora de entrega.');END;
    today_value:=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Bogota' AS DATE));
    IF TRUNC(CAST(moment AS DATE))<today_value OR TRUNC(CAST(moment AS DATE))>today_value+365 THEN alliance_security.fail(400,'INVALID_DATE','Selecciona hoy o una fecha posterior dentro de los proximos 12 meses.');END IF;
    items:=payload.get_array('items');IF items IS NULL OR items.get_size<1 OR items.get_size>50 THEN alliance_security.fail(400,'INVALID_INPUT','Agrega de 1 a 50 productos.');END IF;
    -- Validate every line against server prices and locked stock before writing anything.
    FOR i IN 0..items.get_size-1 LOOP
      item:=TREAT(items.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(item,'productId,quantity,unitPrice');product_value:=alliance_security.text_value(item,'productId',36);quantity_value:=alliance_operations.numeric_value(item,'quantity',1,10000);
      IF MOD(quantity_value,1)<>0 OR seen.has(product_value) THEN alliance_security.fail(400,'INVALID_INPUT','Revisa las cantidades y los productos repetidos.');END IF;seen.put(product_value,TRUE);
      menu:=alliance_pos_store.document(b,l,'menu_items',product_value);
      SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_recipes' AND id=product_value;
      IF menu IS NULL OR n>0 THEN alliance_security.fail(409,'PRODUCT_UNAVAILABLE','Un producto ya no esta disponible. Revisa tu pedido.');END IF;
      BEGIN SELECT p.price_minor/100,p.active,s.stock INTO price_value,active_value,stock_value FROM products p JOIN alliance_pos_stock s ON s.business_id=p.business_id AND s.product_id=p.id WHERE p.business_id=b AND p.id=product_value AND s.location_id=l FOR UPDATE OF s.stock;
      EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'PRODUCT_UNAVAILABLE','Un producto ya no esta disponible.');END;
      IF active_value<>1 OR NOT NVL(menu.get_boolean('is_available'),TRUE) OR price_value<=0 OR stock_value<quantity_value THEN alliance_security.fail(409,'INSUFFICIENT_STOCK','No quedan suficientes unidades de '||SUBSTR(menu.get_string('name'),1,90)||'. Revisa tu pedido.');END IF;
      IF price_value<>alliance_operations.numeric_value(item,'unitPrice',0.01) THEN alliance_security.fail(409,'PRICE_CHANGED','Cambio el precio de un producto. Revisa el total antes de confirmar.');END IF;
    END LOOP;
    alliance_security.throttle('gcobarf-order-ip:'||NVL(OWA_UTIL.get_cgi_env('REMOTE_ADDR'),'unknown'),25);
    alliance_security.throttle('gcobarf-order-phone:'||phone_value,8);
    -- Existing operational ledgers require an actor; retain the public source explicitly.
    BEGIN SELECT usr.id INTO u FROM users usr WHERE usr.business_id=b AND usr.active=1 AND EXISTS(SELECT 1 FROM user_location_roles role_row WHERE role_row.business_id=b AND role_row.user_id=usr.id AND (role_row.role_code='OWNER' OR (role_row.location_id=l AND role_row.role_code='BOSS'))) ORDER BY usr.id FETCH FIRST 1 ROW ONLY;
    EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(503,'STORE_UNAVAILABLE','El negocio no puede recibir pedidos en este momento.');END;
    FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_customers' AND JSON_VALUE(data_json,'$.active')='true' AND LOWER(TRIM(JSON_VALUE(data_json,'$.name')))=LOWER(name_value) AND REGEXP_REPLACE(JSON_VALUE(data_json,'$.phone'),'[^0-9]','')=phone_value ORDER BY id FETCH FIRST 1 ROW ONLY) LOOP customer_id:=x.id;END LOOP;
    IF customer_id IS NULL THEN
      customer_id:=alliance_security.new_id;customer:=JSON_OBJECT_T();customer.put('id',customer_id);customer.put('name',name_value);customer.put('phone',phone_value);customer.put('document','');customer.put('active',TRUE);customer.put('contactConsent',TRUE);customer.put('allowCredit',TRUE);customer.put('creditLimit',0);customer.put('paymentFrequency','once');customer.put('paymentDate','');customer.put('revision',1);customer.put('source','online');alliance_operations.put_row(u,b,l,'customers',customer_id,customer);
    END IF;
    sid:=alliance_security.new_id;account:=JSON_OBJECT_T();account.put('id',sid);account.put_null('table_id');account.put('status','open');account.put('sale_channel','walk_in');account.put('assigned_waiter_id',u);account.put('customer_id',customer_id);account.put('payer_name',name_value);account.put('delivery_date',date_value);account.put('delivery_time',time_value);account.put('opened_at',alliance_pos_store.stamp);account.put('source','online');account.put('order_phone',phone_value);account.put('delivery_mode',mode_value);account.put('delivery_address',address_value);account.put('delivery_city',city_value);account.put('delivery_neighborhood',neighborhood_value);account.put('order_notes',notes_value);alliance_pos_store.put_document(b,l,'table_sessions',sid,account);
    FOR i IN 0..items.get_size-1 LOOP
      item:=TREAT(items.get(i) AS JSON_OBJECT_T);menu:=alliance_pos_store.document(b,l,'menu_items',item.get_string('productId'));line:=JSON_OBJECT_T();line.put('id',alliance_security.new_id);line.put('session_id',sid);line.put('menu_item_id',item.get_string('productId'));line.put('item_name',menu.get_string('name'));line.put('quantity',item.get_number('quantity'));line.put('unit_price',item.get_number('unitPrice'));line.put('status','confirmed');line.put('source','online');line.put('notes',notes_value);line.put('created_by_user_id',u);line.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(b,l,'session_items',line.get_string('id'),line);
    END LOOP;
    alliance_production.reconcile(u,b,l);alliance_pos_store.reconcile_session(u,b,l,sid);
    order_row:=JSON_OBJECT_T();order_row.put('sessionId',sid);order_row.put('number','GCO-'||UPPER(SUBSTR(REPLACE(sid,'-',''),1,12)));order_row.put('fingerprint',fingerprint);alliance_pos_store.put_document(b,l,'op_onlineorders',order_key,order_row);
    alliance_pos_store.audit(u,b,'GCOBARF_ONLINE_ORDER',sid,NULL,account.to_clob);RETURN receipt(b,l,order_row);
  END;
END;
/
