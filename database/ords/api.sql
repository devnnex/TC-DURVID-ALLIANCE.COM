CREATE OR REPLACE PACKAGE alliance_api AUTHID DEFINER AS
  FUNCTION dispatch(p_request CLOB) RETURN CLOB;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_api AS
  FUNCTION dispatch(p_request CLOB) RETURN CLOB IS
    req JSON_OBJECT_T;body JSON_OBJECT_T;data JSON_OBJECT_T:=JSON_OBJECT_T();data_array JSON_ARRAY_T;result_json JSON_OBJECT_T:=JSON_OBJECT_T();error_json JSON_OBJECT_T:=JSON_OBJECT_T();
    method_value VARCHAR2(6);path_value VARCHAR2(160);location_value VARCHAR2(36);id_value VARCHAR2(36);access_value VARCHAR2(64);refresh_value VARCHAR2(64);s alliance_api_sessions%ROWTYPE;
    n NUMBER;setup_enabled NUMBER;operations_json JSON_ARRAY_T;acks JSON_ARRAY_T;operation_value JSON_OBJECT_T;ack JSON_OBJECT_T;cursor_value NUMBER;bootstrap_json JSON_OBJECT_T;setup_value VARCHAR2(128);login_user JSON_OBJECT_T;branch_value VARCHAR2(80);login_business VARCHAR2(36);username_value users.username%TYPE;
  BEGIN
    alliance_activity.client_context;alliance_security.error_status:=500;alliance_security.error_code:='INTERNAL_ERROR';alliance_security.error_message:='No fue posible completar la operacion.';
    IF p_request IS NULL OR DBMS_LOB.GETLENGTH(p_request)>1048576 THEN alliance_security.fail(400,'INVALID_INPUT','Solicitud invalida o demasiado grande.');END IF;
    req:=JSON_OBJECT_T(p_request);alliance_security.keys_only(req,'method,path,body,access_token,refresh_token,location_id,setup_token');
    method_value:=alliance_security.text_value(req,'method',6,'^(GET|POST|PUT)$');path_value:=alliance_security.text_value(req,'path',160);
    IF method_value='GET' THEN SET TRANSACTION READ ONLY;END IF;
    IF req.has('body') THEN body:=req.get_object('body');ELSE body:=JSON_OBJECT_T();END IF;
    IF method_value='GET' AND path_value='/health' THEN data.put('ok',TRUE);data.put('provider','oracle-ords');data.put('version','0.4.0');data.put('scope','branch-operation-administration');
    ELSIF method_value='GET' AND path_value='/installation' THEN
      SELECT COUNT(*) INTO n FROM businesses;SELECT COUNT(*) INTO setup_enabled FROM alliance_api_settings WHERE id=1 AND enabled=1;
      data.put('provider','oracle-ords');data.put('setup_required',n=0);data.put('setup_available',setup_enabled=1);
    ELSIF method_value='POST' AND path_value='/admin/setup' THEN setup_value:=req.get_string('setup_token');data:=alliance_administration.setup(body,setup_value);
    ELSIF method_value='POST' AND path_value='/auth/login/challenge' THEN data:=alliance_auth_proof.challenge(body,req.get_string('location_id'));
    ELSIF method_value='POST' AND path_value IN('/auth/login','/auth/login/proof') THEN
      IF path_value='/auth/login/proof' THEN data:=alliance_auth_proof.finish(body,req.get_string('location_id'));ELSE data:=alliance_security.login(body);END IF;login_user:=data.get_object('context').get_object('user');branch_value:=req.get_string('location_id');
      -- A branch login returns its authorized initial view in the same response.
      IF branch_value IS NOT NULL THEN
        login_user:=data.get_object('context').get_object('user');login_business:=login_user.get_string('business_id');
        BEGIN SELECT id INTO location_value FROM locations WHERE business_id=login_business AND active=1 AND (slug=branch_value OR id=branch_value);
        EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(403,'FORBIDDEN','No tienes acceso a esta sucursal.');END;
        bootstrap_json:=JSON_OBJECT_T();bootstrap_json.put('action','bootstrap');bootstrap_json.put('payload',JSON_OBJECT_T());
        bootstrap_json:=alliance_pos.dispatch(login_user.get_string('id'),login_user.get_string('business_id'),location_value,bootstrap_json);
        data.put('bootstrap',bootstrap_json.get_object('value'));
      END IF;
      alliance_activity.record_event(login_user.get_string('id'),login_user.get_string('business_id'),location_value,CASE WHEN location_value IS NULL THEN 'users' ELSE 'dashboard' END,'LOGIN','Inició sesión');
    ELSIF method_value='POST' AND path_value='/auth/refresh' THEN data:=alliance_security.renew(req.get_string('refresh_token'));
    ELSIF method_value='POST' AND path_value='/auth/logout' THEN
      BEGIN s:=alliance_security.authenticate(req.get_string('access_token'));
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE<>-20001 OR alliance_security.error_status<>401 THEN RAISE;END IF;
        s:=alliance_security.authenticate(req.get_string('refresh_token'),TRUE);
      END;
      alliance_activity.record_event(s.user_id,s.business_id,NULL,'users','LOGOUT','Cerró sesión');
      UPDATE alliance_api_sessions SET revoked=1 WHERE id=s.id;data.put('ok',TRUE);
    ELSIF method_value='POST' AND path_value='/pos/public' THEN data:=alliance_pos.public_dispatch(body);
    ELSE
      access_value:=req.get_string('access_token');s:=alliance_security.authenticate(access_value);
      IF method_value='GET' AND path_value='/context' THEN data:=alliance_security.context_for(s.user_id);
      ELSIF method_value='GET' AND path_value='/admin/overview' THEN data:=alliance_administration.overview(s.user_id,s.business_id);
      ELSIF method_value IN ('POST','PUT') AND (path_value='/admin/locations' OR REGEXP_LIKE(path_value,'^/admin/locations/[0-9a-fA-F-]{36}$')) THEN
        IF method_value='PUT' THEN id_value:=SUBSTR(path_value,18);IF LENGTH(id_value)<>36 THEN alliance_security.fail(400,'INVALID_INPUT','Falta el identificador de sucursal.');END IF;
        ELSIF path_value<>'/admin/locations' THEN alliance_security.fail(404,'NOT_FOUND','Ruta no disponible.');END IF;
        alliance_administration.save_location(s.user_id,s.business_id,id_value,body);
        IF id_value IS NULL THEN branch_value:=body.get_string('slug');SELECT id INTO id_value FROM locations WHERE business_id=s.business_id AND slug=branch_value;END IF;
        alliance_activity.record_event(s.user_id,s.business_id,NULL,'users','LOCATION_SAVE',CASE WHEN method_value='POST' THEN 'Creó una sucursal: ' ELSE 'Editó una sucursal: ' END||body.get_string('name'),id_value);data.put('ok',TRUE);
      ELSIF method_value IN ('POST','PUT') AND (path_value='/admin/users' OR REGEXP_LIKE(path_value,'^/admin/users/[0-9a-fA-F-]{36}$')) THEN
        IF method_value='PUT' THEN id_value:=SUBSTR(path_value,14);IF LENGTH(id_value)<>36 THEN alliance_security.fail(400,'INVALID_INPUT','Falta el identificador de usuario.');END IF;
        ELSIF path_value<>'/admin/users' THEN alliance_security.fail(404,'NOT_FOUND','Ruta no disponible.');END IF;
        alliance_administration.save_user(s.user_id,s.business_id,id_value,body,req.get_string('location_id'));
        IF id_value IS NULL THEN username_value:=body.get_string('username');SELECT id INTO id_value FROM users WHERE business_id=s.business_id AND username=TRIM(username_value);END IF;
        alliance_activity.record_event(s.user_id,s.business_id,NULL,'users','USER_ACCESS_SAVE',CASE WHEN method_value='POST' THEN 'Creó un usuario: ' ELSE 'Editó un usuario o sus permisos: ' END||body.get_string('name'),id_value);data.put('ok',TRUE);
      ELSE
        location_value:=req.get_string('location_id');
        IF method_value='POST' AND path_value='/activity/visit' THEN data:=alliance_activity.visit(s.user_id,s.business_id,location_value,body);
        ELSIF method_value='POST' AND path_value='/admin/activity' THEN data:=alliance_activity.feed(s.user_id,s.business_id,body);
        ELSIF method_value='POST' AND path_value='/pos/batch' THEN data:=alliance_pos_batch.dispatch(s.user_id,s.business_id,location_value,body);
        ELSIF method_value='POST' AND path_value='/pos' THEN data:=alliance_pos.dispatch(s.user_id,s.business_id,location_value,body);
        ELSIF method_value='POST' AND path_value='/devices/register' THEN alliance_catalog.register_device(s.user_id,s.business_id,location_value,body);data.put('ok',TRUE);
        ELSIF method_value='GET' AND path_value='/bootstrap' THEN data:=alliance_catalog.bootstrap(s.user_id,s.business_id,location_value);
        ELSIF method_value='GET' AND path_value IN ('/products','/ingredients','/units') THEN
          IF path_value='/ingredients' THEN alliance_security.require_location(s.user_id,s.business_id,location_value,'inventory.read');END IF;
          bootstrap_json:=alliance_catalog.bootstrap(s.user_id,s.business_id,location_value);data_array:=bootstrap_json.get_array(SUBSTR(path_value,2));
        ELSIF method_value='GET' AND (path_value='/sync/changes' OR REGEXP_LIKE(path_value,'^/sync/changes\?cursor=[0-9]{1,16}$')) THEN
          IF path_value='/sync/changes' THEN cursor_value:=0;ELSE cursor_value:=TO_NUMBER(SUBSTR(path_value,22));END IF;
          data:=alliance_catalog.changes(s.user_id,s.business_id,location_value,cursor_value);
        ELSIF method_value='POST' AND path_value='/sync' THEN
          alliance_security.keys_only(body,'operations');operations_json:=body.get_array('operations');
          IF operations_json.get_size<1 OR operations_json.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Envia de 1 a 100 operaciones.');END IF;
          acks:=JSON_ARRAY_T();
          FOR i IN 0..operations_json.get_size-1 LOOP
            operation_value:=TREAT(operations_json.get(i) AS JSON_OBJECT_T);SAVEPOINT operation_start;
            BEGIN ack:=alliance_catalog.apply_operation(s.user_id,s.business_id,location_value,operation_value);COMMIT;
            EXCEPTION WHEN OTHERS THEN
              ROLLBACK TO operation_start;
              IF SQLCODE=-20001 AND alliance_security.error_status BETWEEN 400 AND 499 AND alliance_security.error_status<>401 THEN
                ack:=JSON_OBJECT_T();ack.put('operation_id',operation_value.get_string('operation_id'));ack.put('status','REQUIRES_REVIEW');ack.put('code',alliance_security.error_code);ack.put('message',alliance_security.error_message);
              ELSE RAISE;END IF;
            END;
            acks.append(ack);
          END LOOP;
          data.put('results',acks);
        ELSE alliance_security.fail(404,'NOT_FOUND','Ruta no disponible.');END IF;
      END IF;
    END IF;
    COMMIT;result_json.put('status',200);IF data_array IS NOT NULL THEN result_json.put('data',data_array);ELSE result_json.put('data',data);END IF;RETURN result_json.to_clob;
  EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    IF SQLCODE=-20001 THEN n:=alliance_security.error_status;error_json.put('code',alliance_security.error_code);error_json.put('message',alliance_security.error_message);
    ELSIF SQLCODE=-1 THEN n:=409;error_json.put('code','DUPLICATE');error_json.put('message','El identificador o usuario ya existe.');
    ELSIF SQLCODE IN (-40566,-40441,-40573,-30625,-6502,-1722,-1843,-1861,-1830) THEN n:=400;error_json.put('code','INVALID_INPUT');error_json.put('message','Revisa los datos de la solicitud.');
    ELSE n:=500;error_json.put('code','INTERNAL_ERROR');error_json.put('message','No fue posible completar la operacion.');END IF;
    data:=JSON_OBJECT_T();data.put('error',error_json);result_json:=JSON_OBJECT_T();result_json.put('status',n);result_json.put('data',data);RETURN result_json.to_clob;
  END;
END;
/
