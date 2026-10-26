CREATE OR REPLACE PACKAGE alliance_security AUTHID DEFINER AS
  FUNCTION new_id RETURN VARCHAR2;
  FUNCTION hash_text(p_text VARCHAR2) RETURN VARCHAR2;
  FUNCTION password_hash(p_password VARCHAR2,p_salt VARCHAR2 DEFAULT NULL) RETURN VARCHAR2;
  FUNCTION verify_password(p_password VARCHAR2,p_hash VARCHAR2) RETURN BOOLEAN;
  FUNCTION text_value(p_obj JSON_OBJECT_T,p_key VARCHAR2,p_max NUMBER,p_pattern VARCHAR2 DEFAULT NULL) RETURN VARCHAR2;
  FUNCTION flag(p_obj JSON_OBJECT_T,p_key VARCHAR2) RETURN NUMBER;
  PROCEDURE keys_only(p_obj JSON_OBJECT_T,p_keys VARCHAR2);
  PROCEDURE fail(p_status NUMBER,p_code VARCHAR2,p_message VARCHAR2);
  FUNCTION owner(p_user VARCHAR2,p_business VARCHAR2) RETURN BOOLEAN;
  FUNCTION location_owner(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN BOOLEAN;
  FUNCTION can_manage(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2 DEFAULT NULL) RETURN BOOLEAN;
  FUNCTION context_for(p_user VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION authenticate(p_token VARCHAR2,p_refresh BOOLEAN DEFAULT FALSE) RETURN alliance_api_sessions%ROWTYPE;
  FUNCTION issue_session(p_user VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION login(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION renew(p_token VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE throttle(p_bucket VARCHAR2,p_max NUMBER);
  PROCEDURE require_location(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_permission VARCHAR2);
  error_status NUMBER:=500;
  error_code VARCHAR2(80):='INTERNAL_ERROR';
  error_message VARCHAR2(200):='No fue posible completar la operacion.';
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_security AS
  FUNCTION new_id RETURN VARCHAR2 IS v VARCHAR2(32):=LOWER(RAWTOHEX(SYS_GUID()));
  BEGIN RETURN SUBSTR(v,1,8)||'-'||SUBSTR(v,9,4)||'-4'||SUBSTR(v,14,3)||'-8'||SUBSTR(v,18,3)||'-'||SUBSTR(v,21,12); END;
  FUNCTION hash_text(p_text VARCHAR2) RETURN VARCHAR2 IS
  BEGIN RETURN LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(UTL_I18N.STRING_TO_RAW(NVL(p_text,'-'),'AL32UTF8'),DBMS_CRYPTO.HASH_SH256))); END;
  PROCEDURE fail(p_status NUMBER,p_code VARCHAR2,p_message VARCHAR2) IS
  BEGIN error_status:=p_status;error_code:=p_code;error_message:=p_message;RAISE_APPLICATION_ERROR(-20001,p_code); END;
  FUNCTION text_value(p_obj JSON_OBJECT_T,p_key VARCHAR2,p_max NUMBER,p_pattern VARCHAR2 DEFAULT NULL) RETURN VARCHAR2 IS v VARCHAR2(32767);e JSON_ELEMENT_T;
  BEGIN
    e:=p_obj.get(p_key);
    IF e IS NULL OR NOT e.is_string THEN fail(400,'INVALID_INPUT','Falta o es invalido: '||p_key); END IF;
    v:=p_obj.get_string(p_key);
    IF p_key<>'password' THEN v:=TRIM(v);END IF;
    IF LENGTH(v) IS NULL OR LENGTH(v)>p_max OR (p_pattern IS NOT NULL AND NOT REGEXP_LIKE(v,p_pattern,'c')) THEN fail(400,'INVALID_INPUT','Valor invalido: '||p_key); END IF;
    RETURN v;
  END;
  FUNCTION flag(p_obj JSON_OBJECT_T,p_key VARCHAR2) RETURN NUMBER IS e JSON_ELEMENT_T;
  BEGIN e:=p_obj.get(p_key);IF e IS NULL OR NOT e.is_boolean THEN fail(400,'INVALID_INPUT','Valor invalido: '||p_key);END IF;IF p_obj.get_boolean(p_key) THEN RETURN 1;ELSE RETURN 0;END IF;END;
  PROCEDURE keys_only(p_obj JSON_OBJECT_T,p_keys VARCHAR2) IS k JSON_KEY_LIST:=p_obj.get_keys;
  BEGIN FOR i IN 1..k.COUNT LOOP IF INSTR(','||p_keys||',',','||k(i)||',')=0 THEN fail(400,'INVALID_INPUT','Campo no permitido: '||k(i));END IF;END LOOP;END;
  FUNCTION derive(p_password VARCHAR2,p_salt VARCHAR2) RETURN RAW IS
    k RAW(32767):=UTL_I18N.STRING_TO_RAW(p_password,'AL32UTF8');u RAW(32);t RAW(32);
  BEGIN
    u:=DBMS_CRYPTO.MAC(UTL_RAW.CONCAT(HEXTORAW(p_salt),HEXTORAW('00000001')),DBMS_CRYPTO.HMAC_SH256,k);t:=u;
    FOR i IN 2..600000 LOOP u:=DBMS_CRYPTO.MAC(u,DBMS_CRYPTO.HMAC_SH256,k);t:=UTL_RAW.BIT_XOR(t,u);END LOOP;
    RETURN t;
  END;
  FUNCTION scram_hash(encoded VARCHAR2) RETURN VARCHAR2 IS salt VARCHAR2(32);salted RAW(32);stored RAW(32);server RAW(32);
  BEGIN
    IF NOT REGEXP_LIKE(encoded,'^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$','c') THEN RETURN encoded;END IF;
    salt:=REGEXP_SUBSTR(encoded,'[^$]+',1,3);salted:=HEXTORAW(REGEXP_SUBSTR(encoded,'[^$]+',1,4));stored:=DBMS_CRYPTO.HASH(DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW('Client Key','AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,salted),DBMS_CRYPTO.HASH_SH256);server:=DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW('Server Key','AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,salted);RETURN 'SCRAM-SHA-256$600000$'||salt||'$'||LOWER(RAWTOHEX(stored))||'$'||LOWER(RAWTOHEX(server));
  END;
  FUNCTION password_hash(p_password VARCHAR2,p_salt VARCHAR2 DEFAULT NULL) RETURN VARCHAR2 IS salt VARCHAR2(32):=NVL(p_salt,LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(16))));
  BEGIN
    IF p_password IS NULL OR LENGTH(p_password)<4 OR LENGTH(p_password)>128 THEN fail(400,'INVALID_PASSWORD','Usa una contrasena de al menos 4 caracteres.');END IF;
    RETURN scram_hash('pbkdf2-sha256$600000$'||salt||'$'||LOWER(RAWTOHEX(derive(p_password,salt))));
  END;
  FUNCTION verify_password(p_password VARCHAR2,p_hash VARCHAR2) RETURN BOOLEAN IS expected VARCHAR2(64);actual VARCHAR2(64);different NUMBER:=0;
  BEGIN
    IF p_password IS NULL OR LENGTH(p_password)>128 THEN RETURN FALSE;END IF;
    IF REGEXP_LIKE(p_hash,'^SCRAM-SHA-256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}\$[0-9a-f]{64}$','c') THEN
      expected:=REGEXP_SUBSTR(p_hash,'[^$]+',1,4);actual:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW('Client Key','AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,derive(p_password,REGEXP_SUBSTR(p_hash,'[^$]+',1,3))),DBMS_CRYPTO.HASH_SH256)));
    ELSE
      IF NOT REGEXP_LIKE(p_hash,'^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$','c') THEN RETURN FALSE;END IF;
      expected:=SUBSTR(p_hash,55,64);actual:=LOWER(RAWTOHEX(derive(p_password,SUBSTR(p_hash,22,32))));
    END IF;
    FOR i IN 1..64 LOOP IF SUBSTR(expected,i,1)<>SUBSTR(actual,i,1) THEN different:=different+1;END IF;END LOOP;RETURN different=0;
  END;
  PROCEDURE throttle(p_bucket VARCHAR2,p_max NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;v NUMBER;started TIMESTAMP WITH TIME ZONE;k VARCHAR2(64):=hash_text(p_bucket);
  BEGIN
    BEGIN INSERT INTO alliance_login_limits VALUES(k,0,SYSTIMESTAMP);EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;END;
    SELECT attempts,window_start INTO v,started FROM alliance_login_limits WHERE bucket=k FOR UPDATE;
    IF started<SYSTIMESTAMP-INTERVAL '15' MINUTE THEN v:=0;started:=SYSTIMESTAMP;END IF;
    UPDATE alliance_login_limits SET attempts=v+1,window_start=started WHERE bucket=k;COMMIT;
    IF v>=p_max THEN fail(429,'RATE_LIMIT','Demasiados intentos. Intenta nuevamente mas tarde.');END IF;
  EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
  END;
  FUNCTION owner(p_user VARCHAR2,p_business VARCHAR2) RETURN BOOLEAN IS n NUMBER;
  BEGIN SELECT COUNT(*) INTO n FROM user_location_roles WHERE business_id=p_business AND user_id=p_user AND role_code='OWNER';RETURN n>0;END;
  FUNCTION location_owner(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN BOOLEAN IS n NUMBER;
  BEGIN IF owner(p_user,p_business) THEN RETURN TRUE;END IF;SELECT COUNT(*) INTO n FROM user_location_roles WHERE business_id=p_business AND user_id=p_user AND location_id=p_location AND role_code='BOSS';RETURN n>0;END;
  FUNCTION can_manage(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2 DEFAULT NULL) RETURN BOOLEAN IS ctx JSON_OBJECT_T;perms JSON_OBJECT_T;keys JSON_KEY_LIST;pa JSON_ARRAY_T;
  BEGIN IF owner(p_user,p_business) THEN RETURN TRUE;END IF;ctx:=context_for(p_user);perms:=ctx.get_object('permissions');keys:=perms.get_keys;
   FOR i IN 1..keys.COUNT LOOP IF p_location IS NULL OR keys(i)=p_location THEN pa:=perms.get_array(keys(i));FOR j IN 0..pa.get_size-1 LOOP IF pa.get_string(j)='administration.manage' THEN RETURN TRUE;END IF;END LOOP;END IF;END LOOP;RETURN FALSE;
  END;
  FUNCTION context_for(p_user VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();u JSON_OBJECT_T:=JSON_OBJECT_T();locations_json JSON_ARRAY_T:=JSON_ARRAY_T();permissions_json JSON_OBJECT_T:=JSON_OBJECT_T();roles_json JSON_OBJECT_T:=JSON_OBJECT_T();role_array JSON_ARRAY_T;l JSON_OBJECT_T;pa JSON_ARRAY_T;
    user_row users%ROWTYPE;business_slug VARCHAR2(80);is_owner BOOLEAN;own_num NUMBER;boss_num NUMBER;waiter_num NUMBER;role_num NUMBER;
  BEGIN
    BEGIN SELECT * INTO user_row FROM users WHERE id=p_user AND active=1;EXCEPTION WHEN NO_DATA_FOUND THEN fail(401,'UNAUTHORIZED','Tu usuario no esta disponible.');END;
    SELECT slug INTO business_slug FROM businesses WHERE id=user_row.business_id;
    is_owner:=owner(p_user,user_row.business_id);IF is_owner THEN own_num:=1;ELSE own_num:=0;END IF;
    u.put('id',user_row.id);u.put('business_id',user_row.business_id);u.put('business_slug',business_slug);u.put('name',user_row.full_name);u.put('username',user_row.username);
    FOR x IN (SELECT * FROM locations loc WHERE business_id=user_row.business_id AND active=1 AND (own_num=1 OR EXISTS(SELECT 1 FROM user_location_roles g WHERE g.business_id=loc.business_id AND g.user_id=p_user AND g.location_id=loc.id)) ORDER BY name) LOOP
      l:=JSON_OBJECT_T();l.put('id',x.id);l.put('business_id',x.business_id);l.put('slug',x.slug);l.put('name',x.name);l.put('color',x.color);l.put('active',TRUE);locations_json.append(l);pa:=JSON_ARRAY_T();
      SELECT COUNT(*),NVL(SUM(CASE WHEN role_code='BOSS' THEN 1 ELSE 0 END),0),NVL(SUM(CASE WHEN role_code='WAITER' THEN 1 ELSE 0 END),0) INTO role_num,boss_num,waiter_num FROM user_location_roles WHERE business_id=x.business_id AND user_id=p_user AND location_id=x.id;
      IF role_num<>1 THEN waiter_num:=0;END IF;
      FOR p IN (SELECT code FROM permissions p WHERE own_num=1 OR boss_num>0 OR (waiter_num=1 AND code IN('home.read','products.read','locations.read','service.read','service.write')) OR (waiter_num=0 AND code<>'sales.manage' AND
        (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=x.business_id AND g.user_id=p_user AND g.location_id=x.id AND rp.permission_code=p.code)
         OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=x.business_id AND o.user_id=p_user AND o.location_id=x.id AND o.permission_code=p.code AND effect='ALLOW'))
         AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=x.business_id AND o.user_id=p_user AND o.location_id=x.id AND o.permission_code=p.code AND effect='DENY')) ORDER BY code) LOOP pa.append(p.code);END LOOP;
      permissions_json.put(x.id,pa);role_array:=JSON_ARRAY_T();IF own_num=1 THEN role_array.append('OWNER');ELSE FOR g IN(SELECT role_code FROM user_location_roles WHERE business_id=x.business_id AND user_id=p_user AND location_id=x.id)LOOP role_array.append(g.role_code);END LOOP;END IF;roles_json.put(x.id,role_array);
    END LOOP;
    r.put('user',u);r.put('locations',locations_json);r.put('permissions',permissions_json);r.put('roles',roles_json);r.put('is_owner',is_owner);RETURN r;
  END;
  PROCEDURE require_location(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_permission VARCHAR2) IS ctx JSON_OBJECT_T;perms JSON_OBJECT_T;pa JSON_ARRAY_T;found BOOLEAN:=FALSE;
  BEGIN ctx:=context_for(p_user);perms:=ctx.get_object('permissions');IF NOT perms.has(p_location) THEN fail(403,'FORBIDDEN','No tienes acceso a esta sucursal.');END IF;
    pa:=perms.get_array(p_location);FOR i IN 0..pa.get_size-1 LOOP IF pa.get_string(i)=p_permission THEN found:=TRUE;END IF;END LOOP;
    IF NOT found THEN fail(403,'FORBIDDEN','No tienes permiso para esta seccion.');END IF;
  END;
  FUNCTION authenticate(p_token VARCHAR2,p_refresh BOOLEAN DEFAULT FALSE) RETURN alliance_api_sessions%ROWTYPE IS s alliance_api_sessions%ROWTYPE;n NUMBER;
  BEGIN
    IF p_token IS NULL OR NOT REGEXP_LIKE(p_token,'^[0-9a-f]{64}$','c') THEN fail(401,'UNAUTHORIZED','Inicia sesion para continuar.');END IF;
    BEGIN
      IF p_refresh THEN SELECT * INTO s FROM alliance_api_sessions WHERE refresh_hash=hash_text(p_token) AND revoked=0 AND expires_at>SYSTIMESTAMP FOR UPDATE;
      ELSE SELECT * INTO s FROM alliance_api_sessions WHERE access_hash=hash_text(p_token) AND revoked=0 AND expires_at>SYSTIMESTAMP AND access_expires>SYSTIMESTAMP;END IF;
    EXCEPTION WHEN NO_DATA_FOUND THEN fail(401,'UNAUTHORIZED','Tu sesion termino.');END;
    SELECT COUNT(*) INTO n FROM users WHERE id=s.user_id AND business_id=s.business_id AND active=1;IF n=0 THEN fail(401,'UNAUTHORIZED','Tu usuario no esta disponible.');END IF;RETURN s;
  END;
  FUNCTION session_result(p_user VARCHAR2,p_access VARCHAR2,p_refresh VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();ctx JSON_OBJECT_T;actor JSON_OBJECT_T;login_time TIMESTAMP WITH TIME ZONE;
  BEGIN
    -- The session expiry is fixed at sign-in + 7 days; renewing tokens does not move it.
    SELECT expires_at-INTERVAL '7' DAY INTO login_time FROM alliance_api_sessions WHERE user_id=p_user AND access_hash=hash_text(p_access);
    ctx:=context_for(p_user);actor:=ctx.get_object('user');actor.put('last_login_at',TO_CHAR(login_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));ctx.put('user',actor);
    r.put('access_token',p_access);r.put('refresh_token',p_refresh);r.put('context',ctx);r.put('provider','oracle-ords');RETURN r;END;
  FUNCTION issue_session(p_user VARCHAR2) RETURN JSON_OBJECT_T IS u users%ROWTYPE;access_value VARCHAR2(64);refresh_value VARCHAR2(64);
  BEGIN SELECT * INTO u FROM users WHERE id=p_user AND active=1;
    access_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));refresh_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));
    DELETE FROM alliance_api_sessions WHERE expires_at<SYSTIMESTAMP-INTERVAL '1' DAY;
    INSERT INTO alliance_api_sessions(id,business_id,user_id,access_hash,refresh_hash,access_expires,expires_at) VALUES(new_id,u.business_id,u.id,hash_text(access_value),hash_text(refresh_value),SYSTIMESTAMP+INTERVAL '15' MINUTE,SYSTIMESTAMP+INTERVAL '7' DAY);
    RETURN session_result(u.id,access_value,refresh_value);
  END;
  FUNCTION login(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS slug_value VARCHAR2(80);username_value users.username%TYPE;password_value VARCHAR2(128);u users%ROWTYPE;access_value VARCHAR2(64);refresh_value VARCHAR2(64);valid BOOLEAN;
  BEGIN
    keys_only(p_body,'business_slug,username,password');slug_value:=text_value(p_body,'business_slug',80);username_value:=text_value(p_body,'username',320);password_value:=text_value(p_body,'password',128);
    throttle('login:'||slug_value||':'||username_value,10);
    BEGIN SELECT u.* INTO u FROM users u JOIN businesses b ON b.id=u.business_id WHERE b.slug=slug_value AND u.username=username_value AND u.active=1;
    EXCEPTION WHEN NO_DATA_FOUND THEN u.password_hash:='pbkdf2-sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';END;
    valid:=verify_password(password_value,u.password_hash);
    IF u.id IS NULL OR NOT valid THEN fail(401,'UNAUTHORIZED','Usuario o contrasena incorrectos.');END IF;
    IF u.password_hash LIKE 'pbkdf2-sha256$%' THEN DECLARE encoded VARCHAR2(512):=scram_hash(u.password_hash);BEGIN UPDATE users SET password_hash=encoded WHERE id=u.id AND password_hash=u.password_hash;END;END IF;
    RETURN issue_session(u.id);
  END;
  FUNCTION renew(p_token VARCHAR2) RETURN JSON_OBJECT_T IS s alliance_api_sessions%ROWTYPE;access_value VARCHAR2(64);refresh_value VARCHAR2(64);
  BEGIN
    s:=authenticate(p_token,TRUE);access_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));refresh_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));
    UPDATE alliance_api_sessions SET access_hash=hash_text(access_value),refresh_hash=hash_text(refresh_value),access_expires=SYSTIMESTAMP+INTERVAL '15' MINUTE WHERE id=s.id;
    RETURN session_result(s.user_id,access_value,refresh_value);
  END;
END;
/
