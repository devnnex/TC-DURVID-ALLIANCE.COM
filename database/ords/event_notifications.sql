CREATE OR REPLACE PACKAGE BODY alliance_notices AS
 PROCEDURE changed(b VARCHAR2,l VARCHAR2) IS n NUMBER;
 BEGIN
  SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND id=l AND active=1 AND slug IN('cafeteria','cocteleria');IF n=0 THEN RETURN;END IF;
  UPDATE alliance_notice_scopes SET version=version+1,updated_at=SYSTIMESTAMP WHERE business_id=b AND location_id=l;
  IF SQL%ROWCOUNT=0 THEN BEGIN INSERT INTO alliance_notice_scopes(business_id,location_id)VALUES(b,l);EXCEPTION WHEN DUP_VAL_ON_INDEX THEN UPDATE alliance_notice_scopes SET version=version+1,updated_at=SYSTIMESTAMP WHERE business_id=b AND location_id=l;END;END IF;
 END;
 PROCEDURE login_event(u VARCHAR2,b VARCHAR2,l VARCHAR2) IS role_value VARCHAR2(30);name_value VARCHAR2(160);n NUMBER;event_value JSON_OBJECT_T:=JSON_OBJECT_T();event_id VARCHAR2(64):=alliance_security.new_id;body_value CLOB;
 BEGIN
  SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND id=l AND active=1 AND slug IN('cafeteria','cocteleria');IF n=0 OR alliance_security.location_owner(u,b,l) THEN RETURN;END IF;
  SELECT CASE WHEN SUM(CASE WHEN role_code='ADMIN' THEN 1 ELSE 0 END)>0 THEN 'Administrador' WHEN SUM(CASE WHEN role_code='WAITER' THEN 1 ELSE 0 END)>0 THEN 'Mesero' END INTO role_value FROM user_location_roles WHERE business_id=b AND location_id=l AND user_id=u;IF role_value IS NULL THEN RETURN;END IF;
  -- Refreshing a token does not emit an event. Repeated logins by the same person are grouped for two minutes.
  SELECT COUNT(*) INTO n FROM alliance_notice_events WHERE business_id=b AND location_id=l AND actor_user_id=u AND kind='staff-login' AND created_at>SYSTIMESTAMP-INTERVAL '2' MINUTE;IF n>0 THEN RETURN;END IF;
  SELECT full_name INTO name_value FROM users WHERE business_id=b AND id=u AND active=1 AND deleted_at IS NULL;
  event_value.put('id',event_id);event_value.put('kind','staff-login');event_value.put('name',name_value);event_value.put('role',role_value);event_value.put('at',alliance_pos_store.stamp);event_value.put('body',name_value||' inició sesión como '||LOWER(role_value)||'. Tu equipo se está preparando para atender.');body_value:=event_value.to_clob;
  event_id:=alliance_security.hash_text('login:'||b||':'||l||':'||u||':'||TRUNC((CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE)-DATE '1970-01-01')*720));event_value.put('id',event_id);body_value:=event_value.to_clob;
  BEGIN INSERT INTO alliance_notice_events(id,business_id,location_id,actor_user_id,kind,payload)VALUES(event_id,b,l,u,'staff-login',body_value);EXCEPTION WHEN DUP_VAL_ON_INDEX THEN RETURN;END;changed(b,l);
 END;
 FUNCTION feed(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN JSON_ARRAY_T IS result_value JSON_ARRAY_T:=JSON_ARRAY_T();
 BEGIN
  IF NOT alliance_stock_notifications.is_boss(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Estos avisos pertenecen al jefe del negocio.');END IF;
  FOR x IN(SELECT payload FROM alliance_notice_events WHERE business_id=b AND location_id=l AND created_at>SYSTIMESTAMP-INTERVAL '7' DAY ORDER BY created_at DESC FETCH FIRST 30 ROWS ONLY) LOOP result_value.append(JSON_OBJECT_T(x.payload));END LOOP;RETURN result_value;
 END;
 PROCEDURE dispatch_pending IS
  cfg alliance_notice_config%ROWTYPE;n NUMBER;request_value UTL_HTTP.req;response_value UTL_HTTP.resp;status_value NUMBER;pending_count NUMBER;body_value VARCHAR2(40):='{"ref":"main"}';
 BEGIN
  SELECT COUNT(*) INTO pending_count FROM alliance_notice_scopes d WHERE version>processed_version AND EXISTS(SELECT 1 FROM alliance_push_subscriptions s WHERE s.business_id=d.business_id AND s.location_id=d.location_id AND s.active=1);IF pending_count=0 THEN RETURN;END IF;
  SELECT * INTO cfg FROM alliance_notice_config WHERE id=1 FOR UPDATE NOWAIT;
  IF cfg.enabled<>1 OR cfg.dispatch_token IS NULL OR cfg.next_dispatch>SYSTIMESTAMP THEN ROLLBACK;RETURN;END IF;
  -- A fixed repository/workflow allowlist prevents this private credential from being sent elsewhere.
  IF cfg.dispatch_url<>'https://api.github.com/repos/devnnex/TC-DURVID-ALLIANCE.COM/actions/workflows/stock-notifications.yml/dispatches' THEN ROLLBACK;RETURN;END IF;
  UTL_HTTP.set_transfer_timeout(8);request_value:=UTL_HTTP.begin_request(cfg.dispatch_url,'POST','HTTP/1.1');UTL_HTTP.set_header(request_value,'Authorization','Bearer '||cfg.dispatch_token);UTL_HTTP.set_header(request_value,'Accept','application/vnd.github+json');UTL_HTTP.set_header(request_value,'X-GitHub-Api-Version','2022-11-28');UTL_HTTP.set_header(request_value,'User-Agent','Alliance-Notifications');UTL_HTTP.set_header(request_value,'Content-Type','application/json');UTL_HTTP.set_header(request_value,'Content-Length',LENGTHB(body_value));UTL_HTTP.write_text(request_value,body_value);response_value:=UTL_HTTP.get_response(request_value);status_value:=response_value.status_code;UTL_HTTP.end_response(response_value);
  UPDATE alliance_notice_config SET next_dispatch=SYSTIMESTAMP+INTERVAL '60' SECOND,last_status=status_value WHERE id=1;COMMIT;
 EXCEPTION WHEN OTHERS THEN ROLLBACK;UPDATE alliance_notice_config SET next_dispatch=SYSTIMESTAMP+INTERVAL '60' SECOND,last_status=-1 WHERE id=1;COMMIT;
 END;
END;
/
