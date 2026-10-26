CREATE OR REPLACE PACKAGE alliance_customer_schedule AUTHID DEFINER AS
  PROCEDURE update_customer(u VARCHAR2,b VARCHAR2,l VARCHAR2,id_value VARCHAR2,body JSON_OBJECT_T,old JSON_OBJECT_T,o IN OUT JSON_OBJECT_T);
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_customer_schedule AS
  PROCEDURE update_customer(u VARCHAR2,b VARCHAR2,l VARCHAR2,id_value VARCHAR2,body JSON_OBJECT_T,old JSON_OBJECT_T,o IN OUT JSON_OBJECT_T) IS at_value VARCHAR2(30):=alliance_activity.occurred_at;
  BEGIN
    alliance_security.require_location(u,b,l,'customers.write');
    DECLARE shift_date DATE;frequency VARCHAR2(20);due_date VARCHAR2(10);reschedule JSON_ARRAY_T;expected_debt JSON_OBJECT_T;debt JSON_OBJECT_T;changes JSON_ARRAY_T;change_row JSON_OBJECT_T;actor_name VARCHAR2(160);seen JSON_OBJECT_T:=JSON_OBJECT_T();debt_id VARCHAR2(80);
          BEGIN
            IF body.has('paymentFrequency') THEN frequency:=alliance_security.text_value(body,'paymentFrequency',20);ELSIF old IS NOT NULL THEN frequency:=old.get_string('paymentFrequency');END IF;frequency:=NVL(frequency,'once');
            IF body.has('paymentDate') THEN IF NOT body.get('paymentDate').is_string AND NOT body.get('paymentDate').is_null THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha acordada de pago.');END IF;IF body.get_string('paymentDate') IS NOT NULL THEN due_date:=alliance_security.text_value(body,'paymentDate',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');END IF;ELSIF old IS NOT NULL THEN due_date:=old.get_string('paymentDate');END IF;
            IF frequency NOT IN('once','weekly','fortnightly','monthly') OR (frequency<>'once' AND due_date IS NULL) THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la frecuencia y la fecha de pago.');END IF;
            IF due_date IS NOT NULL THEN BEGIN shift_date:=TO_DATE(due_date,'FXYYYY-MM-DD');IF shift_date<DATE '1900-01-01' THEN RAISE VALUE_ERROR;END IF;EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha acordada de pago.');END;END IF;
            o.remove('rescheduleDebts');o.put('paymentFrequency',frequency);o.put('paymentDate',NVL(due_date,''));
            IF body.has('rescheduleDebts') THEN IF NOT body.get('rescheduleDebts').is_array THEN alliance_security.fail(400,'INVALID_INPUT','Revisa las cuentas que deseas actualizar.');END IF;reschedule:=body.get_array('rescheduleDebts');IF reschedule IS NULL OR reschedule.get_size>1000 THEN alliance_security.fail(400,'INVALID_INPUT','Revisa las cuentas que deseas actualizar.');END IF;ELSE reschedule:=JSON_ARRAY_T();END IF;
            IF reschedule.get_size>0 AND due_date IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Selecciona la nueva fecha de pago.');END IF;
            SELECT full_name INTO actor_name FROM users WHERE id=u AND business_id=b;
            FOR j IN 0..reschedule.get_size-1 LOOP
              IF NOT reschedule.get(j).is_object THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la cuenta que deseas actualizar.');END IF;expected_debt:=TREAT(reschedule.get(j) AS JSON_OBJECT_T);alliance_security.keys_only(expected_debt,'id,dueDate,total,paid');debt_id:=alliance_security.text_value(expected_debt,'id',80);debt:=alliance_operations.checked(b,l,'debts',debt_id);
              IF seen.has(debt_id) OR debt.get_string('customerId')<>id_value OR debt.get_boolean('voided') OR debt.get_number('paid')>=debt.get_number('total') OR NVL(debt.get_string('dueDate'),'-')<>NVL(expected_debt.get_string('dueDate'),'-') OR debt.get_number('total')<>alliance_operations.numeric_value(expected_debt,'total') OR debt.get_number('paid')<>alliance_operations.numeric_value(expected_debt,'paid') THEN alliance_security.fail(409,'VERSION_CONFLICT','El saldo o su fecha cambio. Actualiza antes de guardar.');END IF;seen.put(debt_id,TRUE);
              IF debt.has('dueDateChanges') THEN changes:=debt.get_array('dueDateChanges');ELSE changes:=JSON_ARRAY_T();END IF;change_row:=JSON_OBJECT_T();change_row.put('previousDate',debt.get_string('dueDate'));change_row.put('newDate',due_date);change_row.put('actorId',u);change_row.put('actorName',actor_name);change_row.put('occurredAt',at_value);changes.append(change_row);debt.put('dueDateChanges',changes);debt.put('dueDate',due_date);alliance_operations.put_row(u,b,l,'debts',debt_id,debt);
            END LOOP;
          END;
  END;
END;
/
