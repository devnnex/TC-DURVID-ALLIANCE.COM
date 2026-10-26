CREATE OR REPLACE PACKAGE alliance_operations_sales AUTHID DEFINER AS
  FUNCTION recipe_for(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION recipe_cost(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN NUMBER;
  PROCEDURE guard_recipes(b VARCHAR2,l VARCHAR2,expected JSON_OBJECT_T);
  PROCEDURE after_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice IN OUT JSON_OBJECT_T);
  PROCEDURE reverse_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T);
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_operations_sales AS
  FUNCTION recipe_for(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN JSON_OBJECT_T IS BEGIN RETURN alliance_operations.get_row(b,l,'recipes',product);END;
  PROCEDURE guard_recipes(b VARCHAR2,l VARCHAR2,expected JSON_OBJECT_T) IS fields JSON_KEY_LIST;current JSON_OBJECT_T;previous_recipe JSON_OBJECT_T;old_lines JSON_ARRAY_T;new_lines JSON_ARRAY_T;a JSON_OBJECT_T;c JSON_OBJECT_T;BEGIN
    IF expected IS NULL THEN RETURN;END IF;fields:=expected.get_keys;IF fields.COUNT>500 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados productos.');END IF;
    FOR i IN 1..fields.COUNT LOOP current:=recipe_for(b,l,fields(i));
      IF expected.get(fields(i)).is_null THEN IF current IS NOT NULL THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;
      ELSE IF NOT expected.get(fields(i)).is_object THEN alliance_security.fail(400,'INVALID_INPUT','Receta esperada inválida.');END IF;previous_recipe:=expected.get_object(fields(i));old_lines:=previous_recipe.get_array('lines');IF old_lines IS NULL OR previous_recipe.get_string('recipeId') IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Receta esperada incompleta.');END IF;
        IF current IS NULL THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;new_lines:=current.get_array('lines');IF current.get_string('recipeId')<>previous_recipe.get_string('recipeId') OR new_lines.get_size<>old_lines.get_size THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;
        FOR j IN 0..old_lines.get_size-1 LOOP a:=TREAT(old_lines.get(j) AS JSON_OBJECT_T);c:=TREAT(new_lines.get(j) AS JSON_OBJECT_T);IF a.get_string('ingredientId') IS NULL OR a.get_string('unit') IS NULL OR a.get_number('quantity') IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Ingrediente esperado incompleto.');END IF;IF a.get_string('ingredientId')<>c.get_string('ingredientId') OR a.get_string('unit')<>c.get_string('unit') OR ABS(a.get_number('quantity')-c.get_number('quantity'))>0.00000001 THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;END LOOP;
      END IF;
    END LOOP;
  END;
  FUNCTION recipe_cost(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN NUMBER IS recipe JSON_OBJECT_T;lines JSON_ARRAY_T;o JSON_OBJECT_T;ingredient JSON_OBJECT_T;total NUMBER:=0;BEGIN
    recipe:=recipe_for(b,l,product);IF recipe IS NULL THEN RETURN NULL;END IF;lines:=recipe.get_array('lines');
    FOR i IN 0..lines.get_size-1 LOOP o:=TREAT(lines.get(i) AS JSON_OBJECT_T);ingredient:=alliance_operations.raw_item(b,l,o.get_string('ingredientId'));total:=total+alliance_operations.convert_quantity(o.get_number('quantity'),o.get_string('unit'),ingredient.get_string('unit'))*ingredient.get_number('unitCost');END LOOP;RETURN ROUND(total+NVL(recipe.get_number('overheadCost'),0),2);
  END;
  PROCEDURE after_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice IN OUT JSON_OBJECT_T) IS
    lines JSON_ARRAY_T:=invoice.get_array('items');payments JSON_ARRAY_T:=invoice.get_array('payments');line JSON_OBJECT_T;pay JSON_OBJECT_T;recipe JSON_OBJECT_T;parts JSON_ARRAY_T;part JSON_OBJECT_T;ingredient JSON_OBJECT_T;customer JSON_OBJECT_T;debt JSON_OBJECT_T;cash_session JSON_OBJECT_T;settings JSON_OBJECT_T;
    quantity_value NUMBER;credit_value NUMBER:=0;cash_value NUMBER:=0;owed NUMBER;customer_id VARCHAR2(80):=invoice.get_string('customerId');sale_id VARCHAR2(80):=invoice.get_string('id');due_value VARCHAR2(10);date_check DATE;
  BEGIN
    IF customer_id IS NOT NULL THEN customer:=alliance_operations.get_row(b,l,'customers',customer_id);IF customer IS NULL OR NOT customer.get_boolean('active') THEN alliance_security.fail(403,'CUSTOMER_MISSING','Cliente no disponible en esta sucursal.');END IF;invoice.put('customerName',customer.get_string('name'));invoice.put('payerName',customer.get_string('name'));END IF;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')='credit' THEN credit_value:=credit_value+pay.get_number('amount');ELSIF pay.get_string('method')='cash' THEN cash_value:=cash_value+pay.get_number('amount');END IF;END LOOP;
    IF credit_value>0 THEN
      IF customer IS NULL THEN alliance_security.fail(403,'CREDIT_DISABLED','Selecciona un cliente con credito habilitado por el jefe.');END IF;
      SELECT NVL(SUM(JSON_VALUE(data_json,'$.total' RETURNING NUMBER)-JSON_VALUE(data_json,'$.paid' RETURNING NUMBER)),0) INTO owed FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_debts' AND JSON_VALUE(data_json,'$.customerId')=customer_id AND NVL(JSON_VALUE(data_json,'$.voided'),'false')<>'true';
      IF customer.get_number('creditLimit')>0 AND owed+credit_value>customer.get_number('creditLimit') THEN alliance_security.fail(409,'CREDIT_LIMIT','La venta supera el limite de credito disponible.');END IF;
      due_value:=alliance_security.text_value(invoice,'creditDueDate',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');BEGIN date_check:=TO_DATE(due_value,'FXYYYY-MM-DD');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha de vencimiento.');END;
      debt:=JSON_OBJECT_T();debt.put('customerId',customer_id);debt.put('customerName',customer.get_string('name'));debt.put('total',ROUND(credit_value,2));debt.put('paid',0);debt.put('dueDate',due_value);debt.put('reference',invoice.get_string('number'));debt.put('source','sale');debt.put('saleId',sale_id);alliance_operations.put_row(u,b,l,'debts',sale_id,debt);
    END IF;
    cash_session:=alliance_operations.open_cash(b,l);settings:=alliance_operations.get_row(b,l,'settings','primary');IF cash_session IS NULL AND settings IS NOT NULL AND settings.get_boolean('cashRequired') THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','Abre la caja antes de registrar una venta.');END IF;IF cash_session IS NOT NULL THEN invoice.put('cashSessionId',cash_session.get_string('id'));END IF;
    alliance_operations.cash_entry(u,b,l,alliance_security.new_id,cash_value,'cash',sale_id);
    FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);recipe:=recipe_for(b,l,line.get_string('menu_item_id'));IF recipe IS NOT NULL THEN
      line.put('recipeId',recipe.get_string('recipeId'));parts:=recipe.get_array('lines');line.put('recipeConsumption',parts);lines.put(i,line,TRUE);
      FOR j IN 0..parts.get_size-1 LOOP part:=TREAT(parts.get(j) AS JSON_OBJECT_T);ingredient:=alliance_operations.raw_item(b,l,part.get_string('ingredientId'));quantity_value:=alliance_operations.convert_quantity(part.get_number('quantity'),part.get_string('unit'),ingredient.get_string('unit'))*line.get_number('quantity');
        IF recipe.get_boolean('managed') AND quantity_value>ingredient.get_number('quantity')+0.00000001 THEN alliance_security.fail(409,'MATERIALS_INSUFFICIENT','No alcanza '||ingredient.get_string('name')||'. Abastece la macro de insumos.');END IF;
        alliance_operations.raw_move(u,b,l,alliance_security.new_id,ingredient.get_string('id'),-quantity_value,'sale',sale_id);
      END LOOP;
    END IF;END LOOP;alliance_materials.guard_open(b,l,invoice.get_string('sessionId'));invoice.put('items',lines);
  END;
  PROCEDURE reverse_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T) IS debt JSON_OBJECT_T;payments JSON_ARRAY_T:=invoice.get_array('payments');pay JSON_OBJECT_T;sale_id VARCHAR2(80):=invoice.get_string('id');cash_value NUMBER:=0;BEGIN
    debt:=alliance_operations.get_row(b,l,'debts',sale_id);IF debt IS NOT NULL THEN IF debt.get_number('paid')>0 THEN alliance_security.fail(409,'CREDIT_ALREADY_PAID','La venta tiene abonos. Revisa la cartera antes de anular o corregir.');END IF;debt.put('voided',TRUE);alliance_operations.put_row(u,b,l,'debts',sale_id,debt);END IF;
    FOR x IN(SELECT ingredient_id,SUM(delta) delta FROM alliance_raw_movements WHERE business_id=b AND location_id=l AND reference=sale_id AND kind IN('sale','return') GROUP BY ingredient_id HAVING SUM(delta)<0) LOOP alliance_operations.raw_move(u,b,l,alliance_security.new_id,x.ingredient_id,-x.delta,'return',sale_id);END LOOP;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')='cash' THEN cash_value:=cash_value+pay.get_number('amount');END IF;END LOOP;alliance_operations.cash_entry(u,b,l,alliance_security.new_id,-cash_value,'cash',sale_id);
  END;
END;
/
