CREATE OR REPLACE PACKAGE alliance_pos_finance AUTHID DEFINER AS
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_pos_finance AS
  -- One output-product movement, with its immutable ingredient breakdown. Never debit stock here.
  PROCEDURE recipe_entries(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T,reversing BOOLEAN DEFAULT FALSE) IS
    lines JSON_ARRAY_T:=invoice.get_array('items');parts JSON_ARRAY_T;line JSON_OBJECT_T;part JSON_OBJECT_T;ingredient JSON_OBJECT_T;detail JSON_OBJECT_T;entries JSON_OBJECT_T;entry JSON_OBJECT_T;ingredients JSON_ARRAY_T;keys JSON_KEY_LIST;
    event_id VARCHAR2(160);ingredient_id VARCHAR2(80);quantity_value NUMBER;body CLOB:=lines.to_clob;n NUMBER;reference_value VARCHAR2(160):=SUBSTR(invoice.get_string('number'),1,160);session_value VARCHAR2(80):=invoice.get_string('sessionId');movement_delta NUMBER;movement_kind VARCHAR2(40);
  BEGIN
    FOR x IN(SELECT product_key,SUM(qty) qty,SUM(qty*unit_cost)/SUM(qty) cost FROM JSON_TABLE(body,'$[*]' COLUMNS(product_key VARCHAR2(36) PATH '$.menu_item_id',recipe_key VARCHAR2(80) PATH '$.recipeId',qty NUMBER PATH '$.quantity',unit_cost NUMBER PATH '$.unit_cost')) WHERE product_key IS NOT NULL AND recipe_key IS NOT NULL GROUP BY product_key) LOOP
      event_id:=CASE WHEN reversing THEN alliance_security.new_id ELSE 'SALE-'||invoice.get_string('id')||'-'||x.product_key END;
      SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=b AND location_id=l AND id=event_id;IF n>0 THEN CONTINUE;END IF;
      entries:=JSON_OBJECT_T();
      FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);IF line.get_string('menu_item_id')=x.product_key AND line.has('recipeConsumption') THEN
        parts:=line.get_array('recipeConsumption');FOR j IN 0..parts.get_size-1 LOOP part:=TREAT(parts.get(j) AS JSON_OBJECT_T);ingredient_id:=part.get_string('ingredientId');ingredient:=alliance_operations.raw_item(b,l,ingredient_id);
          quantity_value:=alliance_operations.convert_quantity(part.get_number('quantity'),part.get_string('unit'),ingredient.get_string('unit'))*line.get_number('quantity');
          IF entries.has(ingredient_id) THEN entry:=entries.get_object(ingredient_id);quantity_value:=quantity_value+entry.get_number('quantity');ELSE entry:=JSON_OBJECT_T();entry.put('ingredientId',ingredient_id);entry.put('name',ingredient.get_string('name'));entry.put('unit',ingredient.get_string('unit'));END IF;entry.put('quantity',quantity_value);entries.put(ingredient_id,entry);
        END LOOP;END IF;END LOOP;
      ingredients:=JSON_ARRAY_T();keys:=entries.get_keys;FOR i IN 1..keys.COUNT LOOP ingredients.append(entries.get_object(keys(i)));END LOOP;detail:=JSON_OBJECT_T();detail.put('movementId',event_id);detail.put('ingredients',ingredients);
      movement_delta:=CASE WHEN reversing THEN x.qty ELSE -x.qty END;movement_kind:=CASE WHEN reversing THEN 'DEVOLUCION_VENTA_RECETA' ELSE 'SALIDA_VENTA_RECETA' END;
      INSERT INTO alliance_pos_movements(business_id,location_id,id,product_id,actor_user_id,delta,stock_before,stock_after,cost_minor,kind,reference,session_id,allow_negative)VALUES(b,l,event_id,x.product_key,u,movement_delta,0,0,ROUND(NVL(x.cost,0)*100),movement_kind,reference_value,session_value,0);
      alliance_pos_store.put_document(b,l,'op_movementdetail',alliance_security.hash_text(event_id),detail);
    END LOOP;
  END;
  FUNCTION save_sale(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_invoice JSON_OBJECT_T,p_edit BOOLEAN DEFAULT FALSE,p_expected JSON_OBJECT_T DEFAULT NULL) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();invoice JSON_OBJECT_T:=JSON_OBJECT_T(p_invoice.to_clob);lines JSON_ARRAY_T;line JSON_OBJECT_T;totals JSON_OBJECT_T;payments JSON_ARRAY_T;pay JSON_OBJECT_T;session_json JSON_OBJECT_T;old_invoice JSON_OBJECT_T;
    sale_id VARCHAR2(80);session_value VARCHAR2(80);product_value VARCHAR2(36);fingerprint VARCHAR2(64);previous_hash VARCHAR2(64);json_text CLOB;old_text CLOB;n NUMBER;quantity_value NUMBER;price_value NUMBER;cost_value NUMBER;subtotal_value NUMBER:=0;cost_total NUMBER:=0;payment_total NUMBER:=0;total_value NUMBER;discount_value NUMBER;tax_value NUMBER;fee_value NUMBER;tip_value NUMBER;already_adjusted NUMBER;delta_value NUMBER;kind_value VARCHAR2(40);void_value NUMBER;effective_user VARCHAR2(160);stored_line JSON_OBJECT_T;seen_lines JSON_OBJECT_T:=JSON_OBJECT_T();line_id VARCHAR2(80);table_sale BOOLEAN:=FALSE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'sales.write');alliance_pos_store.lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'sales.write');
    sale_id:=alliance_security.text_value(invoice,'id',80);session_value:=alliance_security.text_value(invoice,'sessionId',80);
    SELECT COUNT(*) INTO n FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND (id=sale_id OR session_id=session_value);
    IF n>0 AND NOT p_edit THEN
      SELECT invoice_json INTO old_text FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND (id=sale_id OR session_id=session_value);old_invoice:=JSON_OBJECT_T(old_text);
      IF old_invoice.get_string('id')<>sale_id OR old_invoice.get_array('items').to_string<>invoice.get_array('items').to_string OR old_invoice.get_object('totals').to_string<>invoice.get_object('totals').to_string OR old_invoice.get_array('payments').to_string<>invoice.get_array('payments').to_string THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La cuenta ya se cobro con otros datos.');END IF;
      r.put('duplicate',TRUE);r.put('ok',TRUE);r.put('saleId',sale_id);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
    END IF;
    alliance_operations_sales.guard_recipes(p_business,p_location,p_expected);
    IF p_edit THEN
      IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede corregir una venta.');END IF;
      IF n<>1 THEN alliance_security.fail(404,'NOT_FOUND','Venta no disponible.');END IF;
      SELECT invoice_json,voided INTO old_text,void_value FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND id=sale_id;IF void_value=1 THEN alliance_security.fail(409,'VOIDED','La venta esta anulada.');END IF;
      old_invoice:=JSON_OBJECT_T(old_text);alliance_operations_sales.reverse_sale(p_user,p_business,p_location,old_invoice);lines:=old_invoice.get_array('items');
      FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);product_value:=line.get_string('menu_item_id');IF product_value IS NOT NULL AND line.get_string('recipeId') IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,alliance_security.new_id,product_value,line.get_number('quantity'),'DEVOLUCION_CORRECCION',sale_id,session_value);END IF;END LOOP;recipe_entries(p_user,p_business,p_location,old_invoice,TRUE);
    ELSE
      session_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);
      IF session_json IS NOT NULL THEN
        IF session_json.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;table_sale:=TRUE;invoice.put('saleChannel','table');
      ELSIF NVL(invoice.get_string('saleChannel'),'table')<>'walk_in' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;
    END IF;
    lines:=invoice.get_array('items');totals:=invoice.get_object('totals');payments:=invoice.get_array('payments');
    IF lines IS NULL OR lines.get_size<1 OR lines.get_size>300 OR payments IS NULL OR payments.get_size<1 OR payments.get_size>10 THEN alliance_security.fail(400,'INVALID_INPUT','Venta incompleta.');END IF;
    IF table_sale THEN
      SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=session_value AND NVL(JSON_VALUE(data_json,'$.status'),'confirmed')<>'cancelled';
      IF n<>lines.get_size THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta cambio. Actualiza sus consumos antes de cobrar.');END IF;
    END IF;
    FOR i IN 0..lines.get_size-1 LOOP
      line:=TREAT(lines.get(i) AS JSON_OBJECT_T);quantity_value:=line.get_number('quantity');price_value:=ROUND(line.get_number('unit_price')*100);
      IF table_sale THEN
        line_id:=line.get_string('id');stored_line:=alliance_pos_store.document(p_business,p_location,'session_items',line_id);
        IF stored_line IS NULL OR seen_lines.has(line_id) THEN alliance_security.fail(409,'ACCOUNT_CHANGED','Consumo inexistente o repetido.');END IF;seen_lines.put(line_id,TRUE);
        IF stored_line.get_string('session_id')<>session_value OR stored_line.get_string('status')='cancelled' OR NVL(stored_line.get_string('menu_item_id'),'manual')<>NVL(line.get_string('menu_item_id'),'manual') OR stored_line.get_number('quantity')<>quantity_value OR ROUND(stored_line.get_number('unit_price')*100)<>price_value THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta cambio. Actualiza sus consumos antes de cobrar.');END IF;
      END IF;
      IF quantity_value IS NULL OR quantity_value<=0 OR quantity_value>10000 OR price_value IS NULL OR price_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Producto o cantidad invalida.');END IF;
      product_value:=line.get_string('menu_item_id');cost_value:=0;
      IF product_value IS NOT NULL THEN
        SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='menu_items' AND id=product_value;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Producto de otra sucursal o no disponible.');END IF;
        cost_value:=alliance_operations_sales.recipe_cost(p_business,p_location,product_value);IF cost_value IS NOT NULL THEN cost_value:=ROUND(cost_value*100);ELSE BEGIN SELECT cost_minor INTO cost_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=product_value;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Configura el inventario antes de cobrar.');END;END IF;
      END IF;
      line.put('unit_cost',cost_value/100);line.put('unit_price',price_value/100);lines.put(i,line,TRUE);
      subtotal_value:=subtotal_value+ROUND(quantity_value*price_value);cost_total:=cost_total+ROUND(quantity_value*cost_value);
    END LOOP;
    discount_value:=ROUND(NVL(totals.get_number('discount'),0)*100);tax_value:=ROUND(NVL(totals.get_number('tax'),0)*100);fee_value:=ROUND(NVL(totals.get_number('serviceFee'),0)*100);tip_value:=ROUND(NVL(totals.get_number('tip'),0)*100);
    total_value:=subtotal_value-discount_value+tax_value+fee_value+tip_value;
    IF discount_value<0 OR discount_value>subtotal_value OR tax_value<0 OR fee_value<0 OR tip_value<0 OR total_value<>ROUND(totals.get_number('total')*100) OR subtotal_value<>ROUND(totals.get_number('subtotal')*100) THEN alliance_security.fail(400,'INVALID_TOTAL','El total no coincide con los productos.');END IF;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);price_value:=ROUND(pay.get_number('amount')*100);
      IF price_value IS NULL OR price_value<0 OR pay.get_string('method') NOT IN('cash','transfer','breb','card','other','credit') THEN alliance_security.fail(400,'INVALID_PAYMENT','Pago invalido.');END IF;payment_total:=payment_total+price_value;
    END LOOP;IF payment_total<>total_value THEN alliance_security.fail(400,'INVALID_PAYMENT','Los pagos no coinciden con el total.');END IF;
    -- Aggregate by product so a duplicate line cannot debit the same stock twice.
    json_text:=lines.to_clob;
    FOR x IN(SELECT product_key,SUM(qty) quantity_sum,SUM(qty*unit_cost)/SUM(qty) unit_cost FROM JSON_TABLE(json_text,'$[*]' COLUMNS(product_key VARCHAR2(36) PATH '$.menu_item_id',qty NUMBER PATH '$.quantity',unit_cost NUMBER PATH '$.unit_cost')) WHERE product_key IS NOT NULL GROUP BY product_key) LOOP
      product_value:=x.product_key;quantity_value:=x.quantity_sum;already_adjusted:=0;IF NOT p_edit THEN SELECT NVL(-SUM(delta),0) INTO already_adjusted FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND product_id=product_value AND session_id=session_value AND kind IN('CONSUMO_MESA','DEVOLUCION_CONSUMO');END IF;
      delta_value:=GREATEST(0,already_adjusted)-quantity_value;kind_value:=CASE WHEN delta_value<=0 THEN 'SALIDA_VENTA' ELSE 'DEVOLUCION_VENTA' END;
      IF delta_value<>0 AND alliance_operations_sales.recipe_for(p_business,p_location,product_value) IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,CASE WHEN p_edit THEN alliance_security.new_id ELSE 'SALE-'||sale_id||'-'||product_value END,product_value,delta_value,kind_value,invoice.get_string('number'),session_value);END IF;
    END LOOP;
    alliance_operations_sales.after_sale(p_user,p_business,p_location,invoice);lines:=invoice.get_array('items');recipe_entries(p_user,p_business,p_location,invoice);
    SELECT full_name INTO effective_user FROM users WHERE business_id=p_business AND id=p_user;invoice.put('soldByUserId',p_user);invoice.put('waiterName',effective_user);invoice.put('items',lines);json_text:=invoice.to_clob;
    IF p_edit THEN UPDATE alliance_pos_sales SET invoice_json=json_text,total_minor=total_value,subtotal_minor=subtotal_value,cost_minor=cost_total WHERE business_id=p_business AND location_id=p_location AND id=sale_id;
    ELSE INSERT INTO alliance_pos_sales(business_id,location_id,id,session_id,actor_user_id,invoice_json,total_minor,subtotal_minor,cost_minor)VALUES(p_business,p_location,sale_id,session_value,p_user,json_text,total_value,subtotal_value,cost_total);END IF;
    session_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);
    IF session_json IS NOT NULL THEN session_json.put('status','closed');session_json.put('closed_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'table_sessions',session_value,session_json);END IF;
    FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='service_requests' AND JSON_VALUE(data_json,'$.session_id')=session_value) LOOP session_json:=JSON_OBJECT_T(x.data_json);session_json.put('status','resolved');alliance_pos_store.put_document(p_business,p_location,'service_requests',x.id,session_json);END LOOP;
    alliance_pos_store.reconcile_session(p_user,p_business,p_location,session_value);
    alliance_pos_store.audit(p_user,p_business,CASE WHEN p_edit THEN 'POS_SALE_EDIT' ELSE 'POS_SALE' END,sale_id,old_text,json_text);
    r.put('duplicate',FALSE);r.put('ok',TRUE);r.put('saleId',sale_id);r.put('archivedSessionId',session_value);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
  END;
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();arr JSON_ARRAY_T:=JSON_ARRAY_T();record_json JSON_OBJECT_T;invoice JSON_OBJECT_T;lines JSON_ARRAY_T;line JSON_OBJECT_T;payments JSON_ARRAY_T;pay JSON_OBJECT_T;line_out JSON_OBJECT_T;totals JSON_OBJECT_T:=JSON_OBJECT_T();invoice_totals JSON_OBJECT_T;
    from_stamp TIMESTAMP WITH TIME ZONE;to_stamp TIMESTAMP WITH TIME ZONE;cursor_stamp TIMESTAMP WITH TIME ZONE;cursor_id VARCHAR2(160);cursor_json JSON_OBJECT_T;next_json JSON_OBJECT_T;has_more BOOLEAN:=FALSE;
    from_value VARCHAR2(10);to_value VARCHAR2(10);date_value VARCHAR2(10);method_value VARCHAR2(20):=NVL(p_payload.get_string('paymentMethod'),'all');query_value VARCHAR2(200):=LOWER(p_payload.get_string('query'));sale_id VARCHAR2(80);sale_type VARCHAR2(20):=NVL(p_payload.get_string('saleType'),'all');json_text CLOB;n NUMBER;value NUMBER;match_value BOOLEAN;cost_total NUMBER;fields JSON_KEY_LIST;user_name VARCHAR2(160);history JSON_OBJECT_T;movement_cutoff TIMESTAMP WITH TIME ZONE;income_cutoff TIMESTAMP WITH TIME ZONE;
  BEGIN
    history:=alliance_pos_store.document(p_business,p_location,'configuration','history');IF history IS NOT NULL THEN
      IF history.has('movements_cutoff') THEN movement_cutoff:=FROM_TZ(TO_TIMESTAMP(history.get_string('movements_cutoff'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
      IF history.has('income_cutoff') THEN income_cutoff:=FROM_TZ(TO_TIMESTAMP(history.get_string('income_cutoff'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
    ELSE history:=JSON_OBJECT_T();END IF;
    IF p_action='clear_income' THEN alliance_pos_store.lock_scope(p_business,p_location);IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede reiniciar el historial.');END IF;history.put('income_cutoff',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'configuration','history',history);alliance_pos_store.audit(p_user,p_business,'POS_SALES_ARCHIVE',p_location,NULL,history.to_clob);r.put('ok',TRUE);r.put('cleared',TRUE);RETURN r;END IF;
    IF p_action IN('record_sale','edit_sale') THEN RETURN save_sale(p_user,p_business,p_location,p_payload.get_object('invoice'),p_action='edit_sale',p_payload.get_object('expected_recipes'));END IF;
    IF p_action='delete_sale' THEN
      alliance_pos_store.lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'sales.write');IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede anular ventas.');END IF;
      sale_id:=p_payload.get_string('saleId');BEGIN SELECT invoice_json,voided INTO json_text,n FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND id=sale_id;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Venta no disponible.');END;
      IF n=0 THEN invoice:=JSON_OBJECT_T(json_text);alliance_operations_sales.reverse_sale(p_user,p_business,p_location,invoice);lines:=invoice.get_array('items');FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);IF line.get_string('menu_item_id') IS NOT NULL AND line.get_string('recipeId') IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,'VOID-'||sale_id||'-'||TO_CHAR(i),line.get_string('menu_item_id'),line.get_number('quantity'),'DEVOLUCION_VENTA',sale_id,invoice.get_string('sessionId'));END IF;END LOOP;recipe_entries(p_user,p_business,p_location,invoice,TRUE);
        UPDATE alliance_pos_sales SET voided=1 WHERE business_id=p_business AND location_id=p_location AND id=sale_id;alliance_pos_store.audit(p_user,p_business,'POS_SALE_VOID',sale_id,json_text,p_payload.to_clob);
      END IF;r.put('ok',TRUE);r.put('saleId',sale_id);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
    END IF;
    IF p_action='get_inventory_movements' THEN
      alliance_security.require_location(p_user,p_business,p_location,'movements.read');
      IF p_payload.has('cursor') AND NOT p_payload.get('cursor').is_null THEN cursor_json:=p_payload.get_object('cursor');cursor_id:=cursor_json.get_string('id');BEGIN cursor_stamp:=FROM_TZ(TO_TIMESTAMP(cursor_json.get_string('at'),'YYYY-MM-DD"T"HH24:MI:SS.FF9"Z"'),'UTC');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la página de movimientos.');END;END IF;
      FOR x IN(SELECT m.*,p.name,u.full_name,s.code,d.data_json movement_detail FROM alliance_pos_movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id JOIN users u ON u.id=m.actor_user_id AND u.business_id=m.business_id LEFT JOIN alliance_pos_stock s ON s.business_id=m.business_id AND s.location_id=m.location_id AND s.product_id=m.product_id LEFT JOIN alliance_pos_documents d ON d.business_id=m.business_id AND d.location_id=m.location_id AND d.entity='op_movementdetail' AND d.id=alliance_security.hash_text(m.id) WHERE m.business_id=p_business AND m.location_id=p_location AND (movement_cutoff IS NULL OR m.created_at>movement_cutoff) AND (cursor_stamp IS NULL OR m.created_at<cursor_stamp OR (m.created_at=cursor_stamp AND m.id<cursor_id)) ORDER BY m.created_at DESC,m.id DESC FETCH FIRST 801 ROWS ONLY) LOOP
        IF arr.get_size=800 THEN has_more:=TRUE;EXIT;END IF;next_json:=JSON_OBJECT_T();next_json.put('id',x.id);next_json.put('at',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF9"Z"'));
        record_json:=JSON_OBJECT_T();record_json.put('movementId',x.id);record_json.put('productId',x.product_id);record_json.put('code',x.code);record_json.put('product',x.name);record_json.put('type',x.kind);record_json.put('delta',x.delta);record_json.put('before',x.stock_before);record_json.put('after',x.stock_after);record_json.put('unitCost',x.cost_minor/100);record_json.put('reference',x.reference);record_json.put('sessionId',x.session_id);record_json.put('date',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));record_json.put('user',x.full_name);IF x.kind IN('SALIDA_VENTA_RECETA','DEVOLUCION_VENTA_RECETA') THEN record_json.put('stockBasis','recipe');record_json.put_null('before');record_json.put_null('after');IF x.movement_detail IS NOT NULL THEN invoice:=JSON_OBJECT_T(x.movement_detail);record_json.put('ingredients',invoice.get_array('ingredients'));END IF;END IF;arr.append(record_json);
      END LOOP;r.put('ok',TRUE);r.put('movements',arr);r.put('hasMore',has_more);IF has_more THEN r.put('nextCursor',next_json);ELSE r.put_null('nextCursor');END IF;r.put('revision',alliance_pos_store.report_revision(p_business,p_location));RETURN r;
    END IF;
    IF p_action<>'get_income_report' THEN alliance_security.fail(400,'INVALID_INPUT','Accion no permitida.');END IF;
    alliance_security.require_location(p_user,p_business,p_location,'sales.read');from_value:=NVL(p_payload.get_string('dateFrom'),TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Bogota','YYYY-MM-DD'));to_value:=NVL(p_payload.get_string('dateTo'),from_value);
    IF NOT REGEXP_LIKE(from_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR NOT REGEXP_LIKE(to_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN alliance_security.fail(400,'INVALID_INPUT','Fechas invalidas.');END IF;
    BEGIN
      IF p_payload.get_string('startAt') IS NOT NULL THEN from_stamp:=FROM_TZ(TO_TIMESTAMP(p_payload.get_string('startAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
      IF p_payload.get_string('endAt') IS NOT NULL THEN to_stamp:=FROM_TZ(TO_TIMESTAMP(p_payload.get_string('endAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
    EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa el horario de ventas.');END;
    IF from_stamp IS NOT NULL AND to_stamp IS NOT NULL AND from_stamp>=to_stamp THEN alliance_security.fail(400,'INVALID_INPUT','El cierre debe ser posterior al inicio.');END IF;
    totals:=JSON_OBJECT_T('{"income":0,"sales":0,"subtotal":0,"discount":0,"tax":0,"service":0,"cost":0,"profit":0,"cash":0,"transfer":0,"breb":0,"other":0,"card":0,"credit":0,"received":0}');
    FOR x IN(SELECT * FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND voided=0 AND (income_cutoff IS NULL OR created_at>income_cutoff) ORDER BY created_at DESC,id) LOOP
      invoice:=JSON_OBJECT_T(x.invoice_json);date_value:=TO_CHAR(FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC') AT TIME ZONE 'America/Bogota','YYYY-MM-DD');
      IF date_value BETWEEN from_value AND to_value AND (from_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>=from_stamp) AND (to_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')<to_stamp) THEN
        payments:=invoice.get_array('payments');match_value:=method_value='all' OR (method_value='mixed' AND payments.get_size>1);
        FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')=method_value THEN match_value:=TRUE;END IF;END LOOP;
        IF sale_type<>'all' AND sale_type<>CASE WHEN invoice.get_string('saleChannel')='walk_in' THEN 'walk_in' ELSE 'table' END THEN match_value:=FALSE;END IF;
        IF query_value IS NOT NULL AND INSTR(LOWER(DBMS_LOB.SUBSTR(x.invoice_json,32000,1)),query_value)=0 THEN match_value:=FALSE;END IF;
        IF match_value THEN
          record_json:=JSON_OBJECT_T();record_json.put('saleId',x.id);record_json.put('invoice',invoice.get_string('number'));record_json.put('sessionId',x.session_id);record_json.put('table',invoice.get_string('table'));record_json.put('date',invoice.get_string('createdAt'));record_json.put('payer',invoice.get_string('payerName'));record_json.put('waiter',invoice.get_string('waiterName'));record_json.put('total',x.total_minor/100);record_json.put('subtotal',x.subtotal_minor/100);record_json.put('cost',x.cost_minor/100);record_json.put('profit',x.subtotal_minor/100-NVL(invoice.get_object('totals').get_number('discount'),0)-x.cost_minor/100);record_json.put('reference',invoice.get_string('reference'));record_json.put('isMixed',payments.get_size>1);record_json.put('payments',payments);
          invoice_totals:=invoice.get_object('totals');record_json.put('discount',NVL(invoice_totals.get_number('discount'),0));record_json.put('tax',NVL(invoice_totals.get_number('tax'),0));record_json.put('service',NVL(invoice_totals.get_number('serviceFee'),0));
          lines:=invoice.get_array('items');arr:=JSON_ARRAY_T();FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);line_out:=JSON_OBJECT_T();line_out.put('lineId',line.get_string('id'));line_out.put('menuItemId',line.get_string('menu_item_id'));line_out.put('name',line.get_string('item_name'));line_out.put('quantity',line.get_number('quantity'));line_out.put('unitPrice',line.get_number('unit_price'));value:=line.get_number('quantity')*line.get_number('unit_price');line_out.put('total',value);cost_total:=line.get_number('quantity')*line.get_number('unit_cost');line_out.put('cost',cost_total);line_out.put('profit',value-cost_total);arr.append(line_out);END LOOP;record_json.put('items',arr);
          IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;arr:=r.get_array('records');arr.append(record_json);r.put('records',arr);
          totals.put('sales',totals.get_number('sales')+1);totals.put('income',totals.get_number('income')+x.total_minor/100);totals.put('subtotal',totals.get_number('subtotal')+x.subtotal_minor/100);totals.put('cost',totals.get_number('cost')+x.cost_minor/100);totals.put('profit',totals.get_number('profit')+record_json.get_number('profit'));totals.put('discount',totals.get_number('discount')+record_json.get_number('discount'));totals.put('tax',totals.get_number('tax')+record_json.get_number('tax'));totals.put('service',totals.get_number('service')+record_json.get_number('service'));
          FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);method_value:=pay.get_string('method');IF method_value NOT IN('cash','transfer','breb','card','credit') THEN method_value:='other';END IF;totals.put(method_value,totals.get_number(method_value)+pay.get_number('amount'));IF method_value<>'credit' THEN totals.put('received',totals.get_number('received')+pay.get_number('amount'));END IF;END LOOP;method_value:=NVL(p_payload.get_string('paymentMethod'),'all');
        END IF;
      END IF;
    END LOOP;
    IF sale_type IN('all','collection') THEN
      FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='op_customerpayments' ORDER BY created_at DESC,id DESC) LOOP
        invoice:=JSON_OBJECT_T(x.data_json);json_text:=invoice.to_clob;date_value:=TO_CHAR(FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC') AT TIME ZONE 'America/Bogota','YYYY-MM-DD');
        IF date_value BETWEEN from_value AND to_value AND (income_cutoff IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>income_cutoff) AND (from_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>=from_stamp) AND (to_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')<to_stamp) THEN
          method_value:=NVL(p_payload.get_string('paymentMethod'),'all');payments:=invoice.get_array('payments');match_value:=method_value='all' OR (method_value='mixed' AND payments.get_size>1);FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')=method_value THEN match_value:=TRUE;END IF;END LOOP;
          IF query_value IS NOT NULL AND INSTR(LOWER(DBMS_LOB.SUBSTR(json_text,32000,1)),query_value)=0 THEN match_value:=FALSE;END IF;
          IF match_value THEN
            record_json:=JSON_OBJECT_T();record_json.put('saleId',x.id);record_json.put('recordType','collection');record_json.put('invoice',invoice.get_string('number'));record_json.put('sessionId',x.id);record_json.put('table',invoice.get_string('customerName'));record_json.put('date',invoice.get_string('createdAt'));record_json.put('payer',invoice.get_string('customerName'));record_json.put('waiter',invoice.get_string('actorName'));record_json.put('total',invoice.get_number('total'));record_json.put('subtotal',0);record_json.put('discount',0);record_json.put('tax',0);record_json.put('service',0);record_json.put('cost',0);record_json.put('profit',0);record_json.put('reference','Abono de cartera · venta ya registrada');record_json.put('isMixed',payments.get_size>1);record_json.put('payments',payments);record_json.put('items',JSON_ARRAY_T());
            IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;arr:=r.get_array('records');arr.append(record_json);r.put('records',arr);totals.put('collections',NVL(totals.get_number('collections'),0)+invoice.get_number('total'));
            FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);method_value:=pay.get_string('method');totals.put(method_value,NVL(totals.get_number(method_value),0)+pay.get_number('amount'));totals.put('received',totals.get_number('received')+pay.get_number('amount'));END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;
    IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;r.put('ok',TRUE);r.put('totals',totals);r.put('hasMore',FALSE);r.put_null('nextCursor');r.put('revision',alliance_pos_store.report_revision(p_business,p_location));r.put('generatedAt',alliance_pos_store.stamp);RETURN r;
  END;
END;
/
