CREATE OR REPLACE PACKAGE alliance_pos_batch AUTHID DEFINER AS
  FUNCTION dispatch(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_pos_batch AS
  FUNCTION dispatch(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    operations JSON_ARRAY_T;results JSON_ARRAY_T:=JSON_ARRAY_T();operation_value JSON_OBJECT_T;ack JSON_OBJECT_T;answer JSON_OBJECT_T;visit_body JSON_OBJECT_T;output JSON_OBJECT_T:=JSON_OBJECT_T();operation_id VARCHAR2(160);failed BOOLEAN;
  BEGIN
    alliance_security.keys_only(p,'operations');operations:=p.get_array('operations');IF operations IS NULL OR operations.get_size<1 OR operations.get_size>20 THEN alliance_security.fail(400,'INVALID_INPUT','Envía de 1 a 20 operaciones.');END IF;
    FOR i IN 0..operations.get_size-1 LOOP
      SAVEPOINT batch_operation;failed:=FALSE;ack:=JSON_OBJECT_T();operation_id:=NULL;alliance_security.error_status:=500;alliance_security.error_code:='INTERNAL_ERROR';alliance_security.error_message:='No fue posible confirmar el registro.';
      BEGIN
        IF NOT operations.get(i).is_object THEN alliance_security.fail(400,'INVALID_INPUT','Operación inválida.');END IF;operation_value:=TREAT(operations.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(operation_value,'action,payload,operation_id,device_id,client_created_at');operation_id:=alliance_security.text_value(operation_value,'operation_id',160);ack.put('operation_id',operation_id);
        IF operation_value.get_string('action')='section_visit' THEN
          visit_body:=JSON_OBJECT_T(operation_value.get_object('payload').to_clob);visit_body.put('device_id',operation_value.get_string('device_id'));visit_body.put('client_created_at',operation_value.get_string('client_created_at'));answer:=alliance_activity.visit(u,b,l,visit_body);
        ELSE answer:=alliance_pos.dispatch(u,b,l,operation_value);END IF;
        ack.put('status',200);
      EXCEPTION WHEN OTHERS THEN
        ROLLBACK TO batch_operation;failed:=TRUE;ack.put('operation_id',operation_id);answer:=JSON_OBJECT_T();
        IF SQLCODE=-20001 THEN ack.put('status',alliance_security.error_status);answer.put('code',alliance_security.error_code);answer.put('message',alliance_security.error_message);
        ELSIF SQLCODE=-1 THEN ack.put('status',409);answer.put('code','DUPLICATE');answer.put('message','El registro ya existe.');
        ELSIF SQLCODE IN(-40566,-40441,-40573,-30625,-6502,-1722,-1843,-1861,-1830) THEN ack.put('status',400);answer.put('code','INVALID_INPUT');answer.put('message','Revisa los datos del registro.');
        ELSE ack.put('status',500);answer.put('code','INTERNAL_ERROR');answer.put('message','No fue posible confirmar el registro.');END IF;ack.put('error',answer);
      END;
      results.append(ack);IF failed THEN EXIT;END IF;
    END LOOP;
    output.put('results',results);RETURN output;
  END;
END;
/
