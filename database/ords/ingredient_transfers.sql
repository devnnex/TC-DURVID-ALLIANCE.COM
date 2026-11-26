CREATE OR REPLACE PACKAGE alliance_transfers AUTHID DEFINER AS
 FUNCTION eligible(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN NUMBER;
 FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_transfers AS
 FUNCTION eligible(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN NUMBER IS ctx JSON_OBJECT_T;perms JSON_ARRAY_T;n NUMBER;
 BEGIN
  IF NOT alliance_stock_notifications.is_boss(u,b,l) THEN RETURN 0;END IF;
  SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND id=l AND active=1 AND slug IN('cafeteria','cocteleria','gcobarf');IF n=0 THEN RETURN 0;END IF;
  ctx:=alliance_security.context_for(u);IF NOT ctx.get_object('permissions').has(l) THEN RETURN 0;END IF;perms:=ctx.get_object('permissions').get_array(l);
  FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i)='inventory.write' THEN RETURN 1;END IF;END LOOP;RETURN 0;
 END;
 FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  r JSON_OBJECT_T:=JSON_OBJECT_T();o JSON_OBJECT_T;entry JSON_OBJECT_T;notice JSON_OBJECT_T;before_value JSON_OBJECT_T;targets JSON_ARRAY_T:=JSON_ARRAY_T();history JSON_ARRAY_T:=JSON_ARRAY_T();people JSON_ARRAY_T;
  transfer alliance_ingredient_transfers%ROWTYPE;identifier VARCHAR2(64);dest VARCHAR2(36);recipient VARCHAR2(36);name_value VARCHAR2(160);unit_value VARCHAR2(12);sender_name VARCHAR2(160);source_name VARCHAR2(160);dest_name VARCHAR2(160);recipient_name VARCHAR2(160);raw_id VARCHAR2(80);movement_id VARCHAR2(80);quantity_value NUMBER;cost_value NUMBER;n NUMBER;body_value CLOB;status_value VARCHAR2(12);skip_rows NUMBER:=0;
 BEGIN
  IF eligible(u,b,l)<>1 THEN alliance_security.fail(403,'FORBIDDEN','Los envíos de insumos están disponibles solo para jefes con permiso de inventario.');END IF;
  IF a='ingredient_transfer_feed' THEN
   alliance_security.keys_only(p,'offset');IF p.has('offset') THEN skip_rows:=alliance_operations.numeric_value(p,'offset',0,1000000);IF skip_rows<>TRUNC(skip_rows) THEN alliance_security.fail(400,'INVALID_INPUT','Página no disponible.');END IF;END IF;
   FOR v IN(SELECT id,name FROM locations WHERE business_id=b AND id<>l AND active=1 AND slug IN('cafeteria','cocteleria','gcobarf') ORDER BY name) LOOP
    people:=JSON_ARRAY_T();
    FOR person IN(SELECT id,full_name FROM users WHERE business_id=b AND active=1 AND deleted_at IS NULL AND alliance_transfers.eligible(id,b,v.id)=1 ORDER BY full_name) LOOP entry:=JSON_OBJECT_T();entry.put('id',person.id);entry.put('name',person.full_name);people.append(entry);END LOOP;
    IF people.get_size>0 THEN o:=JSON_OBJECT_T();o.put('id',v.id);o.put('name',v.name);o.put('bosses',people);targets.append(o);END IF;
   END LOOP;
   SELECT COUNT(*) INTO n FROM alliance_ingredient_transfers WHERE business_id=b AND created_at>SYSTIMESTAMP-INTERVAL '7' DAY AND ((source_location_id=l AND sender_user_id=u) OR (destination_location_id=l AND recipient_user_id=u));
   FOR item IN(SELECT payload FROM alliance_ingredient_transfers WHERE business_id=b AND created_at>SYSTIMESTAMP-INTERVAL '7' DAY AND ((source_location_id=l AND sender_user_id=u) OR (destination_location_id=l AND recipient_user_id=u)) ORDER BY CASE WHEN destination_location_id=l AND recipient_user_id=u AND status='pending' THEN 0 ELSE 1 END,created_at DESC,id OFFSET skip_rows ROWS FETCH NEXT 50 ROWS ONLY) LOOP history.append(JSON_OBJECT_T(item.payload));END LOOP;
   r.put('targets',targets);r.put('history',history);r.put('hasMore',skip_rows+50<n);r.put('nextOffset',skip_rows+50);r.put('at',alliance_pos_store.stamp);RETURN r;
  ELSIF a='ingredient_transfer_send' THEN
   alliance_security.keys_only(p,'destinationId,recipientId,name,quantity,unit,totalCost,note');dest:=alliance_security.text_value(p,'destinationId',36);recipient:=alliance_security.text_value(p,'recipientId',36);
   IF dest=l OR eligible(recipient,b,dest)<>1 THEN alliance_security.fail(400,'INVALID_RECIPIENT','Selecciona el jefe de otro negocio disponible.');END IF;
   name_value:=alliance_security.text_value(p,'name',160);unit_value:=alliance_security.text_value(p,'unit',12);IF unit_value='unit' THEN unit_value:='u';END IF;quantity_value:=alliance_operations.numeric_value(p,'quantity',0.00000001,1e9);quantity_value:=ROUND(quantity_value,8);n:=alliance_operations.convert_quantity(1,unit_value,unit_value);
   IF p.has('totalCost') AND NOT p.get('totalCost').is_null THEN cost_value:=alliance_operations.numeric_value(p,'totalCost',0,1e12);END IF;
   IF NVL(cost_value,0)/quantity_value>=1e16 THEN alliance_security.fail(400,'INVALID_INPUT','El precio por unidad es demasiado alto. Revisa el precio, la cantidad y la unidad.');END IF;
   IF LENGTH(p.get_string('note'))>500 THEN alliance_security.fail(400,'INVALID_INPUT','La observación admite hasta 500 caracteres.');END IF;
   SELECT COUNT(*) INTO n FROM alliance_ingredient_transfers WHERE business_id=b AND source_location_id=l AND sender_user_id=u AND created_at>SYSTIMESTAMP-INTERVAL '1' HOUR;IF n>=100 THEN alliance_security.fail(429,'TRANSFER_LIMIT','Ya enviaste muchos registros. Espera antes de enviar otro.');END IF;
   SELECT full_name INTO sender_name FROM users WHERE business_id=b AND id=u;SELECT full_name INTO recipient_name FROM users WHERE business_id=b AND id=recipient;
   SELECT name INTO source_name FROM locations WHERE business_id=b AND id=l;SELECT name INTO dest_name FROM locations WHERE business_id=b AND id=dest;
   identifier:=alliance_security.new_id;o:=JSON_OBJECT_T();o.put('id',identifier);o.put('status','pending');o.put('name',name_value);o.put('quantity',quantity_value);o.put('unit',unit_value);IF cost_value IS NULL THEN o.put_null('totalCost');ELSE o.put('totalCost',cost_value);END IF;o.put('note',p.get_string('note'));o.put('sourceId',l);o.put('sourceName',source_name);o.put('destinationId',dest);o.put('destinationName',dest_name);o.put('senderId',u);o.put('senderName',sender_name);o.put('recipientId',recipient);o.put('recipientName',recipient_name);o.put('at',alliance_pos_store.stamp);
   body_value:=o.to_clob;INSERT INTO alliance_ingredient_transfers(id,business_id,source_location_id,destination_location_id,sender_user_id,recipient_user_id,payload)VALUES(identifier,b,l,dest,u,recipient,body_value);
   notice:=JSON_OBJECT_T(o.to_clob);notice.put('kind','ingredient-transfer');notice.put('transferId',identifier);notice.put('body',sender_name||' de '||source_name||' te envió '||name_value||'. Revisa la cantidad y acepta para agregarlo a tu macro de insumos.');
   body_value:=notice.to_clob;INSERT INTO alliance_notice_events(id,business_id,location_id,actor_user_id,kind,payload)VALUES(identifier,b,dest,u,'ingredient-transfer',body_value);alliance_notices.changed(b,dest);
   r.put('transfer',o);RETURN r;
  ELSIF a IN('ingredient_transfer_accept','ingredient_transfer_reject') THEN
   alliance_security.keys_only(p,'id');identifier:=alliance_security.text_value(p,'id',64);
   BEGIN SELECT * INTO transfer FROM alliance_ingredient_transfers WHERE id=identifier AND business_id=b AND destination_location_id=l AND recipient_user_id=u AND created_at>SYSTIMESTAMP-INTERVAL '7' DAY FOR UPDATE;
   EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'TRANSFER_MISSING','Este envío venció o no está dirigido a ti.');END;
   o:=JSON_OBJECT_T(transfer.payload);
   IF transfer.status<>'pending' THEN IF (a='ingredient_transfer_accept' AND transfer.status<>'accepted') OR (a='ingredient_transfer_reject' AND transfer.status<>'rejected') THEN alliance_security.fail(409,'TRANSFER_RESOLVED','Este envío ya fue respondido. Actualiza para ver su estado.');END IF;r.put('transfer',o);RETURN r;END IF;
   IF a='ingredient_transfer_accept' THEN
    -- Match an active ingredient by name and exact base unit; never overwrite its cost.
    raw_id:=NULL;name_value:=o.get_string('name');unit_value:=o.get_string('unit');quantity_value:=o.get_number('quantity');cost_value:=NVL(o.get_number('totalCost'),0);
    FOR item IN(SELECT id FROM alliance_raw_stock s WHERE business_id=b AND location_id=l AND LOWER(TRIM(name))=LOWER(TRIM(name_value)) AND unit_id=unit_value AND NOT EXISTS(SELECT 1 FROM alliance_pos_documents d WHERE d.business_id=b AND d.location_id=l AND d.entity='op_archivedingredients' AND d.id=s.id) ORDER BY id FETCH FIRST 1 ROW ONLY) LOOP raw_id:=item.id;END LOOP;
    IF raw_id IS NULL THEN raw_id:='TRANSFER-'||identifier;INSERT INTO alliance_raw_stock(business_id,location_id,id,name,unit_id)VALUES(b,l,raw_id,name_value,unit_value);END IF;
    before_value:=alliance_operations.raw_item(b,l,raw_id);
    UPDATE alliance_raw_stock SET unit_cost=(GREATEST(quantity,0)*unit_cost+cost_value)/(GREATEST(quantity,0)+quantity_value) WHERE business_id=b AND location_id=l AND id=raw_id;
    movement_id:='TRANSFER-'||identifier;alliance_operations.raw_move(u,b,l,movement_id,raw_id,quantity_value,'in','Envío de '||o.get_string('sourceName'));o.put('ingredientId',raw_id);o.put('status','accepted');
    entry:=JSON_OBJECT_T();entry.put('ingredientId',raw_id);entry.put('quantity',quantity_value);entry.put('unit',unit_value);entry.put('totalCost',cost_value);entry.put('reason','Sobrante recibido de '||o.get_string('sourceName'));entry.put('kind','in');alliance_material_ledger.annotate(u,b,l,movement_id,'materials_adjust',entry,before_value);
   ELSE o.put('status','rejected');END IF;
   o.put('resolvedAt',alliance_pos_store.stamp);body_value:=o.to_clob;status_value:=o.get_string('status');UPDATE alliance_ingredient_transfers SET status=status_value,payload=body_value WHERE id=identifier;
   -- Resolve the inbox card as part of the same transaction as the inventory entry.
   UPDATE alliance_notice_events SET payload=JSON_MERGEPATCH(payload,JSON_OBJECT('status' VALUE status_value)) WHERE id=identifier AND business_id=b AND location_id=l;
   alliance_notices.changed(b,l);r.put('transfer',o);RETURN r;
  END IF;
  alliance_security.fail(400,'INVALID_ACTION','Acción de envío no disponible.');RETURN r;
 END;
END;
/
