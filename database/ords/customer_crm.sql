CREATE OR REPLACE PACKAGE alliance_customer_crm AUTHID DEFINER AS
  FUNCTION phone_key(v VARCHAR2) RETURN VARCHAR2;
  FUNCTION profile(b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION register_order(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T,order_id VARCHAR2) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_customer_crm AS
  FUNCTION phone_key(v VARCHAR2) RETURN VARCHAR2 IS digits VARCHAR2(80):=REGEXP_REPLACE(v,'[^0-9]','');BEGIN IF LENGTH(digits)=10 THEN RETURN '57'||digits;END IF;RETURN digits;END;
  FUNCTION profile(b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    o JSON_OBJECT_T:=JSON_OBJECT_T();name_value VARCHAR2(160);phone_value VARCHAR2(40);birth_value VARCHAR2(10);birthday DATE;n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND id=l AND slug IN('cocteleria','cafeteria');IF n<>1 THEN alliance_security.fail(403,'CRM_BRANCH','El CRM está disponible en cafetería y coctelería.');END IF;
    name_value:=TRIM(alliance_security.text_value(p,'name',160));phone_value:=TRIM(alliance_security.text_value(p,'phone',40));birth_value:=alliance_security.text_value(p,'birthDate',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
    IF name_value IS NULL OR phone_value IS NULL THEN alliance_security.fail(400,'CRM_INPUT','Completa el nombre y el teléfono del cliente.');END IF;
    IF NOT REGEXP_LIKE(phone_value,'^[+0-9 ().-]+$') OR LENGTH(phone_key(phone_value)) NOT BETWEEN 7 AND 15 THEN alliance_security.fail(400,'CRM_PHONE','Revisa el teléfono del cliente.');END IF;
    BEGIN birthday:=TO_DATE(birth_value,'FXYYYY-MM-DD');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'CRM_BIRTHDAY','Selecciona una fecha de cumpleaños válida.');END;
    IF birth_value<'1900-01-01' OR birthday>TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Bogota' AS DATE)) THEN alliance_security.fail(400,'CRM_BIRTHDAY','La fecha de cumpleaños no puede ser futura.');END IF;
    IF alliance_security.flag(p,'contactConsent')<>1 THEN alliance_security.fail(400,'CRM_CONSENT','Confirma que el cliente autorizó su registro.');END IF;
    o.put('name',name_value);o.put('phone',phone_value);o.put('phoneKey',phone_key(phone_value));o.put('birthDate',birth_value);o.put('contactConsent',TRUE);RETURN o;
  END;
  FUNCTION register_order(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T,order_id VARCHAR2) RETURN JSON_OBJECT_T IS
    o JSON_OBJECT_T;result_value JSON_OBJECT_T:=JSON_OBJECT_T();customer_id VARCHAR2(80);key_value VARCHAR2(80);actor_name VARCHAR2(160);at_value VARCHAR2(30):=alliance_activity.occurred_at;
  BEGIN
    alliance_security.keys_only(p,'name,phone,birthDate,contactConsent');o:=profile(b,l,p);key_value:=o.get_string('phoneKey');
    FOR c IN(SELECT id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_customers' AND alliance_customer_crm.phone_key(JSON_VALUE(data_json,'$.phone' RETURNING VARCHAR2(40)))=key_value ORDER BY created_at FETCH FIRST 1 ROW ONLY) LOOP customer_id:=c.id;END LOOP;
    IF customer_id IS NULL THEN
      customer_id:='crm-'||order_id;SELECT full_name INTO actor_name FROM users WHERE business_id=b AND id=u;
      o.put('id',customer_id);o.put('active',TRUE);o.put('document','');o.put('allowCredit',FALSE);o.put('creditLimit',0);o.put('paymentFrequency','once');o.put('paymentDate','');o.put('source','waiter');o.put('sourceOrderId',order_id);o.put('revision',1);o.put('consentAt',at_value);o.put('consentById',u);o.put('consentByName',actor_name);
      alliance_operations.put_row(u,b,l,'customers',customer_id,o);alliance_pos_store.audit(u,b,'CRM_ENROLL_FROM_ORDER',customer_id,NULL,o.to_clob);alliance_activity.record_event(u,b,l,'customers','CRM_ENROLL_FROM_ORDER','Registró un cliente autorizado desde su comanda',customer_id);
    END IF;
    -- Return only this order's association; a waiter cannot inspect the CRM record.
    result_value.put('id',customer_id);result_value.put('name',p.get_string('name'));RETURN result_value;
  END;
END;
/
