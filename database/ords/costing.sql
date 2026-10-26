CREATE OR REPLACE PACKAGE alliance_costing AUTHID DEFINER AS
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_costing AS
  PROCEDURE numeric_value(o JSON_OBJECT_T,k VARCHAR2,lo NUMBER,hi NUMBER,optional BOOLEAN DEFAULT FALSE) IS n NUMBER;
  BEGIN
    IF NOT o.has(k) THEN alliance_security.fail(400,'COSTING_INPUT','Falta el campo '||k);END IF;
    IF o.get(k).is_null AND optional THEN RETURN;END IF;
    IF NOT o.get(k).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Numero invalido: '||k);END IF;
    n:=o.get_number(k);IF n<lo OR n>hi THEN alliance_security.fail(400,'COSTING_INPUT','Valor fuera del rango: '||k);END IF;
  END;
  PROCEDURE enum_value(o JSON_OBJECT_T,k VARCHAR2,allowed VARCHAR2) IS v VARCHAR2(100);
  BEGIN v:=o.get_string(k);IF v IS NULL OR INSTR(','||allowed||',',','||v||',')=0 THEN alliance_security.fail(400,'COSTING_INPUT','Opcion invalida: '||k);END IF;END;
  FUNCTION family(v VARCHAR2) RETURN VARCHAR2 IS
  BEGIN RETURN CASE WHEN v IN('g','kg') THEN 'mass' WHEN v IN('ml','l') THEN 'volume' WHEN v='unit' THEN 'count' ELSE NULL END;END;
  PROCEDURE flag(o JSON_OBJECT_T,k VARCHAR2) IS
  BEGIN IF NOT o.has(k) OR NOT o.get(k).is_boolean THEN alliance_security.fail(400,'COSTING_INPUT','Confirma la opcion '||k);END IF;END;
  PROCEDURE validate_model(m IN OUT JSON_OBJECT_T) IS
    s JSON_OBJECT_T;a JSON_ARRAY_T;rows_json JSON_ARRAY_T;row_json JSON_OBJECT_T;line_json JSON_OBJECT_T;ingredients_json JSON_ARRAY_T;recipes_json JSON_ARRAY_T;channels_json JSON_ARRAY_T;ingredient_json JSON_OBJECT_T;other_json JSON_OBJECT_T;ids CLOB;id_value VARCHAR2(80);found BOOLEAN;
  BEGIN
    alliance_security.keys_only(m,'settings,ingredients,expenses,channels,recipes');s:=m.get_object('settings');alliance_security.keys_only(s,'monthlyUnits,monthlyMinutes,taxRate,taxMode');
    numeric_value(s,'monthlyUnits',0.000001,1e12,TRUE);numeric_value(s,'monthlyMinutes',0.000001,1e12,TRUE);numeric_value(s,'taxRate',0,100);enum_value(s,'taxMode','included,added');
    ingredients_json:=m.get_array('ingredients');recipes_json:=m.get_array('recipes');channels_json:=m.get_array('channels');
    FOR section IN 1..4 LOOP
      a:=m.get_array(CASE section WHEN 1 THEN 'ingredients' WHEN 2 THEN 'expenses' WHEN 3 THEN 'channels' ELSE 'recipes' END);
      IF a IS NULL OR a.get_size>500 THEN alliance_security.fail(400,'COSTING_INPUT','Catalogo invalido o demasiado grande.');END IF;ids:=',';
      FOR i IN 0..a.get_size-1 LOOP
        row_json:=TREAT(a.get(i) AS JSON_OBJECT_T);id_value:=alliance_security.text_value(row_json,'id',80,'^[a-zA-Z0-9_-]+$');
        IF INSTR(ids,','||id_value||',')>0 THEN alliance_security.fail(400,'COSTING_INPUT','Identificador duplicado.');END IF;ids:=ids||id_value||',';
        id_value:=alliance_security.text_value(row_json,'name',160);
        IF section=1 THEN
          row_json.put('yieldPercent',100);a.put(i,row_json,TRUE);m.put('ingredients',a);
          alliance_security.keys_only(row_json,'id,name,unit,quantity,purchasePrice,yieldPercent,purchaseTaxRate,recoverableTax,purchaseDate,invoice');enum_value(row_json,'unit','g,kg,ml,l,unit');numeric_value(row_json,'quantity',0.000001,1e12);numeric_value(row_json,'purchasePrice',0,1e12);numeric_value(row_json,'yieldPercent',0.000001,100);numeric_value(row_json,'purchaseTaxRate',0,100);flag(row_json,'recoverableTax');IF row_json.has('invoice') AND (NOT row_json.get('invoice').is_string OR LENGTH(row_json.get_string('invoice'))>80) THEN alliance_security.fail(400,'COSTING_INPUT','Factura invalida.');END IF;IF row_json.get_string('purchaseDate') IS NOT NULL AND (NOT REGEXP_LIKE(row_json.get_string('purchaseDate'),'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR VALIDATE_CONVERSION(row_json.get_string('purchaseDate') AS DATE,'FXYYYY-MM-DD')=0) THEN alliance_security.fail(400,'COSTING_INPUT','Fecha de compra invalida.');END IF;
        ELSIF section=2 THEN
          alliance_security.keys_only(row_json,'id,name,amount,periodMonths,kind,allocation,recipeId,includedElsewhere');numeric_value(row_json,'amount',0,1e12);numeric_value(row_json,'periodMonths',0.000001,1e12);enum_value(row_json,'kind','fixed,unit,batch');IF row_json.get_string('kind')='batch' AND row_json.get_string('recipeId') IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Asigna el costo del lote a un producto.');END IF;enum_value(row_json,'allocation','units,minutes');flag(row_json,'includedElsewhere');
          FOR j IN 0..i-1 LOOP other_json:=TREAT(a.get(j) AS JSON_OBJECT_T);IF LOWER(TRIM(other_json.get_string('name')))=LOWER(TRIM(row_json.get_string('name'))) AND other_json.get_string('kind')=row_json.get_string('kind') AND NVL(other_json.get_string('recipeId'),'-')=NVL(row_json.get_string('recipeId'),'-') THEN alliance_security.fail(400,'COSTING_INPUT','Gasto duplicado: edita el existente.');END IF;END LOOP;
          IF row_json.get_string('recipeId') IS NOT NULL THEN found:=FALSE;FOR j IN 0..recipes_json.get_size-1 LOOP other_json:=TREAT(recipes_json.get(j) AS JSON_OBJECT_T);IF other_json.get_string('id')=row_json.get_string('recipeId') THEN found:=TRUE;END IF;END LOOP;IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Producto del gasto inexistente.');END IF;END IF;
        ELSIF section=3 THEN
          alliance_security.keys_only(row_json,'id,name,salesPercent,paymentPercent,flatFee,feeBase');numeric_value(row_json,'salesPercent',0,99.999);numeric_value(row_json,'paymentPercent',0,99.999);numeric_value(row_json,'flatFee',0,1e12);enum_value(row_json,'feeBase','net,gross');
        ELSE
          row_json.put('wastePercent',0);a.put(i,row_json,TRUE);m.put('recipes',a);
          alliance_security.keys_only(row_json,'id,name,size,category,output,wastePercent,minutes,monthlyUnits,currentPrice,targetPercent,marginMode,channelId,lines,pricingBasis,sheet');IF row_json.has('sheet') THEN alliance_jespresso.validate_sheet(row_json.get_object('sheet'));END IF;IF row_json.has('pricingBasis') THEN enum_value(row_json,'pricingBasis','full,production');END IF;numeric_value(row_json,'output',0.000001,1e12);numeric_value(row_json,'wastePercent',0,99.999);numeric_value(row_json,'minutes',0.000001,1e12,TRUE);numeric_value(row_json,'monthlyUnits',0.000001,1e12,TRUE);numeric_value(row_json,'currentPrice',0,1e12,TRUE);enum_value(row_json,'marginMode','margin,markup');numeric_value(row_json,'targetPercent',0,CASE WHEN row_json.get_string('marginMode')='markup' THEN 1000 ELSE 99.999 END);
          IF LENGTH(row_json.get_string('size'))>80 OR LENGTH(row_json.get_string('category'))>80 THEN alliance_security.fail(400,'COSTING_INPUT','Variante demasiado larga.');END IF;
          IF row_json.get_string('channelId') IS NOT NULL THEN found:=FALSE;FOR j IN 0..channels_json.get_size-1 LOOP other_json:=TREAT(channels_json.get(j) AS JSON_OBJECT_T);IF other_json.get_string('id')=row_json.get_string('channelId') THEN found:=TRUE;END IF;END LOOP;IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Canal inexistente.');END IF;END IF;
          rows_json:=row_json.get_array('lines');IF rows_json IS NULL OR rows_json.get_size>100 THEN alliance_security.fail(400,'COSTING_INPUT','Receta demasiado grande.');END IF;
          FOR j IN 0..rows_json.get_size-1 LOOP
            line_json:=TREAT(rows_json.get(j) AS JSON_OBJECT_T);alliance_security.keys_only(line_json,'ingredientId,quantity,unit,stage,manualCost,processing');IF row_json.has('sheet') THEN alliance_jespresso.validate_line(line_json);ELSIF line_json.has('stage') OR line_json.has('manualCost') THEN alliance_security.fail(400,'COSTING_INPUT','Opciones de ingrediente fuera de la hoja de recetas.');END IF;numeric_value(line_json,'quantity',CASE WHEN row_json.has('sheet') THEN 0 ELSE 0.000001 END,1e12);enum_value(line_json,'unit','g,kg,ml,l,unit');IF alliance_yield.factor(line_json)<=0 THEN alliance_security.fail(400,'COSTING_INPUT','Rendimiento invalido.');END IF;found:=FALSE;
            FOR k IN 0..ingredients_json.get_size-1 LOOP ingredient_json:=TREAT(ingredients_json.get(k) AS JSON_OBJECT_T);IF ingredient_json.get_string('id')=line_json.get_string('ingredientId') THEN found:=TRUE;IF family(ingredient_json.get_string('unit'))<>family(line_json.get_string('unit')) THEN alliance_security.fail(400,'COSTING_INPUT','Conversion incompatible.');END IF;END IF;END LOOP;
            IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Ingrediente inexistente o eliminado.');END IF;
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END;
  -- Recalculate approval in Oracle; clients cannot submit invented profit figures.
  FUNCTION approved_product(m JSON_OBJECT_T,recipe_id VARCHAR2) RETURN JSON_OBJECT_T IS
    recipes JSON_ARRAY_T:=m.get_array('recipes');ingredients JSON_ARRAY_T:=m.get_array('ingredients');expenses JSON_ARRAY_T:=m.get_array('expenses');channels JSON_ARRAY_T:=m.get_array('channels');
    recipe JSON_OBJECT_T;ingredient JSON_OBJECT_T;expense JSON_OBJECT_T;channel JSON_OBJECT_T;s JSON_OBJECT_T:=m.get_object('settings');line JSON_OBJECT_T;lines JSON_ARRAY_T;result JSON_OBJECT_T:=JSON_OBJECT_T();
    batch NUMBER:=0;direct NUMBER:=0;allocated NUMBER:=0;price NUMBER;cost NUMBER;net NUMBER;fees NUMBER;profit NUMBER;actual NUMBER;capacity NUMBER;monthly NUMBER;unit_price NUMBER;quantity NUMBER;tax NUMBER;rate NUMBER;denominator NUMBER;
    FUNCTION factor(u VARCHAR2) RETURN NUMBER IS BEGIN RETURN CASE WHEN u IN('kg','l') THEN 1000 ELSE 1 END;END;
  BEGIN
    FOR i IN 0..recipes.get_size-1 LOOP recipe:=TREAT(recipes.get(i) AS JSON_OBJECT_T);EXIT WHEN recipe.get_string('id')=recipe_id;recipe:=NULL;END LOOP;
    IF recipe IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto no disponible.');END IF;
    IF recipe.has('sheet') THEN RETURN alliance_jespresso.approved_product(m,recipe);END IF;
    lines:=recipe.get_array('lines');price:=recipe.get_number('currentPrice');
    IF lines.get_size=0 OR price IS NULL OR price<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Completa la receta y el precio antes de guardar el producto.');END IF;
    FOR i IN 0..channels.get_size-1 LOOP channel:=TREAT(channels.get(i) AS JSON_OBJECT_T);EXIT WHEN channel.get_string('id')=recipe.get_string('channelId');channel:=NULL;END LOOP;
    IF channel IS NULL THEN alliance_security.fail(400,'COSTING_GOAL','Selecciona una forma de venta.');END IF;
    FOR i IN 0..lines.get_size-1 LOOP
      line:=TREAT(lines.get(i) AS JSON_OBJECT_T);
      FOR j IN 0..ingredients.get_size-1 LOOP ingredient:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);EXIT WHEN ingredient.get_string('id')=line.get_string('ingredientId');END LOOP;
      unit_price:=ingredient.get_number('purchasePrice');IF ingredient.get_boolean('recoverableTax') THEN unit_price:=unit_price/(1+ingredient.get_number('purchaseTaxRate')/100);END IF;
      unit_price:=unit_price/ingredient.get_number('quantity');
      quantity:=line.get_number('quantity')/alliance_yield.factor(line)*factor(line.get_string('unit'))/factor(ingredient.get_string('unit'));batch:=batch+quantity*unit_price;
    END LOOP;
    FOR i IN 0..expenses.get_size-1 LOOP
      expense:=TREAT(expenses.get(i) AS JSON_OBJECT_T);
      IF NOT expense.get_boolean('includedElsewhere') AND (expense.get_string('recipeId') IS NULL OR expense.get_string('recipeId')=recipe_id) THEN
        IF expense.get_string('kind')='unit' THEN direct:=direct+expense.get_number('amount');ELSIF expense.get_string('kind')='batch' THEN direct:=direct+expense.get_number('amount')/recipe.get_number('output');
        ELSIF NVL(recipe.get_string('pricingBasis'),'full')<>'production' THEN monthly:=expense.get_number('amount')/expense.get_number('periodMonths');
          IF expense.get_string('allocation')='minutes' THEN
            IF expense.get_string('recipeId') IS NOT NULL THEN capacity:=recipe.get_number('minutes')*recipe.get_number('monthlyUnits');ELSE capacity:=s.get_number('monthlyMinutes');END IF;
            IF capacity IS NULL OR capacity<=0 OR recipe.get_number('minutes') IS NULL THEN alliance_security.fail(400,'COSTING_GOAL','Faltan tiempos para repartir los gastos.');END IF;
            allocated:=allocated+monthly*recipe.get_number('minutes')/capacity;
          ELSE
            IF expense.get_string('recipeId') IS NOT NULL THEN capacity:=recipe.get_number('monthlyUnits');ELSE capacity:=s.get_number('monthlyUnits');END IF;
            IF capacity IS NULL OR capacity<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Indica las ventas del mes para repartir los gastos.');END IF;
            allocated:=allocated+monthly/capacity;
          END IF;
        END IF;
      END IF;
    END LOOP;
    cost:=batch/recipe.get_number('output')+direct+allocated;
    tax:=s.get_number('taxRate')/100;net:=price;IF s.get_string('taxMode')='included' THEN net:=price/(1+tax);END IF;
    rate:=(channel.get_number('salesPercent')+channel.get_number('paymentPercent'))/100;IF channel.get_string('feeBase')='gross' THEN rate:=rate*(1+tax);END IF;
    denominator:=1-rate;IF recipe.get_string('marginMode')='margin' THEN denominator:=denominator-recipe.get_number('targetPercent')/100;END IF;
    fees:=net*rate+channel.get_number('flatFee');profit:=net-cost-fees;
    IF recipe.get_string('marginMode')='markup' THEN IF cost<=0 THEN alliance_security.fail(400,'COSTING_GOAL','El recargo necesita un costo mayor que cero.');END IF;actual:=profit/cost*100;ELSE actual:=profit/net*100;END IF;
    IF denominator<=0 OR profit<0 OR actual+0.0000001<recipe.get_number('targetPercent') THEN alliance_security.fail(400,'COSTING_GOAL','El precio actual todavía no alcanza tu ganancia objetivo.');END IF;
    result.put('pricingBasis',NVL(recipe.get_string('pricingBasis'),'full'));result.put('recipeId',recipe_id);result.put('name',recipe.get_string('name'));result.put('size',recipe.get_string('size'));result.put('channelName',channel.get_string('name'));result.put('cost',cost);result.put('price',price);result.put('profit',profit);result.put('actualPercent',actual);result.put('targetPercent',recipe.get_number('targetPercent'));result.put('marginMode',recipe.get_string('marginMode'));result.put('model',m);RETURN result;
  END;
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();o JSON_OBJECT_T;model_json JSON_OBJECT_T;history_json JSON_ARRAY_T:=JSON_ARRAY_T();approved_json JSON_ARRAY_T:=JSON_ARRAY_T();recipe_id VARCHAR2(80);revision_value NUMBER:=0;stamp_value VARCHAR2(40);actor_name VARCHAR2(160);actor_id_value VARCHAR2(36);old_json CLOB;new_json CLOB;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'inventory.read');
    o:=alliance_pos_store.document(p_business,p_location,'costing','primary');IF o IS NOT NULL THEN revision_value:=o.get_number('revision');END IF;
    IF p_action='costing_load' THEN alliance_security.keys_only(p_payload,'revision');
      IF p_payload.has('revision') THEN numeric_value(p_payload,'revision',1,1e12);o:=alliance_pos_store.document(p_business,p_location,'costing_history',TO_CHAR(p_payload.get_number('revision')));IF o IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Version no disponible.');END IF;END IF;
      r.put('revision',revision_value);IF o IS NOT NULL THEN r.put('model',o.get_object('model'));r.put('updatedAt',o.get_string('updatedAt'));r.put('actor',o.get_string('actor'));BEGIN actor_id_value:=o.get_string('actor');SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=actor_id_value;r.put('actorName',actor_name);EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;ELSE r.put_null('model');END IF;
      FOR h IN(SELECT JSON_VALUE(data_json,'$.revision' RETURNING NUMBER) rev,JSON_VALUE(data_json,'$.updatedAt') stamp,JSON_VALUE(data_json,'$.actor') actor FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_history' ORDER BY created_at DESC FETCH FIRST 100 ROWS ONLY) LOOP
        model_json:=JSON_OBJECT_T();model_json.put('revision',h.rev);model_json.put('updatedAt',h.stamp);model_json.put('actor',h.actor);history_json.append(model_json);
      END LOOP;r.put('history',history_json);
      FOR h IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_approved' ORDER BY created_at DESC) LOOP
        model_json:=JSON_OBJECT_T.parse(h.data_json);model_json.remove('model');BEGIN actor_id_value:=model_json.get_string('actor');SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=actor_id_value;model_json.put('actorName',actor_name);EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;approved_json.append(model_json);
      END LOOP;r.put('approved',approved_json);RETURN r;
    ELSIF p_action IN('costing_approve','costing_product_load','costing_product_delete') THEN
      IF p_action='costing_approve' THEN alliance_security.keys_only(p_payload,'recipeId,revision');ELSE alliance_security.keys_only(p_payload,'recipeId');END IF;
      recipe_id:=alliance_security.text_value(p_payload,'recipeId',80,'^[a-zA-Z0-9_-]+$');
      IF p_action='costing_product_load' THEN
        r:=alliance_pos_store.document(p_business,p_location,'costing_approved',recipe_id);IF r IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto guardado no disponible.');END IF;RETURN r;
      END IF;
      alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_pos_store.lock_scope(p_business,p_location);
      model_json:=alliance_pos_store.document(p_business,p_location,'costing_approved',recipe_id);IF model_json IS NOT NULL THEN old_json:=model_json.to_clob;END IF;
      IF p_action='costing_product_delete' THEN
        DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_approved' AND id=recipe_id;
        r.put('deleted',TRUE);
      ELSE
        numeric_value(p_payload,'revision',0,1e12);o:=alliance_pos_store.document(p_business,p_location,'costing','primary');
        IF o IS NULL OR o.get_number('revision')<>p_payload.get_number('revision') THEN alliance_security.fail(409,'COSTING_CONFLICT','El costeo cambió. Recarga antes de guardar el producto.');END IF;
        r:=approved_product(o.get_object('model'),recipe_id);r.put('updatedAt',alliance_pos_store.stamp);r.put('actor',p_user);SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=p_user;r.put('actorName',actor_name);
        alliance_pos_store.put_document(p_business,p_location,'costing_approved',recipe_id,r);new_json:=r.to_clob;r.remove('model');
      END IF;
      INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,CASE WHEN p_action='costing_approve' THEN 'COSTING_APPROVE' ELSE 'COSTING_UNSAVE' END,p_location,old_json,new_json);RETURN r;
    ELSIF p_action='costing_save' THEN
      alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_security.keys_only(p_payload,'model,revision');numeric_value(p_payload,'revision',0,1e12);
      alliance_pos_store.lock_scope(p_business,p_location);o:=alliance_pos_store.document(p_business,p_location,'costing','primary');revision_value:=0;IF o IS NOT NULL THEN revision_value:=o.get_number('revision');old_json:=o.to_clob;END IF;
      IF revision_value<>p_payload.get_number('revision') THEN alliance_security.fail(409,'COSTING_CONFLICT','Otra persona modifico el costeo. Recarga antes de guardar. Tu borrador se conserva.');END IF;
      model_json:=p_payload.get_object('model');validate_model(model_json);alliance_materials.processing_prices(p_business,p_location,CASE WHEN old_json IS NULL THEN NULL ELSE JSON_OBJECT_T(old_json).get_object('model') END,model_json);stamp_value:=alliance_pos_store.stamp;
      o:=JSON_OBJECT_T();o.put('model',model_json);o.put('revision',revision_value+1);o.put('updatedAt',stamp_value);o.put('actor',p_user);
      alliance_pos_store.put_document(p_business,p_location,'costing','primary',o);alliance_materials.sync_processing(p_user,p_business,p_location,CASE WHEN old_json IS NULL THEN NULL ELSE JSON_OBJECT_T(old_json).get_object('model') END,model_json,revision_value+1);new_json:=o.to_clob;
      INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,'COSTING_SAVE',p_location,old_json,new_json);
      alliance_activity.costing_changes(p_user,p_business,p_location,old_json,model_json);
      SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=p_user;r.put('actorName',actor_name);r.put('actor',p_user);r.put('revision',revision_value+1);r.put('updatedAt',stamp_value);RETURN r;
    END IF;alliance_security.fail(404,'NOT_FOUND','Accion de costeo no disponible.');RETURN r;
  END;
END;
/
