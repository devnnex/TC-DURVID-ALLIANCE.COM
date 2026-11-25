CREATE OR REPLACE PACKAGE BODY alliance_material_ledger AS
 FUNCTION allowed(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN BOOLEAN IS n NUMBER;
 BEGIN SELECT COUNT(*) INTO n FROM users WHERE id=u AND business_id=b AND active=1 AND deleted_at IS NULL;RETURN n=1 AND alliance_security.location_owner(u,b,l);END;
 FUNCTION enabled(b VARCHAR2,l VARCHAR2) RETURN BOOLEAN IS n NUMBER;
 BEGIN SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND id=l AND slug IN('cafeteria','cocteleria');RETURN n=1;END;
 PROCEDURE record_move(u VARCHAR2,b VARCHAR2,l VARCHAR2,m VARCHAR2,i VARCHAR2,q NUMBER,previous_value NUMBER,remaining NUMBER,cost_value NUMBER,k VARCHAR2,ref VARCHAR2) IS nm VARCHAR2(160);un VARCHAR2(12);actor VARCHAR2(160);src VARCHAR2(24);
 BEGIN
  IF NOT enabled(b,l) THEN RETURN;END IF;
  SELECT name,unit_id INTO nm,un FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=i;
  SELECT full_name INTO actor FROM users WHERE business_id=b AND id=u;
  src:=CASE WHEN ref LIKE 'Capacidad%' THEN 'capacity' WHEN ref LIKE 'Abastecimiento%' THEN 'recipe_supply' WHEN k='return' THEN 'return' WHEN k='purchase' THEN 'purchase' WHEN q>0 THEN 'other_in' ELSE 'withdrawal' END;
  INSERT INTO alliance_material_entries(business_id,location_id,id,movement_id,ingredient_id,name,unit_id,quantity_delta,stock_before,stock_after,cost_before,cost_after,unit_cost,total_cost,source,kind,estimated,reference,actor_id,actor_name)
  VALUES(b,l,alliance_security.hash_text('movement:'||m),m,i,nm,un,q,previous_value,remaining,cost_value,cost_value,cost_value,ABS(q)*cost_value,src,k,1,SUBSTR(ref,1,300),u,actor);
 END;
 PROCEDURE annotate(u VARCHAR2,b VARCHAR2,l VARCHAR2,job VARCHAR2,command_value VARCHAR2,p JSON_OBJECT_T,previous_value JSON_OBJECT_T) IS
  raw_id VARCHAR2(80);nm VARCHAR2(160);un VARCHAR2(12);actor VARCHAR2(160);src VARCHAR2(24);kind_value VARCHAR2(24);identifier VARCHAR2(64);q NUMBER;before_q NUMBER:=0;before_cost NUMBER:=0;after_q NUMBER;after_cost NUMBER;rate NUMBER;amount NUMBER;est NUMBER:=1;reference_value VARCHAR2(1200);n NUMBER;
 BEGIN
  IF NOT enabled(b,l) THEN RETURN;END IF;
  raw_id:=CASE WHEN command_value='materials_save' THEN p.get_string('id') ELSE p.get_string('ingredientId') END;
  SELECT name,unit_id,quantity,unit_cost INTO nm,un,after_q,after_cost FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=raw_id;
  SELECT full_name INTO actor FROM users WHERE business_id=b AND id=u;
  IF previous_value IS NOT NULL THEN before_q:=previous_value.get_number('quantity');before_cost:=previous_value.get_number('unitCost');END IF;q:=after_q-before_q;
  src:=CASE WHEN command_value='materials_adjust' THEN CASE WHEN p.get_string('kind')='in' THEN 'entry' ELSE 'withdrawal' END WHEN command_value='materials_delete' THEN 'archive' WHEN previous_value IS NULL THEN 'opening' ELSE 'correction' END;
  rate:=after_cost;amount:=ABS(q)*rate;
  IF src='entry' AND p.has('totalCost') THEN amount:=p.get_number('totalCost');rate:=CASE WHEN q>0 THEN amount/q ELSE 0 END;est:=0;ELSIF src='opening' AND p.has('totalCost') THEN est:=0;END IF;
  identifier:=alliance_security.hash_text('movement:'||job);reference_value:=p.get_string('reason');kind_value:=NVL(p.get_string('kind'),'adjustment');
  SELECT COUNT(*) INTO n FROM alliance_material_entries WHERE business_id=b AND location_id=l AND id=identifier;
  IF n=0 THEN
   INSERT INTO alliance_material_entries(business_id,location_id,id,ingredient_id,name,unit_id,quantity_delta,stock_before,stock_after,cost_before,cost_after,unit_cost,total_cost,source,kind,estimated,reference,actor_id,actor_name)
   VALUES(b,l,identifier,raw_id,nm,un,q,before_q,after_q,before_cost,after_cost,rate,amount,src,kind_value,est,reference_value,u,actor);
  ELSE UPDATE alliance_material_entries SET source=src,total_cost=amount,unit_cost=rate,cost_before=before_cost,cost_after=after_cost,estimated=est,reference=NVL(reference_value,reference) WHERE business_id=b AND location_id=l AND id=identifier;END IF;
 END;
 FUNCTION item(r alliance_material_entries%ROWTYPE) RETURN JSON_OBJECT_T IS o JSON_OBJECT_T:=JSON_OBJECT_T();
 BEGIN
  o.put('id',r.id);o.put('movementId',r.movement_id);o.put('ingredientId',r.ingredient_id);o.put('name',r.name);o.put('unit',r.unit_id);o.put('delta',r.quantity_delta);o.put('before',r.stock_before);o.put('after',r.stock_after);o.put('costBefore',r.cost_before);o.put('costAfter',r.cost_after);o.put('unitCost',r.unit_cost);o.put('totalCost',r.total_cost);o.put('source',r.source);o.put('kind',r.kind);o.put('estimated',r.estimated=1);o.put('reference',r.reference);o.put('actorId',r.actor_id);o.put('actorName',r.actor_name);o.put('at',TO_CHAR(r.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));RETURN o;
 END;
 FUNCTION recent(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN JSON_ARRAY_T IS a JSON_ARRAY_T:=JSON_ARRAY_T();
 BEGIN IF NOT allowed(u,b,l) OR NOT enabled(b,l) THEN RETURN a;END IF;FOR r IN(SELECT * FROM alliance_material_entries WHERE business_id=b AND location_id=l ORDER BY occurred_at DESC,id DESC FETCH FIRST 200 ROWS ONLY)LOOP a.append(item(r));END LOOP;RETURN a;END;
 FUNCTION report(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  o JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();g JSON_OBJECT_T;from_at TIMESTAMP WITH TIME ZONE;to_at TIMESTAMP WITH TIME ZONE;from_value VARCHAR2(10);to_value VARCHAR2(10);ingredient_value VARCHAR2(80);actor_value VARCHAR2(36);skip_rows NUMBER:=0;n NUMBER;registered NUMBER;estimated_value NUMBER;entry_count NUMBER;
 BEGIN
  alliance_security.require_location(u,b,l,'inventory.read');IF NOT enabled(b,l) OR NOT allowed(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Las estadísticas y costos de insumos son exclusivos para los jefes.');END IF;
  alliance_security.keys_only(p,'from,to,ingredientId,actorId,offset');
  from_value:=p.get_string('from');to_value:=p.get_string('to');ingredient_value:=p.get_string('ingredientId');actor_value:=p.get_string('actorId');
  IF from_value IS NOT NULL THEN IF NOT REGEXP_LIKE(from_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha inicial.');END IF;BEGIN from_at:=TO_TIMESTAMP_TZ(from_value||' 00:00:00 America/Bogota','YYYY-MM-DD HH24:MI:SS TZR');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha inicial.');END;END IF;
  IF to_value IS NOT NULL THEN IF NOT REGEXP_LIKE(to_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha final.');END IF;BEGIN to_at:=TO_TIMESTAMP_TZ(to_value||' 00:00:00 America/Bogota','YYYY-MM-DD HH24:MI:SS TZR')+INTERVAL '1' DAY;EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha final.');END;END IF;
  IF from_at IS NOT NULL AND to_at IS NOT NULL AND from_at>=to_at THEN alliance_security.fail(400,'INVALID_INPUT','La fecha final debe ser posterior a la inicial.');END IF;
  IF LENGTH(ingredient_value)>80 OR LENGTH(actor_value)>36 THEN alliance_security.fail(400,'INVALID_INPUT','Revisa los filtros.');END IF;
  IF p.has('offset') THEN skip_rows:=p.get_number('offset');IF skip_rows IS NULL OR skip_rows<>TRUNC(skip_rows) OR skip_rows<0 OR skip_rows>10000000 THEN alliance_security.fail(400,'INVALID_INPUT','Página no disponible.');END IF;END IF;
  SELECT COUNT(*),NVL(SUM(CASE WHEN quantity_delta>0 AND source NOT IN('opening','correction','return') AND estimated=0 THEN total_cost ELSE 0 END),0),NVL(SUM(CASE WHEN quantity_delta>0 AND source NOT IN('opening','correction','return') AND estimated=1 THEN total_cost ELSE 0 END),0),NVL(SUM(CASE WHEN quantity_delta>0 AND source NOT IN('opening','correction','return') THEN 1 ELSE 0 END),0)
  INTO n,registered,estimated_value,entry_count FROM alliance_material_entries WHERE business_id=b AND location_id=l AND (from_at IS NULL OR occurred_at>=from_at) AND (to_at IS NULL OR occurred_at<to_at) AND (ingredient_value IS NULL OR ingredient_id=ingredient_value) AND (actor_value IS NULL OR actor_id=actor_value);
  o.put('total',n);o.put('registeredValue',ROUND(registered,2));o.put('estimatedValue',ROUND(estimated_value,2));o.put('entryCount',entry_count);o.put('hasMore',skip_rows+50<n);o.put('nextOffset',skip_rows+50);o.put('partial',FALSE);
  FOR r IN(SELECT * FROM alliance_material_entries WHERE business_id=b AND location_id=l AND (from_at IS NULL OR occurred_at>=from_at) AND (to_at IS NULL OR occurred_at<to_at) AND (ingredient_value IS NULL OR ingredient_id=ingredient_value) AND (actor_value IS NULL OR actor_id=actor_value) ORDER BY occurred_at DESC,id DESC OFFSET skip_rows ROWS FETCH NEXT 50 ROWS ONLY) LOOP a.append(item(r));END LOOP;o.put('records',a);a:=JSON_ARRAY_T();
  FOR r IN(SELECT ingredient_id,MAX(name) KEEP(DENSE_RANK LAST ORDER BY occurred_at,id) name,unit_id,SUM(quantity_delta) quantity,COUNT(*) entries,NVL(SUM(CASE WHEN estimated=0 THEN total_cost ELSE 0 END),0) registered_value,NVL(SUM(CASE WHEN estimated=1 THEN total_cost ELSE 0 END),0) estimated_amount FROM alliance_material_entries WHERE business_id=b AND location_id=l AND quantity_delta>0 AND source NOT IN('opening','correction','return') AND (from_at IS NULL OR occurred_at>=from_at) AND (to_at IS NULL OR occurred_at<to_at) AND (ingredient_value IS NULL OR ingredient_id=ingredient_value) AND (actor_value IS NULL OR actor_id=actor_value) GROUP BY ingredient_id,unit_id ORDER BY SUM(total_cost) DESC,ingredient_id FETCH FIRST 30 ROWS ONLY) LOOP g:=JSON_OBJECT_T();g.put('ingredientId',r.ingredient_id);g.put('name',r.name);g.put('unit',r.unit_id);g.put('quantity',r.quantity);g.put('entries',r.entries);g.put('registeredValue',r.registered_value);g.put('estimatedValue',r.estimated_amount);a.append(g);END LOOP;o.put('ingredients',a);a:=JSON_ARRAY_T();
  FOR r IN(SELECT actor_id,MAX(actor_name) KEEP(DENSE_RANK LAST ORDER BY occurred_at,id) actor_name FROM alliance_material_entries WHERE business_id=b AND location_id=l GROUP BY actor_id ORDER BY 2 FETCH FIRST 200 ROWS ONLY) LOOP g:=JSON_OBJECT_T();g.put('actorId',r.actor_id);g.put('actorName',r.actor_name);a.append(g);END LOOP;o.put('actors',a);RETURN o;
 END;
END;
/
