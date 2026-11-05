CREATE OR REPLACE PACKAGE BODY alliance_production AS
  PROCEDURE add_delta(d IN OUT JSON_OBJECT_T,k VARCHAR2,q NUMBER) IS BEGIN d.put(k,NVL(d.get_number(k),0)+q);END;
  PROCEDURE apply_deltas(u VARCHAR2,b VARCHAR2,l VARCHAR2,d JSON_OBJECT_T,kind_value VARCHAR2,reference_value VARCHAR2) IS keys_value JSON_KEY_LIST:=d.get_keys;raw JSON_OBJECT_T;q NUMBER;BEGIN
    FOR i IN 1..keys_value.COUNT LOOP q:=d.get_number(keys_value(i));raw:=alliance_operations.raw_item(b,l,keys_value(i));IF raw IS NULL OR raw.get_number('quantity')-q < -0.00000001 OR (q>0 AND raw.get_boolean('archived')) THEN alliance_security.fail(409,'MATERIALS_INSUFFICIENT','No alcanza '||NVL(raw.get_string('name'),keys_value(i))||' para el adicional solicitado.');END IF;END LOOP;
    FOR i IN 1..keys_value.COUNT LOOP q:=d.get_number(keys_value(i));IF ABS(q)>0.00000001 THEN alliance_operations.raw_move(u,b,l,alliance_security.new_id,keys_value(i),-q,kind_value,reference_value);END IF;END LOOP;
  END;
  PROCEDURE post_batch(u VARCHAR2,b VARCHAR2,l VARCHAR2,model JSON_OBJECT_T,recipe_id VARCHAR2) IS
    slug_value VARCHAR2(80);r JSON_OBJECT_T;row_json JSON_OBJECT_T;ing JSON_OBJECT_T;raw JSON_OBJECT_T;old JSON_OBJECT_T;part JSON_OBJECT_T;result_json JSON_OBJECT_T;lines JSON_ARRAY_T;ingredients JSON_ARRAY_T:=model.get_array('ingredients');recipes JSON_ARRAY_T:=model.get_array('recipes');parts JSON_ARRAY_T:=JSON_ARRAY_T();old_parts JSON_ARRAY_T;expenses JSON_ARRAY_T:=model.get_array('expenses');needed JSON_OBJECT_T:=JSON_OBJECT_T();delta JSON_OBJECT_T:=JSON_OBJECT_T();keys_value JSON_KEY_LIST;raw_id VARCHAR2(80);q NUMBER;cost_value NUMBER:=0;overhead NUMBER:=0;transferred NUMBER:=0;stock_value NUMBER;n NUMBER;product_value VARCHAR2(80);output_value NUMBER;
  BEGIN
    SELECT slug INTO slug_value FROM locations WHERE business_id=b AND id=l;IF slug_value<>'gcobarf' THEN alliance_security.fail(400,'PRODUCTION_SCOPE','La producción terminada pertenece a GCOBARF.');END IF;
    FOR i IN 0..recipes.get_size-1 LOOP row_json:=TREAT(recipes.get(i) AS JSON_OBJECT_T);IF row_json.get_string('id')=recipe_id THEN r:=row_json;EXIT;END IF;END LOOP;IF r IS NULL THEN alliance_security.fail(400,'PRODUCTION_MISSING','Hoja de producción no disponible.');END IF;
    SELECT COUNT(*) INTO n FROM alliance_pos_documents a JOIN alliance_pos_documents s ON s.business_id=a.business_id AND s.location_id=a.location_id AND s.entity='table_sessions' AND s.id=JSON_VALUE(a.data_json,'$.session_id') JOIN alliance_pos_documents p ON p.business_id=a.business_id AND p.location_id=a.location_id AND p.entity='op_recipes' AND p.id=JSON_VALUE(a.data_json,'$.menu_item_id') WHERE a.business_id=b AND a.location_id=l AND a.entity='session_items' AND JSON_VALUE(p.data_json,'$.recipeId')=recipe_id AND NVL(JSON_VALUE(a.data_json,'$.status'),'served')<>'cancelled' AND JSON_VALUE(s.data_json,'$.status')='open';
    IF n>0 THEN alliance_security.fail(409,'OPEN_PRODUCTION','Cierra las cuentas anteriores de este producto antes de registrar su producción.');END IF;
    output_value:=r.get_number('output');lines:=r.get_array('lines');IF lines.get_size=0 THEN alliance_security.fail(400,'PRODUCTION_EMPTY','Selecciona al menos un insumo antes de registrar la producción.');END IF;
    FOR i IN 0..lines.get_size-1 LOOP
      part:=TREAT(lines.get(i) AS JSON_OBJECT_T);ing:=NULL;FOR j IN 0..ingredients.get_size-1 LOOP row_json:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=part.get_string('ingredientId') THEN ing:=row_json;EXIT;END IF;END LOOP;
      raw_id:=ing.get_string('stockId');IF raw_id IS NULL THEN alliance_security.fail(400,'PRODUCTION_MAPPING','Selecciona el insumo de la macro para '||ing.get_string('name')||'.');END IF;raw:=alliance_operations.raw_item(b,l,raw_id);IF raw IS NULL OR raw.get_boolean('archived') THEN alliance_security.fail(400,'PRODUCTION_MAPPING','Insumo no disponible en la macro.');END IF;
      q:=alliance_operations.convert_quantity(CASE WHEN part.has('initialQuantity') THEN part.get_number('initialQuantity') ELSE part.get_number('quantity')/alliance_yield.factor(part) END,part.get_string('unit'),raw.get_string('unit'));add_delta(needed,raw_id,q);IF part.has('initialQuantity') AND part.get_number('quantity')<=0 THEN alliance_security.fail(400,'COSTING_INPUT','El peso final debe ser mayor que cero para calcular el costo con merma.');END IF;cost_value:=cost_value+q*raw.get_number('unitCost')*CASE WHEN part.has('initialQuantity') THEN part.get_number('initialQuantity')/part.get_number('quantity') ELSE 1 END;
    END LOOP;
    keys_value:=needed.get_keys;FOR i IN 1..keys_value.COUNT LOOP raw:=alliance_operations.raw_item(b,l,keys_value(i));part:=JSON_OBJECT_T();part.put('ingredientId',keys_value(i));part.put('unit',raw.get_string('unit'));part.put('quantity',needed.get_number(keys_value(i)));parts.append(part);add_delta(delta,keys_value(i),needed.get_number(keys_value(i)));END LOOP;
    old:=alliance_operations.get_row(b,l,'productions',recipe_id);IF old IS NOT NULL THEN
      transferred:=NVL(old.get_number('transferred'),0);product_value:=old.get_string('productId');old_parts:=old.get_array('parts');FOR i IN 0..old_parts.get_size-1 LOOP part:=TREAT(old_parts.get(i) AS JSON_OBJECT_T);add_delta(delta,part.get_string('ingredientId'),-part.get_number('quantity'));END LOOP;
      IF r.get_number('output')<transferred THEN
        SELECT stock INTO stock_value FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND product_id=product_value;
        IF stock_value<transferred-r.get_number('output') THEN alliance_security.fail(409,'PRODUCTION_SOLD','La corrección supera los productos terminados que quedan; parte de esta producción ya fue vendida.');END IF;
        alliance_pos_store.movement(u,b,l,alliance_security.new_id,product_value,r.get_number('output')-transferred,'CORRECCION_PRODUCCION',recipe_id,NULL);transferred:=r.get_number('output');
      END IF;
    END IF;
    apply_deltas(u,b,l,delta,'production',recipe_id);
    FOR i IN 0..expenses.get_size-1 LOOP row_json:=TREAT(expenses.get(i) AS JSON_OBJECT_T);IF NOT row_json.get_boolean('includedElsewhere') AND (row_json.get_string('recipeId') IS NULL OR row_json.get_string('recipeId')=recipe_id) THEN IF row_json.get_string('kind')='unit' THEN overhead:=overhead+row_json.get_number('amount')*r.get_number('output');ELSIF row_json.get_string('kind')='batch' THEN overhead:=overhead+row_json.get_number('amount');END IF;END IF;END LOOP;
    result_json:=JSON_OBJECT_T();result_json.put('recipeId',recipe_id);result_json.put('output',r.get_number('output'));result_json.put('transferred',transferred);result_json.put('productId',product_value);result_json.put('parts',parts);result_json.put('cost',cost_value+overhead);alliance_operations.put_row(u,b,l,'productions',recipe_id,result_json);DELETE FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_recipes' AND JSON_VALUE(data_json,'$.recipeId')=recipe_id;
    IF product_value IS NOT NULL THEN UPDATE alliance_pos_stock SET cost_minor=ROUND((cost_value+overhead)/output_value*100),version=version+1 WHERE business_id=b AND location_id=l AND product_id=product_value;END IF;
  END;
  FUNCTION transfer_batch(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS batch JSON_OBJECT_T;recipe_id VARCHAR2(80);product_value VARCHAR2(80);slug_value VARCHAR2(80);q NUMBER;n NUMBER;unit_cost_value NUMBER;BEGIN
    SELECT slug INTO slug_value FROM locations WHERE business_id=b AND id=l;IF slug_value<>'gcobarf' THEN alliance_security.fail(400,'PRODUCTION_SCOPE','La producción terminada pertenece a GCOBARF.');END IF;
    alliance_security.require_location(u,b,l,'inventory.write');alliance_security.keys_only(p,'recipeId,productId,available');recipe_id:=alliance_security.text_value(p,'recipeId',80);product_value:=alliance_security.text_value(p,'productId',80);batch:=alliance_operations.get_row(b,l,'productions',recipe_id);
    IF batch IS NULL THEN alliance_security.fail(409,'PRODUCTION_MISSING','Guarda la hoja de producción para descontar sus insumos antes de agregarla al inventario.');END IF;
    IF batch.get_string('productId') IS NOT NULL AND batch.get_string('productId')<>product_value THEN alliance_security.fail(409,'PRODUCTION_LINKED','Esta producción ya está vinculada a otro producto.');END IF;
    SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_productions' AND id<>recipe_id AND JSON_VALUE(data_json,'$.productId')=product_value;IF n>0 THEN alliance_security.fail(409,'PRODUCTION_LINKED','Elige un producto distinto para esta hoja de producción.');END IF;
    q:=batch.get_number('output')-NVL(batch.get_number('transferred'),0);IF q>0 THEN alliance_pos_store.movement(u,b,l,alliance_security.new_id,product_value,q,'ENTRADA_PRODUCCION',recipe_id,NULL);END IF;
    unit_cost_value:=ROUND(batch.get_number('cost')/batch.get_number('output')*100);UPDATE alliance_pos_stock SET cost_minor=unit_cost_value,version=version+1 WHERE business_id=b AND location_id=l AND product_id=product_value;
    DELETE FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_recipes' AND id=product_value;
    batch.put('productId',product_value);batch.put('transferred',batch.get_number('output'));alliance_operations.put_row(u,b,l,'productions',recipe_id,batch);RETURN batch;
  END;
  PROCEDURE reconcile(u VARCHAR2,b VARCHAR2,l VARCHAR2) IS
    slug_value VARCHAR2(80);line JSON_OBJECT_T;session_value JSON_OBJECT_T;recipe JSON_OBJECT_T;old JSON_OBJECT_T;row_json JSON_OBJECT_T;part JSON_OBJECT_T;raw JSON_OBJECT_T;parts JSON_ARRAY_T;old_parts JSON_ARRAY_T;recipe_parts JSON_ARRAY_T;delta JSON_OBJECT_T:=JSON_OBJECT_T();wanted BOOLEAN;
  BEGIN
    SELECT slug INTO slug_value FROM locations WHERE business_id=b AND id=l;IF slug_value='gcobarf' THEN RETURN;END IF;
    FOR x IN(
      SELECT d.id FROM alliance_pos_documents d JOIN alliance_pos_documents s ON s.business_id=d.business_id AND s.location_id=d.location_id AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.session_id')
      WHERE d.business_id=b AND d.location_id=l AND d.entity='session_items' AND NVL(JSON_VALUE(d.data_json,'$.status'),'served')<>'cancelled' AND JSON_VALUE(s.data_json,'$.status')='open'
        AND EXISTS(SELECT 1 FROM alliance_pos_documents r WHERE r.business_id=b AND r.location_id=l AND r.entity='op_recipes' AND r.id=JSON_VALUE(d.data_json,'$.menu_item_id') AND JSON_VALUE(r.data_json,'$.managed')='true')
      UNION SELECT id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_preparations' AND JSON_VALUE(data_json,'$.status')='active'
    ) LOOP
      old:=alliance_operations.get_row(b,l,'preparations',x.id);IF old IS NOT NULL AND old.get_string('status')='sold' THEN CONTINUE;END IF;
      line:=alliance_pos_store.document(b,l,'session_items',x.id);session_value:=NULL;recipe:=NULL;IF line IS NOT NULL THEN session_value:=alliance_pos_store.document(b,l,'table_sessions',line.get_string('session_id'));recipe:=alliance_operations.get_row(b,l,'recipes',line.get_string('menu_item_id'));END IF;
      wanted:=line IS NOT NULL AND line.get_string('status')<>'cancelled' AND session_value IS NOT NULL AND session_value.get_string('status')='open' AND recipe IS NOT NULL AND recipe.get_boolean('managed');
      IF wanted IS NULL THEN wanted:=FALSE;END IF;IF old IS NULL AND NOT wanted THEN CONTINUE;END IF;parts:=JSON_ARRAY_T();
      IF old IS NOT NULL AND old.get_string('status')='active' THEN old_parts:=old.get_array('parts');FOR i IN 0..old_parts.get_size-1 LOOP part:=TREAT(old_parts.get(i) AS JSON_OBJECT_T);add_delta(delta,part.get_string('ingredientId'),-part.get_number('quantity'));END LOOP;END IF;
      IF wanted THEN recipe_parts:=recipe.get_array('lines');FOR i IN 0..recipe_parts.get_size-1 LOOP part:=TREAT(recipe_parts.get(i) AS JSON_OBJECT_T);raw:=alliance_operations.raw_item(b,l,part.get_string('ingredientId'));row_json:=JSON_OBJECT_T();row_json.put('ingredientId',part.get_string('ingredientId'));row_json.put('unit',raw.get_string('unit'));row_json.put('quantity',alliance_operations.convert_quantity(part.get_number('quantity'),part.get_string('unit'),raw.get_string('unit'))*line.get_number('quantity'));parts.append(row_json);add_delta(delta,part.get_string('ingredientId'),row_json.get_number('quantity'));END LOOP;END IF;
      IF wanted AND old IS NOT NULL AND old.get_string('status')='active' AND old.get_number('quantity')=line.get_number('quantity') AND old.get_string('productId')=line.get_string('menu_item_id') AND DBMS_LOB.COMPARE(old.get_array('parts').to_clob,parts.to_clob)=0 THEN CONTINUE;END IF;
      IF old IS NULL THEN old:=JSON_OBJECT_T();END IF;old.put('parts',parts);old.put('status',CASE WHEN wanted THEN 'active' ELSE 'cancelled' END);IF wanted THEN old.put('sessionId',line.get_string('session_id'));old.put('productId',line.get_string('menu_item_id'));old.put('recipeId',recipe.get_string('recipeId'));old.put('quantity',line.get_number('quantity'));END IF;alliance_operations.put_row(u,b,l,'preparations',x.id,old);
    END LOOP;apply_deltas(u,b,l,delta,'preparation','Consumos en preparación');
  END;
END;
/
