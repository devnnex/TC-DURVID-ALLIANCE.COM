CREATE OR REPLACE PACKAGE BODY alliance_materials AS
  PROCEDURE guard_open(b VARCHAR2,l VARCHAR2,exclude_session VARCHAR2 DEFAULT NULL) IS
  BEGIN
    FOR x IN(
      SELECT p.ingredient_id,MAX(NVL(rs.name,p.ingredient_id)) name,MAX(NVL(rs.quantity,0)) available,SUM(p.quantity*JSON_VALUE(d.data_json,'$.quantity' RETURNING NUMBER)) needed
      FROM alliance_pos_documents d JOIN alliance_pos_documents s ON s.business_id=d.business_id AND s.location_id=d.location_id AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.session_id')
      JOIN alliance_pos_documents r ON r.business_id=d.business_id AND r.location_id=d.location_id AND r.entity='op_recipes' AND r.id=JSON_VALUE(d.data_json,'$.menu_item_id')
      CROSS APPLY JSON_TABLE(r.data_json,'$.lines[*]' COLUMNS(ingredient_id VARCHAR2(80) PATH '$.ingredientId',quantity NUMBER PATH '$.quantity')) p
      LEFT JOIN alliance_raw_stock rs ON rs.business_id=b AND rs.location_id=l AND rs.id=p.ingredient_id
      WHERE d.business_id=b AND d.location_id=l AND d.entity='session_items' AND NVL(JSON_VALUE(d.data_json,'$.status'),'confirmed')<>'cancelled' AND JSON_VALUE(s.data_json,'$.status')='open' AND JSON_VALUE(r.data_json,'$.managed')='true' AND (exclude_session IS NULL OR s.id<>exclude_session)
      GROUP BY p.ingredient_id HAVING SUM(p.quantity*JSON_VALUE(d.data_json,'$.quantity' RETURNING NUMBER))>MAX(NVL(rs.quantity,0))+0.00000001
    ) LOOP alliance_security.fail(409,'MATERIALS_INSUFFICIENT','No alcanza '||x.name||'. Abastece la macro de insumos antes de agregar el consumo.');END LOOP;
  END;
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,command_value VARCHAR2,p JSON_OBJECT_T,job VARCHAR2,sync_mode BOOLEAN DEFAULT FALSE) RETURN JSON_OBJECT_T IS
    v JSON_OBJECT_T;old JSON_OBJECT_T;r JSON_OBJECT_T;m JSON_OBJECT_T;wrapper JSON_OBJECT_T;ing JSON_OBJECT_T;raw JSON_OBJECT_T;part JSON_OBJECT_T;mapping JSON_OBJECT_T;row_json JSON_OBJECT_T;result_json JSON_OBJECT_T:=JSON_OBJECT_T();lines JSON_ARRAY_T;ings JSON_ARRAY_T;recipes JSON_ARRAY_T;maps JSON_ARRAY_T;parts JSON_ARRAY_T:=JSON_ARRAY_T();merged JSON_OBJECT_T:=JSON_OBJECT_T();keys_value JSON_KEY_LIST;s JSON_OBJECT_T;man JSON_ARRAY_T;
    id_value VARCHAR2(80);raw_id VARCHAR2(80);name_value VARCHAR2(300);unit_value VARCHAR2(12);source_unit VARCHAR2(12);slug_value VARCHAR2(80);n NUMBER;rev NUMBER;q NUMBER;target_quantity NUMBER;delta_quantity NUMBER;portions NUMBER;batch NUMBER:=0;overhead NUMBER;percent_value NUMBER:=0;cost_value NUMBER;found BOOLEAN;
  BEGIN
    SELECT slug INTO slug_value FROM locations WHERE business_id=b AND id=l;
    alliance_security.require_location(u,b,l,CASE WHEN sync_mode THEN 'products.write' ELSE 'inventory.write' END);alliance_pos_store.lock_scope(b,l);
    IF command_value='materials_link' THEN
      alliance_security.require_location(u,b,l,'products.write');alliance_security.keys_only(p,'productId,recipeId,revision,salePortions,mappings,available');
      id_value:=alliance_security.text_value(p,'productId',80);v:=alliance_pos_store.document(b,l,'menu_items',id_value);IF v IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto no disponible.');END IF;
      SELECT COUNT(*) INTO n FROM alliance_pos_documents d JOIN alliance_pos_documents a ON a.business_id=d.business_id AND a.location_id=d.location_id AND a.entity='table_sessions' AND a.id=JSON_VALUE(d.data_json,'$.session_id') WHERE d.business_id=b AND d.location_id=l AND d.entity='session_items' AND JSON_VALUE(d.data_json,'$.menu_item_id')=id_value AND NVL(JSON_VALUE(d.data_json,'$.status'),'served')<>'cancelled' AND JSON_VALUE(a.data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_RECIPE','Cobra o retira los consumos de este producto antes de cambiar su receta.');END IF;
      wrapper:=alliance_pos_store.document(b,l,'costing','primary');IF wrapper IS NULL OR wrapper.get_number('revision')<>alliance_operations.numeric_value(p,'revision') THEN alliance_security.fail(409,'VERSION_CONFLICT','La hoja cambio. Guarda y vuelve a abrir el vinculo.');END IF;
      m:=wrapper.get_object('model');recipes:=m.get_array('recipes');r:=NULL;FOR i IN 0..recipes.get_size-1 LOOP row_json:=TREAT(recipes.get(i) AS JSON_OBJECT_T);IF row_json.get_string('id')=p.get_string('recipeId') THEN r:=row_json;EXIT;END IF;END LOOP;
      IF r IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Elige una receta guardada.');END IF;
      portions:=alliance_operations.numeric_value(p,'salePortions',0.000001,1e6);maps:=p.get_array('mappings');IF maps IS NULL OR maps.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Revisa los vinculos.');END IF;lines:=r.get_array('lines');ings:=m.get_array('ingredients');
      FOR i IN 0..lines.get_size-1 LOOP
        part:=TREAT(lines.get(i) AS JSON_OBJECT_T);ing:=NULL;FOR j IN 0..ings.get_size-1 LOOP row_json:=TREAT(ings.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=part.get_string('ingredientId') THEN ing:=row_json;EXIT;END IF;END LOOP;
        raw_id:=NULL;n:=0;FOR j IN 0..maps.get_size-1 LOOP mapping:=TREAT(maps.get(j) AS JSON_OBJECT_T);alliance_security.keys_only(mapping,'ingredientId,stockId');IF mapping.get_string('ingredientId')=part.get_string('ingredientId') THEN raw_id:=alliance_security.text_value(mapping,'stockId',80,'^[a-zA-Z0-9_-]+$');n:=n+1;END IF;END LOOP;
        IF raw_id IS NULL OR n<>1 THEN alliance_security.fail(400,'INVALID_INPUT','Selecciona el insumo de '||ing.get_string('name'));END IF;
        SELECT COUNT(*) INTO n FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=raw_id;
        source_unit:=CASE WHEN ing.get_string('unit') IN('g','kg') THEN 'g' WHEN ing.get_string('unit') IN('ml','l') THEN 'ml' ELSE 'u' END;
        IF n=0 THEN
          name_value:=ing.get_string('name');SELECT COUNT(*) INTO n FROM alliance_raw_stock x WHERE x.business_id=b AND x.location_id=l AND LOWER(TRIM(x.name))=LOWER(TRIM(name_value)) AND x.unit_id=source_unit AND NOT EXISTS(SELECT 1 FROM alliance_pos_documents a WHERE a.business_id=b AND a.location_id=l AND a.entity='op_archivedingredients' AND a.id=x.id);
          IF n>0 THEN alliance_security.fail(409,'VERSION_CONFLICT','Ya existe '||ing.get_string('name')||' en la macro. Seleccionalo para compartir sus existencias.');END IF;
          cost_value:=ing.get_number('purchasePrice');IF ing.get_boolean('recoverableTax') THEN cost_value:=cost_value/(1+ing.get_number('purchaseTaxRate')/100);END IF;cost_value:=cost_value/ing.get_number('quantity')*alliance_operations.convert_quantity(1,source_unit,ing.get_string('unit'));INSERT INTO alliance_raw_stock(business_id,location_id,id,name,unit_id,unit_cost) VALUES(b,l,raw_id,name_value,source_unit,cost_value);
        END IF;
        IF alliance_operations.get_row(b,l,'archivedingredients',raw_id) IS NOT NULL THEN alliance_security.fail(409,'MATERIALS_MISSING','El insumo esta retirado de la macro.');END IF;
        raw:=alliance_operations.raw_item(b,l,raw_id);q:=alliance_operations.convert_quantity(part.get_number('quantity')/alliance_yield.factor(part),part.get_string('unit'),raw.get_string('unit'))*portions/CASE WHEN part.get_string('stage')='portion' THEN 1 ELSE r.get_number('output') END;
        IF q>0 THEN row_json:=merged.get_object(raw_id);IF row_json IS NULL THEN row_json:=JSON_OBJECT_T();row_json.put('ingredientId',raw_id);row_json.put('name',raw.get_string('name'));row_json.put('unit',raw.get_string('unit'));row_json.put('quantity',q);ELSE row_json.put('quantity',row_json.get_number('quantity')+q);END IF;merged.put(raw_id,row_json);END IF;
        IF NVL(part.get_string('stage'),'batch')<>'portion' THEN
          IF part.has('manualCost') AND NOT part.get('manualCost').is_null THEN batch:=batch+part.get_number('manualCost')/alliance_yield.factor(part);ELSE cost_value:=ing.get_number('purchasePrice');IF ing.get_boolean('recoverableTax') THEN cost_value:=cost_value/(1+ing.get_number('purchaseTaxRate')/100);END IF;batch:=batch+alliance_operations.convert_quantity(part.get_number('quantity')/alliance_yield.factor(part),part.get_string('unit'),ing.get_string('unit'))*cost_value/ing.get_number('quantity');END IF;
        END IF;
      END LOOP;
      keys_value:=merged.get_keys;FOR k IN(SELECT column_value key_value FROM TABLE(keys_value) ORDER BY NLSSORT(column_value,'NLS_SORT=BINARY')) LOOP parts.append(merged.get_object(k.key_value));END LOOP;IF parts.get_size=0 THEN alliance_security.fail(400,'INVALID_INPUT','La receta necesita cantidades mayores que cero.');END IF;
      IF r.has('sheet') THEN s:=r.get_object('sheet');man:=s.get_array('management');FOR i IN 0..man.get_size-1 LOOP row_json:=TREAT(man.get(i) AS JSON_OBJECT_T);percent_value:=percent_value+row_json.get_number('percent');END LOOP;overhead:=batch*(s.get_number('unforeseenPercent')+percent_value)/100/r.get_number('output')*portions;ELSE overhead:=0;man:=m.get_array('expenses');FOR j IN 0..man.get_size-1 LOOP row_json:=TREAT(man.get(j) AS JSON_OBJECT_T);IF NOT row_json.get_boolean('includedElsewhere') AND (row_json.get_string('recipeId') IS NULL OR row_json.get_string('recipeId')=r.get_string('id')) THEN IF row_json.get_string('kind')='unit' THEN overhead:=overhead+row_json.get_number('amount')*portions;ELSIF row_json.get_string('kind')='batch' THEN overhead:=overhead+row_json.get_number('amount')/r.get_number('output')*portions;END IF;END IF;END LOOP;END IF;
      result_json.put('productId',id_value);result_json.put('name',v.get_string('name'));result_json.put('recipeId',r.get_string('id'));result_json.put('managed',TRUE);result_json.put('salePortions',portions);result_json.put('mappings',maps);result_json.put('overheadCost',overhead);result_json.put('lines',parts);alliance_operations.put_row(u,b,l,'recipes',id_value,result_json);
      IF p.has('available') THEN n:=alliance_security.flag(p,'available');v.put('is_available',n=1);alliance_pos_store.put_document(b,l,'menu_items',id_value,v);END IF;
    ELSIF command_value='materials_save' THEN
      alliance_security.keys_only(p,'id,revision,name,unit,minStock,quantity');id_value:=alliance_security.text_value(p,'id',80,'^[a-zA-Z0-9_-]+$');name_value:=alliance_security.text_value(p,'name',160);unit_value:=alliance_security.text_value(p,'unit',12);q:=alliance_operations.convert_quantity(1,unit_value,unit_value);rev:=alliance_operations.numeric_value(p,'revision');q:=alliance_operations.numeric_value(p,'minStock');
      SELECT COUNT(*) INTO n FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=id_value;
      IF n=0 THEN IF rev<>0 THEN alliance_security.fail(409,'VERSION_CONFLICT','El insumo cambio.');END IF;ELSE old:=alliance_operations.raw_item(b,l,id_value);IF old.get_number('revision')<>rev OR old.get_string('unit')<>unit_value THEN alliance_security.fail(409,'VERSION_CONFLICT','El insumo cambio. Conserva su unidad base y actualiza.');END IF;END IF;
      IF old IS NOT NULL AND old.get_boolean('archived') THEN alliance_security.fail(409,'MATERIALS_MISSING','El insumo esta retirado de la macro.');END IF;
      target_quantity:=CASE WHEN old IS NULL THEN 0 ELSE old.get_number('quantity') END;
      IF p.has('quantity') THEN delta_quantity:=ROUND(alliance_operations.numeric_value(p,'quantity'),8)-target_quantity;ELSE delta_quantity:=0;END IF;
      SELECT COUNT(*) INTO n FROM alliance_raw_stock x WHERE x.business_id=b AND x.location_id=l AND x.id<>id_value AND LOWER(TRIM(x.name))=LOWER(TRIM(name_value)) AND x.unit_id=unit_value AND NOT EXISTS(SELECT 1 FROM alliance_pos_documents a WHERE a.business_id=b AND a.location_id=l AND a.entity='op_archivedingredients' AND a.id=x.id);IF n>0 THEN alliance_security.fail(409,'DUPLICATE_MATERIAL','Ya existe este insumo en la macro.');END IF;
      MERGE INTO alliance_raw_stock x USING(SELECT id_value id FROM dual)y ON(x.business_id=b AND x.location_id=l AND x.id=y.id) WHEN MATCHED THEN UPDATE SET name=name_value,min_stock=q,version=version+1 WHEN NOT MATCHED THEN INSERT(business_id,location_id,id,name,unit_id,min_stock)VALUES(b,l,id_value,name_value,unit_value,q);
      IF delta_quantity<>0 THEN alliance_operations.raw_move(u,b,l,job,id_value,delta_quantity,'adjustment',CASE WHEN old IS NULL THEN 'Existencia inicial' ELSE 'Correccion de existencia al editar' END);END IF;guard_open(b,l);
    ELSIF command_value='materials_adjust' THEN
      alliance_security.keys_only(p,'ingredientId,quantity,unit,kind,totalCost,reason');raw_id:=alliance_security.text_value(p,'ingredientId',80);raw:=alliance_operations.raw_item(b,l,raw_id);q:=alliance_operations.convert_quantity(alliance_operations.numeric_value(p,'quantity',0.00000001),p.get_string('unit'),raw.get_string('unit'));cost_value:=alliance_operations.numeric_value(p,'totalCost');
      IF p.has('reason') AND NOT p.get('reason').is_null THEN IF NOT p.get('reason').is_string OR LENGTH(p.get_string('reason'))>300 THEN alliance_security.fail(400,'INVALID_INPUT','Revisa el motivo del movimiento.');END IF;END IF;name_value:=NVL(TRIM(p.get_string('reason')),CASE WHEN p.get_string('kind')='in' THEN 'Entrada de insumos' ELSE 'Retiro de insumos' END);
      IF raw.get_boolean('archived') THEN alliance_security.fail(409,'MATERIALS_MISSING','El insumo esta retirado de la macro.');END IF;
      IF p.get_string('kind')='in' THEN UPDATE alliance_raw_stock SET unit_cost=(quantity*unit_cost+cost_value)/(quantity+q) WHERE business_id=b AND location_id=l AND id=raw_id;ELSIF p.get_string('kind')='out' THEN q:=-q;ELSE alliance_security.fail(400,'INVALID_INPUT','Elige entrada o salida.');END IF;
      alliance_operations.raw_move(u,b,l,job,raw_id,q,p.get_string('kind'),name_value);guard_open(b,l);
    ELSIF command_value='materials_delete' THEN
      alliance_security.keys_only(p,'ingredientId');IF NOT alliance_security.location_owner(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede eliminar insumos.');END IF;raw_id:=alliance_security.text_value(p,'ingredientId',80);raw:=alliance_operations.raw_item(b,l,raw_id);
      SELECT COUNT(*) INTO n FROM alliance_pos_documents r JOIN alliance_pos_documents product ON product.business_id=r.business_id AND product.location_id=r.location_id AND product.entity='menu_items' AND product.id=r.id CROSS APPLY JSON_TABLE(r.data_json,'$.lines[*]' COLUMNS(ingredient_id VARCHAR2(80) PATH '$.ingredientId')) p WHERE r.business_id=b AND r.location_id=l AND r.entity='op_recipes' AND p.ingredient_id=raw_id;
      IF n>0 THEN alliance_security.fail(409,'MATERIALS_IN_USE','Este insumo esta vinculado a un producto. Puedes editarlo o abastecerlo, pero no eliminarlo.');END IF;result_json.put('archived',TRUE);alliance_operations.put_row(u,b,l,'archivedingredients',raw_id,result_json);
    ELSE alliance_security.fail(400,'INVALID_INPUT','Operacion de insumos no disponible.');END IF;
    alliance_pos_store.audit(u,b,'MATERIALS_'||UPPER(command_value),NVL(raw_id,id_value),NULL,p.to_clob);RETURN alliance_operations.snapshot(u,b,l);
  END;
  FUNCTION signature(r JSON_OBJECT_T) RETURN CLOB IS lines JSON_ARRAY_T:=r.get_array('lines');arr JSON_ARRAY_T:=JSON_ARRAY_T();row_json JSON_OBJECT_T;v JSON_OBJECT_T;BEGIN
    FOR j IN 0..lines.get_size-1 LOOP row_json:=TREAT(lines.get(j) AS JSON_OBJECT_T);v:=JSON_OBJECT_T();v.put('ingredientId',row_json.get_string('ingredientId'));IF row_json.has('processing') THEN v.put('processing',row_json.get_object('processing'));arr.append(v);END IF;END LOOP;RETURN arr.to_clob;
  END;
  PROCEDURE sync_processing(u VARCHAR2,b VARCHAR2,l VARCHAR2,old_model JSON_OBJECT_T,new_model JSON_OBJECT_T,revision_value NUMBER) IS
    before_rows JSON_ARRAY_T;after_rows JSON_ARRAY_T;old_recipe JSON_OBJECT_T;new_recipe JSON_OBJECT_T;row_json JSON_OBJECT_T;linked JSON_OBJECT_T;p JSON_OBJECT_T;result_json JSON_OBJECT_T;
  BEGIN
    IF old_model IS NULL THEN RETURN;END IF;before_rows:=old_model.get_array('recipes');after_rows:=new_model.get_array('recipes');
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_recipes' AND JSON_VALUE(data_json,'$.managed')='true') LOOP
      linked:=JSON_OBJECT_T(x.data_json);old_recipe:=NULL;new_recipe:=NULL;
      FOR j IN 0..before_rows.get_size-1 LOOP row_json:=TREAT(before_rows.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=linked.get_string('recipeId') THEN old_recipe:=row_json;EXIT;END IF;END LOOP;
      FOR j IN 0..after_rows.get_size-1 LOOP row_json:=TREAT(after_rows.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=linked.get_string('recipeId') THEN new_recipe:=row_json;EXIT;END IF;END LOOP;
      IF old_recipe IS NOT NULL AND new_recipe IS NOT NULL AND DBMS_LOB.COMPARE(signature(old_recipe),signature(new_recipe))<>0 THEN
        p:=JSON_OBJECT_T();p.put('productId',linked.get_string('productId'));p.put('recipeId',linked.get_string('recipeId'));p.put('revision',revision_value);p.put('salePortions',linked.get_number('salePortions'));p.put('mappings',linked.get_array('mappings'));
        result_json:=run_action(u,b,l,'materials_link',p,alliance_security.new_id,TRUE);
      END IF;
    END LOOP;
  END;
  PROCEDURE processing_prices(b VARCHAR2,l VARCHAR2,old_model JSON_OBJECT_T,new_model IN OUT JSON_OBJECT_T) IS
    before_rows JSON_ARRAY_T;after_rows JSON_ARRAY_T;ingredients JSON_ARRAY_T;maps JSON_ARRAY_T;old_recipe JSON_OBJECT_T;new_recipe JSON_OBJECT_T;linked JSON_OBJECT_T;row_json JSON_OBJECT_T;mapping JSON_OBJECT_T;ing JSON_OBJECT_T;raw JSON_OBJECT_T;price_value NUMBER;
  BEGIN
    IF old_model IS NULL THEN RETURN;END IF;before_rows:=old_model.get_array('recipes');after_rows:=new_model.get_array('recipes');ingredients:=new_model.get_array('ingredients');
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_recipes' AND JSON_VALUE(data_json,'$.managed')='true') LOOP
      linked:=JSON_OBJECT_T(x.data_json);old_recipe:=NULL;new_recipe:=NULL;
      FOR j IN 0..before_rows.get_size-1 LOOP row_json:=TREAT(before_rows.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=linked.get_string('recipeId') THEN old_recipe:=row_json;EXIT;END IF;END LOOP;
      FOR j IN 0..after_rows.get_size-1 LOOP row_json:=TREAT(after_rows.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=linked.get_string('recipeId') THEN new_recipe:=row_json;EXIT;END IF;END LOOP;
      IF old_recipe IS NOT NULL AND new_recipe IS NOT NULL AND DBMS_LOB.COMPARE(signature(old_recipe),signature(new_recipe))<>0 THEN
        maps:=linked.get_array('mappings');FOR j IN 0..maps.get_size-1 LOOP mapping:=TREAT(maps.get(j) AS JSON_OBJECT_T);raw:=alliance_operations.raw_item(b,l,mapping.get_string('stockId'));
          FOR k IN 0..ingredients.get_size-1 LOOP ing:=TREAT(ingredients.get(k) AS JSON_OBJECT_T);IF ing.get_string('id')=mapping.get_string('ingredientId') THEN
            price_value:=raw.get_number('unitCost')*alliance_operations.convert_quantity(ing.get_number('quantity'),ing.get_string('unit'),raw.get_string('unit'));IF ing.get_boolean('recoverableTax') THEN price_value:=price_value*(1+ing.get_number('purchaseTaxRate')/100);END IF;
            ing.put('purchasePrice',price_value);ingredients.put(k,ing,TRUE);EXIT;
          END IF;END LOOP;
        END LOOP;
      END IF;
    END LOOP;new_model.put('ingredients',ingredients);
  END;
END;
/
