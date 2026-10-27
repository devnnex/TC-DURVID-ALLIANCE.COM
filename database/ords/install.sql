-- API ORDS: copiar TODO y pulsar el boton verde una sola vez.
-- Conserva las tablas y datos de 001-007. Reejecutable para actualizar la API.
DECLARE
  invalid_count NUMBER;
BEGIN
  EXECUTE IMMEDIATE q'!-- Copia TODO y ejecuta como una sentencia PL/SQL. No repetir 001-007.
DECLARE
  PROCEDURE create_if_missing(p_sql VARCHAR2) IS
  BEGIN EXECUTE IMMEDIATE p_sql;
  EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE; END IF; END;
BEGIN
  create_if_missing(q'~CREATE TABLE alliance_api_settings (
    id NUMBER(1) PRIMARY KEY CHECK(id=1), setup_hash VARCHAR2(64) NOT NULL,
    enabled NUMBER(1) DEFAULT 1 NOT NULL CHECK(enabled IN (0,1))
  )~');
  create_if_missing(q'~CREATE TABLE alliance_api_sessions (
    id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,user_id VARCHAR2(36) NOT NULL,
    access_hash VARCHAR2(64) NOT NULL UNIQUE,refresh_hash VARCHAR2(64) NOT NULL UNIQUE,
    access_expires TIMESTAMP WITH TIME ZONE NOT NULL,expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked NUMBER(1) DEFAULT 0 NOT NULL CHECK(revoked IN (0,1)),
    CONSTRAINT alliance_session_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id)
  )~');
  create_if_missing(q'~CREATE TABLE alliance_login_limits (
    bucket VARCHAR2(64) PRIMARY KEY, attempts NUMBER(10) NOT NULL,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL
  )~');
  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;!';
  EXECUTE IMMEDIATE q'!DECLARE
  PROCEDURE create_object(p_sql VARCHAR2) IS BEGIN EXECUTE IMMEDIATE p_sql;EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
BEGIN
  create_object(q'~CREATE TABLE alliance_pos_documents (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,
    entity VARCHAR2(32) NOT NULL,id VARCHAR2(80) NOT NULL,data_json CLOB NOT NULL CHECK(data_json IS JSON),
    version NUMBER DEFAULT 1 NOT NULL,created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    PRIMARY KEY(business_id,location_id,entity,id),
    FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
  )~');
  create_object(q'~CREATE TABLE alliance_pos_stock (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,product_id VARCHAR2(36) NOT NULL,
    stock NUMBER(24,6) DEFAULT 0 NOT NULL CHECK(stock>=0),cost_minor NUMBER(18) DEFAULT 0 NOT NULL CHECK(cost_minor>=0),
    min_stock NUMBER(24,6) DEFAULT 0 NOT NULL CHECK(min_stock>=0),code VARCHAR2(64),unit_name VARCHAR2(80) DEFAULT 'unidad',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,version NUMBER DEFAULT 1 NOT NULL,
    PRIMARY KEY(business_id,location_id,product_id),
    FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
    FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id)
  )~');
  create_object(q'~CREATE TABLE alliance_pos_movements (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(160) NOT NULL,
    product_id VARCHAR2(36) NOT NULL,actor_user_id VARCHAR2(36) NOT NULL,
    delta NUMBER(24,6) NOT NULL,stock_before NUMBER(24,6) NOT NULL,stock_after NUMBER(24,6) NOT NULL CHECK(stock_after>=0),
    cost_minor NUMBER(18) NOT NULL,kind VARCHAR2(40) NOT NULL,reference VARCHAR2(160),session_id VARCHAR2(80),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    PRIMARY KEY(business_id,location_id,id),
    FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
    FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id),
    FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id)
  )~');
  create_object(q'~CREATE TABLE alliance_pos_sales (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(80) NOT NULL,
    session_id VARCHAR2(80) NOT NULL,actor_user_id VARCHAR2(36) NOT NULL,invoice_json CLOB NOT NULL CHECK(invoice_json IS JSON),
    subtotal_minor NUMBER(18) NOT NULL,total_minor NUMBER(18) NOT NULL,cost_minor NUMBER(18) NOT NULL,
    voided NUMBER(1) DEFAULT 0 NOT NULL CHECK(voided IN(0,1)),created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    PRIMARY KEY(business_id,location_id,id),UNIQUE(business_id,location_id,session_id),
    FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
    FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id)
  )~');
  create_object(q'~CREATE TABLE alliance_pos_receipts (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(160) NOT NULL,
    actor_user_id VARCHAR2(36) NOT NULL,fingerprint VARCHAR2(64) NOT NULL,result_json CLOB NOT NULL CHECK(result_json IS JSON),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    PRIMARY KEY(business_id,location_id,id),
    FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
  )~');
  COMMIT;
END;!';
  EXECUTE IMMEDIATE q'!DECLARE
  PROCEDURE grant_permission(p_code VARCHAR2,p_roles VARCHAR2) IS
  BEGIN
    MERGE INTO permissions t USING(SELECT p_code code FROM dual)s ON(t.code=s.code) WHEN NOT MATCHED THEN INSERT(code) VALUES(s.code);
    FOR r IN(SELECT code FROM roles WHERE INSTR(','||p_roles||',',','||code||',')>0) LOOP
      MERGE INTO role_permissions t USING(SELECT r.code role_code,p_code permission_code FROM dual)s
      ON(t.role_code=s.role_code AND t.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code) VALUES(s.role_code,s.permission_code);
    END LOOP;
  END;
BEGIN
  grant_permission('service.read','OWNER,ADMIN,MANAGER,CASHIER,WAITER,KITCHEN');
  grant_permission('service.write','OWNER,ADMIN,MANAGER,CASHIER,WAITER');
  grant_permission('accounts.read','OWNER,ADMIN,MANAGER,CASHIER,WAITER,ACCOUNTING');
  grant_permission('sales.read','OWNER,ADMIN,MANAGER,CASHIER,ACCOUNTING');
  grant_permission('sales.write','OWNER,ADMIN,MANAGER,CASHIER');
  grant_permission('inventory.write','OWNER,ADMIN,MANAGER,INVENTORY_MANAGER');
  grant_permission('movements.read','OWNER,ADMIN,MANAGER,INVENTORY_MANAGER,ACCOUNTING');
  grant_permission('tables.manage','OWNER,ADMIN,MANAGER');
  grant_permission('brand.manage','OWNER,ADMIN');
  grant_permission('assistant.read','OWNER,ADMIN,MANAGER,CASHIER,WAITER');
  COMMIT;
END;!';
  EXECUTE IMMEDIATE q'!BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE alliance_activity_events (
    id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,
    location_id VARCHAR2(36), actor_user_id VARCHAR2(36), actor_name VARCHAR2(160) NOT NULL,
    section_code VARCHAR2(40) NOT NULL, action_code VARCHAR2(80) NOT NULL,
    summary VARCHAR2(240) NOT NULL, entity_id VARCHAR2(160),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT activity_business_fk FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    CONSTRAINT activity_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
    CONSTRAINT activity_actor_fk FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;!';
  EXECUTE IMMEDIATE q'!BEGIN
  BEGIN EXECUTE IMMEDIATE 'ALTER TABLE alliance_activity_events ADD (device_id VARCHAR2(80),client_created_at TIMESTAMP WITH TIME ZONE)';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-1430 THEN RAISE;END IF;END;
END;!';
  EXECUTE IMMEDIATE q'!BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_recent_idx ON alliance_activity_events(business_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;!';
  EXECUTE IMMEDIATE q'!BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_actor_idx ON alliance_activity_events(business_id,actor_user_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;!';
  EXECUTE IMMEDIATE q'!BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_scope_idx ON alliance_activity_events(business_id,location_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;!';
  EXECUTE IMMEDIATE q'!DECLARE
  PROCEDURE create_object(s VARCHAR2) IS BEGIN EXECUTE IMMEDIATE s;EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
  PROCEDURE grant_access(c VARCHAR2,rs VARCHAR2) IS BEGIN
    MERGE INTO permissions p USING(SELECT c code FROM dual)s ON(p.code=s.code) WHEN NOT MATCHED THEN INSERT(code)VALUES(s.code);
    FOR r IN(SELECT code FROM roles WHERE INSTR(','||rs||',',','||code||',')>0) LOOP
      MERGE INTO role_permissions p USING(SELECT r.code role_code,c permission_code FROM dual)s ON(p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code)VALUES(s.role_code,s.permission_code);
    END LOOP;
  END;
BEGIN
  create_object(q'~CREATE TABLE alliance_raw_stock (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(80) NOT NULL,
    name VARCHAR2(160) NOT NULL,unit_id VARCHAR2(12) NOT NULL REFERENCES units_of_measure(id),
    quantity NUMBER(24,8) DEFAULT 0 NOT NULL CHECK(quantity>=0),unit_cost NUMBER(24,8) DEFAULT 0 NOT NULL CHECK(unit_cost>=0),
    min_stock NUMBER(24,8) DEFAULT 0 NOT NULL CHECK(min_stock>=0),version NUMBER DEFAULT 1 NOT NULL,
    PRIMARY KEY(business_id,location_id,id),FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
  )~');
  create_object(q'~CREATE TABLE alliance_raw_movements (
    business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(160) NOT NULL,
    ingredient_id VARCHAR2(80) NOT NULL,actor_user_id VARCHAR2(36) NOT NULL,delta NUMBER(24,8) NOT NULL,
    stock_before NUMBER(24,8) NOT NULL,stock_after NUMBER(24,8) NOT NULL CHECK(stock_after>=0),
    unit_cost NUMBER(24,8) NOT NULL,kind VARCHAR2(24) NOT NULL,reference VARCHAR2(80),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    PRIMARY KEY(business_id,location_id,id),
    FOREIGN KEY(business_id,location_id,ingredient_id) REFERENCES alliance_raw_stock(business_id,location_id,id),
    FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id)
  )~');
  create_object('CREATE INDEX raw_reference_idx ON alliance_raw_movements(business_id,location_id,reference,kind)');
  create_object(q'~CREATE INDEX pos_sales_customer_idx ON alliance_pos_sales(business_id,location_id,JSON_VALUE(invoice_json,'$.customerId' RETURNING VARCHAR2(80)),created_at)~');
  grant_access('supplies.read','OWNER,ADMIN,MANAGER,INVENTORY_MANAGER,ACCOUNTING');
  grant_access('supplies.write','OWNER,ADMIN,MANAGER,INVENTORY_MANAGER');
  grant_access('kitchen.read','OWNER,ADMIN,MANAGER,CASHIER,WAITER,KITCHEN');
  grant_access('kitchen.write','OWNER,ADMIN,MANAGER,KITCHEN');
  grant_access('customers.read','OWNER,ADMIN,MANAGER,CASHIER,ACCOUNTING');
  grant_access('customers.write','OWNER,ADMIN,MANAGER,CASHIER');
  grant_access('cash.read','OWNER,ADMIN,MANAGER,CASHIER,ACCOUNTING');
  grant_access('cash.write','OWNER,ADMIN,MANAGER,CASHIER');
  COMMIT;
END;!';
  EXECUTE IMMEDIATE q'!DECLARE
  PROCEDURE column_flag(t VARCHAR2) IS BEGIN EXECUTE IMMEDIATE 'ALTER TABLE '||t||' ADD (allow_negative NUMBER(1) DEFAULT 0 NOT NULL CHECK(allow_negative IN(0,1)))';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-1430 THEN RAISE;END IF;END;
  PROCEDURE guarded_check(t VARCHAR2,c VARCHAR2,field VARCHAR2) IS n NUMBER;BEGIN
    FOR x IN(SELECT constraint_name FROM user_constraints WHERE table_name=t AND constraint_type='C' AND REGEXP_LIKE(REPLACE(search_condition_vc,'"',''),'^[[:space:]]*'||field||'[[:space:]]*>=[[:space:]]*0[[:space:]]*$','i')) LOOP EXECUTE IMMEDIATE 'ALTER TABLE '||t||' DROP CONSTRAINT '||DBMS_ASSERT.SIMPLE_SQL_NAME(x.constraint_name);END LOOP;
    SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name=c;IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE '||t||' ADD CONSTRAINT '||c||' CHECK ('||field||'>=0 OR allow_negative=1)';END IF;
  END;
BEGIN
  column_flag('ALLIANCE_RAW_STOCK');column_flag('ALLIANCE_RAW_MOVEMENTS');column_flag('ALLIANCE_POS_STOCK');column_flag('ALLIANCE_POS_MOVEMENTS');
  guarded_check('ALLIANCE_RAW_STOCK','RAW_STOCK_NEGATIVE_POLICY','quantity');guarded_check('ALLIANCE_RAW_MOVEMENTS','RAW_MOVE_NEGATIVE_POLICY','stock_after');guarded_check('ALLIANCE_POS_STOCK','POS_STOCK_NEGATIVE_POLICY','stock');guarded_check('ALLIANCE_POS_MOVEMENTS','POS_MOVE_NEGATIVE_POLICY','stock_after');
END;!';
  EXECUTE IMMEDIATE q'!BEGIN EXECUTE IMMEDIATE 'CREATE TABLE alliance_auth_config(id NUMBER PRIMARY KEY, secret RAW(32) NOT NULL)';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;!';
  EXECUTE IMMEDIATE q'!BEGIN INSERT INTO alliance_auth_config SELECT 1,DBMS_CRYPTO.RANDOMBYTES(32) FROM dual WHERE NOT EXISTS(SELECT 1 FROM alliance_auth_config WHERE id=1);END;!';
  EXECUTE IMMEDIATE q'!BEGIN EXECUTE IMMEDIATE 'CREATE TABLE alliance_auth_challenges(id VARCHAR2(36) PRIMARY KEY, user_id VARCHAR2(36), business_slug VARCHAR2(80) NOT NULL, username VARCHAR2(80) NOT NULL, branch VARCHAR2(80), salt VARCHAR2(32) NOT NULL, message VARCHAR2(1800) NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL)';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;!';
  EXECUTE IMMEDIATE q'!BEGIN EXECUTE IMMEDIATE 'CREATE INDEX alliance_auth_challenges_expiry ON alliance_auth_challenges(expires_at)';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;!';
  EXECUTE IMMEDIATE q'!-- Additive branch-scoped team roles. Existing users and grants are preserved.
BEGIN
 MERGE INTO roles t USING(SELECT 'BOSS' code,'Jefe' name FROM dual UNION ALL SELECT 'WORKER','Trabajador' FROM dual)s ON(t.code=s.code) WHEN NOT MATCHED THEN INSERT(code,name)VALUES(s.code,s.name);
 MERGE INTO permissions t USING(SELECT 'sales.manage' code FROM dual)s ON(t.code=s.code) WHEN NOT MATCHED THEN INSERT(code)VALUES(s.code);
 MERGE INTO role_permissions t USING(SELECT r.code role_code,p.code permission_code FROM roles r CROSS JOIN permissions p WHERE r.code IN('OWNER','BOSS'))s ON(t.role_code=s.role_code AND t.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code)VALUES(s.role_code,s.permission_code);
 MERGE INTO role_permissions t USING(SELECT 'WORKER' role_code,code permission_code FROM permissions WHERE code IN('home.read','products.read','locations.read'))s ON(t.role_code=s.role_code AND t.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code)VALUES(s.role_code,s.permission_code);
 DELETE FROM role_permissions WHERE role_code='WAITER' AND permission_code NOT IN('home.read','products.read','locations.read','service.read','service.write');
 COMMIT;
END;!';
  EXECUTE IMMEDIATE q'!DECLARE n NUMBER;BEGIN SELECT char_length INTO n FROM user_tab_columns WHERE table_name='USERS' AND column_name='USERNAME';IF n<320 THEN EXECUTE IMMEDIATE 'ALTER TABLE users MODIFY (username VARCHAR2(320 CHAR))';END IF;END;!';
  EXECUTE IMMEDIATE q'!DECLARE n NUMBER;BEGIN SELECT char_length INTO n FROM user_tab_columns WHERE table_name='ALLIANCE_AUTH_CHALLENGES' AND column_name='USERNAME';IF n<320 THEN EXECUTE IMMEDIATE 'ALTER TABLE alliance_auth_challenges MODIFY (username VARCHAR2(320 CHAR))';END IF;SELECT data_length INTO n FROM user_tab_columns WHERE table_name='ALLIANCE_AUTH_CHALLENGES' AND column_name='MESSAGE';IF n<4000 THEN EXECUTE IMMEDIATE 'ALTER TABLE alliance_auth_challenges MODIFY (message VARCHAR2(4000 BYTE))';END IF;END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_security AUTHID DEFINER AS
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
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_security AS
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
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_auth_proof AUTHID DEFINER AS
  FUNCTION challenge(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION finish(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_auth_proof AS
  PROCEDURE keys_for(encoded VARCHAR2,salt OUT VARCHAR2,stored OUT RAW,server OUT RAW) IS salted RAW(32);client_key RAW(32);
  BEGIN
    IF REGEXP_LIKE(encoded,'^SCRAM-SHA-256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}\$[0-9a-f]{64}$','c') THEN salt:=REGEXP_SUBSTR(encoded,'[^$]+',1,3);stored:=HEXTORAW(REGEXP_SUBSTR(encoded,'[^$]+',1,4));server:=HEXTORAW(REGEXP_SUBSTR(encoded,'[^$]+',1,5));
    ELSE alliance_security.fail(401,'UNAUTHORIZED','Usuario o contrasena incorrectos.');END IF;
  END;
  FUNCTION challenge(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T IS
    slug_value VARCHAR2(80);name_value users.username%TYPE;nonce_value VARCHAR2(64);encoded VARCHAR2(512);user_value VARCHAR2(36);salt VARCHAR2(32);stored RAW(32);server RAW(32);secret RAW(32);identifier VARCHAR2(36):=alliance_security.new_id;server_nonce VARCHAR2(128);message_value VARCHAR2(4000);message JSON_ARRAY_T:=JSON_ARRAY_T();empty_branch JSON_ARRAY_T:=JSON_ARRAY_T('[""]');r JSON_OBJECT_T:=JSON_OBJECT_T();
  BEGIN
    alliance_security.keys_only(p,'business_slug,username,nonce');slug_value:=alliance_security.text_value(p,'business_slug',80);name_value:=alliance_security.text_value(p,'username',320);nonce_value:=alliance_security.text_value(p,'nonce',64,'^[0-9a-f]{64}$');
    alliance_security.throttle('challenge:'||slug_value||':'||name_value,20);
    BEGIN SELECT u.id,u.password_hash INTO user_value,encoded FROM users u JOIN businesses b ON b.id=u.business_id WHERE b.slug=slug_value AND u.username=name_value AND u.active=1;IF encoded LIKE 'pbkdf2-sha256$%' THEN r.put('algorithm','PASSWORD');RETURN r;END IF;keys_for(encoded,salt,stored,server);
    EXCEPTION WHEN NO_DATA_FOUND THEN SELECT c.secret INTO secret FROM alliance_auth_config c WHERE id=1;salt:=SUBSTR(LOWER(RAWTOHEX(DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW(slug_value||':'||name_value,'AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,secret))),1,32);END;
    server_nonce:=nonce_value||LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));message.append(slug_value);message.append(name_value);IF branch_value IS NULL THEN message.append(empty_branch.get(0));ELSE message.append(branch_value);END IF;message.append(identifier);message.append(nonce_value);message.append(server_nonce);message.append(salt);message.append(600000);
    message_value:=message.to_string;
    DELETE FROM alliance_auth_challenges WHERE expires_at<SYSTIMESTAMP AND ROWNUM<=100;
    INSERT INTO alliance_auth_challenges(id,user_id,business_slug,username,branch,salt,message,expires_at)VALUES(identifier,user_value,slug_value,name_value,branch_value,salt,message_value,SYSTIMESTAMP+INTERVAL '90' SECOND);
    r.put('algorithm','SCRAM-SHA-256');r.put('id',identifier);r.put('salt',salt);r.put('nonce',server_nonce);r.put('iterations',600000);r.put('message',message.to_string);RETURN r;
  END;
  PROCEDURE take_challenge(identifier VARCHAR2,c OUT alliance_auth_challenges%ROWTYPE) IS PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    SELECT * INTO c FROM alliance_auth_challenges WHERE id=identifier AND expires_at>SYSTIMESTAMP FOR UPDATE;DELETE FROM alliance_auth_challenges WHERE id=identifier;COMMIT;
  EXCEPTION WHEN NO_DATA_FOUND THEN ROLLBACK;alliance_security.fail(401,'UNAUTHORIZED','Este intento vencio. Inicia sesion nuevamente.');WHEN OTHERS THEN ROLLBACK;RAISE;
  END;
  FUNCTION finish(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T IS
    c alliance_auth_challenges%ROWTYPE;u users%ROWTYPE;identifier VARCHAR2(36);proof VARCHAR2(64);salt VARCHAR2(32);stored RAW(32);server RAW(32);signature RAW(32);computed VARCHAR2(64);different NUMBER:=0;expected VARCHAR2(64);r JSON_OBJECT_T;
  BEGIN
    alliance_security.keys_only(p,'id,proof');identifier:=alliance_security.text_value(p,'id',36,'^[a-f0-9-]{36}$');proof:=alliance_security.text_value(p,'proof',64,'^[0-9a-f]{64}$');take_challenge(identifier,c);
    alliance_security.throttle('login:'||c.business_slug||':'||c.username,10);
    IF NVL(c.branch,'-')<>NVL(branch_value,'-') THEN alliance_security.fail(401,'UNAUTHORIZED','Este intento no corresponde a la sucursal.');END IF;
    BEGIN SELECT * INTO u FROM users WHERE id=c.user_id AND active=1 AND username=c.username FOR UPDATE;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(401,'UNAUTHORIZED','Usuario o contrasena incorrectos.');END;
    keys_for(u.password_hash,salt,stored,server);IF salt<>c.salt THEN alliance_security.fail(401,'UNAUTHORIZED','Usuario o contrasena incorrectos.');END IF;
    signature:=DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW(c.message,'AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,stored);computed:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(UTL_RAW.BIT_XOR(HEXTORAW(proof),signature),DBMS_CRYPTO.HASH_SH256)));expected:=LOWER(RAWTOHEX(stored));FOR i IN 1..64 LOOP IF SUBSTR(computed,i,1)<>SUBSTR(expected,i,1) THEN different:=different+1;END IF;END LOOP;
    IF different<>0 THEN alliance_security.fail(401,'UNAUTHORIZED','Usuario o contrasena incorrectos.');END IF;
    r:=alliance_security.issue_session(u.id);r.put('server_signature',LOWER(RAWTOHEX(DBMS_CRYPTO.MAC(UTL_I18N.STRING_TO_RAW(c.message,'AL32UTF8'),DBMS_CRYPTO.HMAC_SH256,server))));RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_activity AUTHID DEFINER AS
  PROCEDURE client_context(p_device VARCHAR2 DEFAULT NULL,p_at VARCHAR2 DEFAULT NULL);
  FUNCTION occurred_at RETURN VARCHAR2;
  PROCEDURE record_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_section VARCHAR2,p_action VARCHAR2,p_summary VARCHAR2,p_entity VARCHAR2 DEFAULT NULL);
  PROCEDURE pos_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T);
  PROCEDURE costing_changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_before CLOB,p_model JSON_OBJECT_T);
  FUNCTION visit(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION feed(p_user VARCHAR2,p_business VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_activity AS
  client_device VARCHAR2(80);client_date TIMESTAMP WITH TIME ZONE;
  FUNCTION occurred_at RETURN VARCHAR2 IS BEGIN RETURN TO_CHAR(NVL(client_date,SYSTIMESTAMP) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');END;
  PROCEDURE client_context(p_device VARCHAR2 DEFAULT NULL,p_at VARCHAR2 DEFAULT NULL) IS BEGIN
    client_device:=NULL;client_date:=NULL;
    IF p_device IS NOT NULL THEN IF LENGTH(p_device)>80 OR NOT REGEXP_LIKE(p_device,'^[a-zA-Z0-9_-]+$') THEN alliance_security.fail(400,'INVALID_INPUT','Identificador de equipo invalido.');END IF;client_device:=p_device;END IF;
    IF p_at IS NOT NULL THEN BEGIN client_date:=FROM_TZ(TO_TIMESTAMP(p_at,'FXYYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del equipo.');END;IF client_date>SYSTIMESTAMP+INTERVAL '1' DAY OR client_date<SYSTIMESTAMP-INTERVAL '180' DAY THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del equipo antes de sincronizar.');END IF;END IF;
  END;
  PROCEDURE record_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_section VARCHAR2,p_action VARCHAR2,p_summary VARCHAR2,p_entity VARCHAR2 DEFAULT NULL) IS actor_value VARCHAR2(160):='Cliente de mesa';
  BEGIN
    IF p_user IS NOT NULL THEN SELECT full_name INTO actor_value FROM users WHERE business_id=p_business AND id=p_user;END IF;
    INSERT INTO alliance_activity_events(id,business_id,location_id,actor_user_id,actor_name,section_code,action_code,summary,entity_id,device_id,client_created_at)
      VALUES(alliance_security.new_id,p_business,p_location,p_user,actor_value,SUBSTR(p_section,1,40),SUBSTR(p_action,1,80),SUBSTR(p_summary,1,240),SUBSTR(p_entity,1,160),client_device,client_date);
  END;
  PROCEDURE costing_changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_before CLOB,p_model JSON_OBJECT_T) IS
    old_model JSON_OBJECT_T:=JSON_OBJECT_T();old_rows JSON_ARRAY_T;new_rows JSON_ARRAY_T;old_row JSON_OBJECT_T;new_row JSON_OBJECT_T;matched JSON_OBJECT_T;old_lookup JSON_OBJECT_T;new_lookup JSON_OBJECT_T;
    keys_value JSON_ARRAY_T:=JSON_ARRAY_T('["ingredients","recipes","expenses","channels"]');key_value VARCHAR2(40);label_value VARCHAR2(50);count_value NUMBER:=0;
    PROCEDURE changed_row(p_row JSON_OBJECT_T,p_verb VARCHAR2) IS
    BEGIN record_event(p_user,p_business,p_location,'costing','costing_save',p_verb||' '||label_value||': '||p_row.get_string('name'),p_row.get_string('id'));count_value:=count_value+1;END;
  BEGIN
    IF p_before IS NOT NULL THEN old_model:=JSON_OBJECT_T.parse(p_before).get_object('model');END IF;
    FOR k IN 0..keys_value.get_size-1 LOOP
      key_value:=keys_value.get_string(k);label_value:=CASE key_value WHEN 'ingredients' THEN 'un ingrediente' WHEN 'recipes' THEN 'una receta' WHEN 'expenses' THEN 'un gasto' ELSE 'un canal de venta' END;
      new_rows:=p_model.get_array(key_value);old_rows:=old_model.get_array(key_value);IF old_rows IS NULL THEN old_rows:=JSON_ARRAY_T();END IF;old_lookup:=JSON_OBJECT_T();new_lookup:=JSON_OBJECT_T();
      FOR i IN 0..old_rows.get_size-1 LOOP old_row:=TREAT(old_rows.get(i) AS JSON_OBJECT_T);old_lookup.put(old_row.get_string('id'),old_row);END LOOP;
      FOR i IN 0..new_rows.get_size-1 LOOP new_row:=TREAT(new_rows.get(i) AS JSON_OBJECT_T);new_lookup.put(new_row.get_string('id'),new_row);END LOOP;
      FOR i IN 0..new_rows.get_size-1 LOOP new_row:=TREAT(new_rows.get(i) AS JSON_OBJECT_T);matched:=old_lookup.get_object(new_row.get_string('id'));
        IF matched IS NULL THEN changed_row(new_row,'Agregó');ELSIF DBMS_LOB.COMPARE(new_row.to_clob,matched.to_clob)<>0 THEN changed_row(new_row,'Editó');END IF;
      END LOOP;
      FOR i IN 0..old_rows.get_size-1 LOOP old_row:=TREAT(old_rows.get(i) AS JSON_OBJECT_T);matched:=new_lookup.get_object(old_row.get_string('id'));IF matched IS NULL THEN changed_row(old_row,'Eliminó');END IF;END LOOP;
    END LOOP;
    IF NOT old_model.has('settings') OR DBMS_LOB.COMPARE(old_model.get_object('settings').to_clob,p_model.get_object('settings').to_clob)<>0 THEN record_event(p_user,p_business,p_location,'costing','costing_save','Actualizó capacidad e impuestos del costeo');count_value:=count_value+1;END IF;
    IF count_value=0 THEN record_event(p_user,p_business,p_location,'costing','costing_save','Confirmó los datos del costeo');END IF;
  END;
  PROCEDURE pos_event(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) IS
    section_value VARCHAR2(40):='service';summary_value VARCHAR2(240);entity_value VARCHAR2(160);table_value VARCHAR2(80);verb_value VARCHAR2(30);o JSON_OBJECT_T;e JSON_ELEMENT_T;
  BEGIN
    IF p_action IN('broadcast','costing_save') THEN RETURN;END IF;
    IF p_action LIKE 'costing_%' THEN
      section_value:='costing';summary_value:=CASE p_action WHEN 'costing_save' THEN 'Actualizó ingredientes, recetas o gastos del costeo' WHEN 'costing_approve' THEN 'Guardó un producto listo para vender' ELSE 'Retiró un producto del historial de costeo' END;
      entity_value:=p_payload.get_string('recipeId');
    ELSIF p_action='query' THEN
      table_value:=p_payload.get_string('table');section_value:=CASE table_value WHEN 'menu_items' THEN 'inventory' WHEN 'menu_categories' THEN 'inventory' WHEN 'restaurant_tables' THEN 'menu' WHEN 'business_settings' THEN 'brand' WHEN 'table_sessions' THEN 'accounts' ELSE 'service' END;
      verb_value:=CASE p_payload.get_string('op') WHEN 'insert' THEN 'Agregó' WHEN 'delete' THEN 'Eliminó' WHEN 'update' THEN 'Editó' ELSE 'Guardó' END;
      summary_value:=verb_value||' '||CASE table_value WHEN 'menu_items' THEN 'productos' WHEN 'menu_categories' THEN 'categorías' WHEN 'restaurant_tables' THEN 'mesas o puntos de atención' WHEN 'business_settings' THEN 'la configuración de la sucursal' WHEN 'table_sessions' THEN 'una cuenta de atención' WHEN 'session_items' THEN 'productos de una cuenta' WHEN 'service_requests' THEN 'solicitudes de atención' ELSE 'registros de atención' END;
      e:=p_payload.get('values');IF e IS NOT NULL AND e.is_object THEN o:=TREAT(e AS JSON_OBJECT_T);entity_value:=o.get_string('id');IF o.get_string('name') IS NOT NULL THEN summary_value:=SUBSTR(summary_value||': '||o.get_string('name'),1,240);END IF;END IF;
    ELSIF p_action IN('record_sale','edit_sale','delete_sale','clear_income') THEN
      section_value:='income';summary_value:=CASE p_action WHEN 'record_sale' THEN 'Registró una venta' WHEN 'edit_sale' THEN 'Editó una venta' WHEN 'delete_sale' THEN 'Eliminó una venta' ELSE 'Eliminó el registro de ventas' END;entity_value:=p_payload.get_string('saleId');
    ELSIF p_action LIKE '%inventory%' OR p_action LIKE '%stock%' THEN
      section_value:=CASE WHEN p_action IN('update_inventory_movement_cost','clear_inventory_movements') THEN 'movements' ELSE 'inventory' END;
      summary_value:=CASE p_action WHEN 'upsert_inventory' THEN 'Guardó un producto de inventario' WHEN 'delete_inventory' THEN 'Eliminó un producto de inventario' WHEN 'clear_inventory' THEN 'Eliminó los productos de inventario' WHEN 'clear_inventory_movements' THEN 'Eliminó el registro de movimientos' WHEN 'update_inventory_movement_cost' THEN 'Editó el costo de un movimiento' ELSE 'Registró un ajuste de existencias' END;entity_value:=p_payload.get_string('productId');
    ELSE
      summary_value:=CASE p_action WHEN 'acknowledgeServiceRequests' THEN 'Atendió solicitudes de clientes' WHEN 'resolveBill' THEN 'Resolvió una solicitud de cuenta' WHEN 'sendChatMessage' THEN 'Envió un mensaje de atención' WHEN 'closeChatSession' THEN 'Cerró una conversación de atención' ELSE 'Registró una solicitud de atención' END;
      entity_value:=NVL(p_payload.get_string('p_session_id'),p_payload.get_string('session_id'));
    END IF;
    record_event(p_user,p_business,p_location,section_value,p_action,summary_value,entity_value);
  END;
  FUNCTION visit(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    section_value VARCHAR2(40);permission_value VARCHAR2(80);n NUMBER;
  BEGIN
    alliance_security.keys_only(p_body,'section,device_id,client_created_at');client_context(p_body.get_string('device_id'),p_body.get_string('client_created_at'));section_value:=alliance_security.text_value(p_body,'section',40);
    permission_value:=CASE section_value WHEN 'dashboard' THEN 'home.read' WHEN 'service' THEN 'service.read' WHEN 'accounts' THEN 'accounts.read' WHEN 'tips' THEN 'sales.read' WHEN 'inventory' THEN 'inventory.read' WHEN 'costing' THEN 'inventory.read' WHEN 'movements' THEN 'movements.read' WHEN 'income' THEN 'sales.read' WHEN 'assistant' THEN 'assistant.read' WHEN 'menu' THEN 'tables.manage' WHEN 'brand' THEN 'brand.manage' WHEN 'users' THEN 'administration.manage' WHEN 'activity' THEN 'administration.manage' WHEN 'supplies' THEN 'supplies.read' WHEN 'kitchen' THEN 'kitchen.read' WHEN 'customers' THEN 'customers.read' WHEN 'cash' THEN 'cash.read' END;
    IF permission_value IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Sección no disponible.');END IF;
    IF section_value IN('users','activity') THEN IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe puede entrar al centro operativo.');END IF;
    ELSE alliance_security.require_location(p_user,p_business,p_location,permission_value);END IF;
    IF p_location IS NOT NULL THEN SELECT COUNT(*) INTO n FROM locations WHERE business_id=p_business AND id=p_location AND active=1;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible.');END IF;END IF;
    -- Visits are debounced server-side. Ordinary reads and polling produce no events.
    SELECT COUNT(*) INTO n FROM alliance_activity_events WHERE business_id=p_business AND actor_user_id=p_user AND NVL(location_id,'-')=NVL(p_location,'-') AND section_code=section_value AND action_code='VIEW' AND NVL(client_created_at,created_at) BETWEEN NVL(client_date,SYSTIMESTAMP)-INTERVAL '30' SECOND AND NVL(client_date,SYSTIMESTAMP)+INTERVAL '30' SECOND;
    IF n=0 THEN record_event(p_user,p_business,p_location,section_value,'VIEW','Consultó esta sección');END IF;
    RETURN JSON_OBJECT_T('{"ok":true}');
  END;
  FUNCTION feed(p_user VARCHAR2,p_business VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;branch_value VARCHAR2(36);actor_value VARCHAR2(36);section_value VARCHAR2(40);kind_value VARCHAR2(10);offset_value NUMBER;day_value NUMBER;n NUMBER:=0;
  BEGIN
    IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe puede consultar el seguimiento del equipo.');END IF;
    alliance_security.keys_only(p_body,'location_id,actor_user_id,section,kind,offset,days');
    branch_value:=p_body.get_string('location_id');actor_value:=p_body.get_string('actor_user_id');section_value:=p_body.get_string('section');kind_value:=p_body.get_string('kind');offset_value:=NVL(p_body.get_number('offset'),0);day_value:=NVL(p_body.get_number('days'),30);
    IF offset_value<0 OR offset_value<>TRUNC(offset_value) OR offset_value>100000 OR day_value NOT IN(1,7,30,90) OR NVL(kind_value,'all') NOT IN('all','views','changes') THEN alliance_security.fail(400,'INVALID_INPUT','Filtro no válido.');END IF;
    FOR x IN(SELECT e.*,l.name location_name FROM alliance_activity_events e LEFT JOIN locations l ON l.business_id=e.business_id AND l.id=e.location_id
      WHERE e.business_id=p_business AND (branch_value IS NULL OR e.location_id=branch_value) AND (actor_value IS NULL OR e.actor_user_id=actor_value) AND (section_value IS NULL OR e.section_code=section_value)
      AND (kind_value IS NULL OR kind_value='all' OR (kind_value='views' AND e.action_code='VIEW') OR (kind_value='changes' AND e.action_code<>'VIEW'))
      AND e.created_at>=SYSTIMESTAMP-NUMTODSINTERVAL(day_value,'DAY') ORDER BY e.created_at DESC,e.id DESC OFFSET offset_value ROWS FETCH NEXT 51 ROWS ONLY) LOOP
      n:=n+1;IF n<=50 THEN o:=JSON_OBJECT_T();o.put('id',x.id);o.put('actorId',x.actor_user_id);o.put('actorName',x.actor_name);o.put('locationId',x.location_id);o.put('locationName',NVL(x.location_name,'Centro operativo'));o.put('section',x.section_code);o.put('action',x.action_code);o.put('summary',x.summary);o.put('entityId',x.entity_id);o.put('deviceId',x.device_id);IF x.client_created_at IS NOT NULL THEN o.put('occurredAt',TO_CHAR(x.client_created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));END IF;o.put('at',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));a.append(o);END IF;
    END LOOP;r.put('items',a);r.put('hasMore',n>50);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_yield AUTHID DEFINER AS
  FUNCTION factor(line JSON_OBJECT_T) RETURN NUMBER;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_yield AS
  FUNCTION mask(state_value VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE state_value WHEN 'stored' THEN 0 WHEN 'thawed' THEN 1 WHEN 'cleaned' THEN 3 WHEN 'cooked' THEN 7 WHEN 'frozen-cleaned' THEN 2 WHEN 'frozen-cooked' THEN 6 ELSE -1 END;
  END;
  FUNCTION factor(line JSON_OBJECT_T) RETURN NUMBER IS
    p JSON_OBJECT_T;from_value NUMBER;to_value NUMBER;value NUMBER;result_value NUMBER:=1;key_value VARCHAR2(12);bit_value NUMBER;
  BEGIN
    IF NOT line.has('processing') THEN RETURN 1;END IF;p:=line.get_object('processing');IF p IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Configuracion de merma invalida.');END IF;
    alliance_security.keys_only(p,'version,stockState,recipeState,thaw,clean,cook');IF NOT p.has('version') OR NOT p.get('version').is_number OR p.get_number('version')<>1 THEN alliance_security.fail(400,'COSTING_INPUT','Configuracion de merma invalida.');END IF;
    from_value:=mask(p.get_string('stockState'));to_value:=CASE WHEN p.get_string('recipeState') IN('same','auto') THEN from_value ELSE mask(p.get_string('recipeState')) END;
    IF from_value<0 OR to_value<0 OR BITAND(from_value,to_value)<>from_value THEN alliance_security.fail(400,'COSTING_INPUT','El estado de la receta no puede deshacer la preparacion del inventario.');END IF;
    FOR i IN 1..3 LOOP key_value:=CASE i WHEN 1 THEN 'thaw' WHEN 2 THEN 'clean' ELSE 'cook' END;bit_value:=POWER(2,i-1);
      IF NOT p.has(key_value) OR NOT p.get(key_value).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el porcentaje de merma.');END IF;
      value:=p.get_number(key_value);IF value<0 OR value>99.999999 THEN alliance_security.fail(400,'COSTING_INPUT','El porcentaje de merma debe ser menor que 100.');END IF;
      IF p.get_string('recipeState')='auto' AND value>0 THEN to_value:=to_value+POWER(2,i)-1-BITAND(to_value,POWER(2,i)-1);END IF;
    END LOOP;
    FOR i IN 1..3 LOOP key_value:=CASE i WHEN 1 THEN 'thaw' WHEN 2 THEN 'clean' ELSE 'cook' END;bit_value:=POWER(2,i-1);IF BITAND(from_value,bit_value)=0 AND BITAND(to_value,bit_value)<>0 THEN result_value:=result_value*(1-p.get_number(key_value)/100);END IF;END LOOP;RETURN result_value;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_materials AUTHID DEFINER AS
  PROCEDURE guard_open(b VARCHAR2,l VARCHAR2,exclude_session VARCHAR2 DEFAULT NULL);
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,command_value VARCHAR2,p JSON_OBJECT_T,job VARCHAR2,sync_mode BOOLEAN DEFAULT FALSE) RETURN JSON_OBJECT_T;
  PROCEDURE sync_processing(u VARCHAR2,b VARCHAR2,l VARCHAR2,old_model JSON_OBJECT_T,new_model JSON_OBJECT_T,revision_value NUMBER);
  PROCEDURE processing_prices(b VARCHAR2,l VARCHAR2,old_model JSON_OBJECT_T,new_model IN OUT JSON_OBJECT_T);
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_pos_store AUTHID DEFINER AS
  FUNCTION stamp RETURN VARCHAR2;
  FUNCTION report_revision(b VARCHAR2,l VARCHAR2) RETURN VARCHAR2;
  PROCEDURE lock_scope(p_business VARCHAR2,p_location VARCHAR2);
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_id VARCHAR2,p_before CLOB,p_after CLOB);
  FUNCTION document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE put_document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2,p_data JSON_OBJECT_T);
  FUNCTION list_documents(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2) RETURN JSON_ARRAY_T;
  PROCEDURE reconcile_session(u VARCHAR2,b VARCHAR2,l VARCHAR2,sid VARCHAR2);
  FUNCTION inventory(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_ARRAY_T;
  FUNCTION matches(p_row JSON_OBJECT_T,p_filters JSON_ARRAY_T) RETURN BOOLEAN;
  FUNCTION query(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  PROCEDURE movement(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_id VARCHAR2,p_product VARCHAR2,p_delta NUMBER,p_kind VARCHAR2,p_reference VARCHAR2,p_session VARCHAR2);
  FUNCTION stock_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_pos_store AS
  PROCEDURE reconcile_session(u VARCHAR2,b VARCHAR2,l VARCHAR2,sid VARCHAR2) IS
  account JSON_OBJECT_T;ticket JSON_OBJECT_T;line JSON_OBJECT_T;entry JSON_OBJECT_T;request JSON_OBJECT_T;sync_value JSON_OBJECT_T;items JSON_ARRAY_T;kept JSON_ARRAY_T;count_value NUMBER;actor VARCHAR2(160);
  BEGIN
  account:=document(b,l,'table_sessions',sid);IF account IS NULL THEN RETURN;END IF;
  SELECT full_name INTO actor FROM users WHERE business_id=b AND id=u;
  SELECT COUNT(*) INTO count_value FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=sid AND NVL(JSON_VALUE(data_json,'$.status'),'served')<>'cancelled';
  IF account.get_string('status')='open' AND count_value=0 THEN account.put('status','closed');account.put('closed_at',stamp);put_document(b,l,'table_sessions',sid,account);END IF;
  FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_tickets' AND JSON_VALUE(data_json,'$.sessionId')=sid) LOOP
    ticket:=JSON_OBJECT_T(x.data_json);items:=ticket.get_array('items');kept:=JSON_ARRAY_T();
    FOR i IN 0..items.get_size-1 LOOP entry:=TREAT(items.get(i) AS JSON_OBJECT_T);line:=document(b,l,'session_items',entry.get_string('id'));IF line IS NOT NULL AND line.get_string('session_id')=sid AND NVL(line.get_string('status'),'served')<>'cancelled' THEN entry.put('name',line.get_string('item_name'));entry.put('quantity',line.get_number('quantity'));entry.put('notes',line.get_string('notes'));kept.append(entry);END IF;END LOOP;
    ticket.put('items',kept);IF account.get_string('status')<>'open' OR kept.get_size=0 THEN ticket.put('status',CASE WHEN account.get_string('status') IN('closed','paid') AND kept.get_size>0 THEN 'delivered' ELSE 'cancelled' END);END IF;
    ticket.put('updatedAt',stamp);ticket.put('updatedById',u);ticket.put('updatedBy',actor);put_document(b,l,'op_tickets',x.id,ticket);
  END LOOP;
  IF account.get_string('status')<>'open' THEN
    FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='service_requests' AND JSON_VALUE(data_json,'$.session_id')=sid) LOOP request:=JSON_OBJECT_T(x.data_json);request.put('status','resolved');request.put('resolved_at',stamp);put_document(b,l,'service_requests',x.id,request);END LOOP;
  END IF;
  sync_value:=document(b,l,'op_ordersync','primary');IF sync_value IS NULL THEN sync_value:=JSON_OBJECT_T('{"revision":0}');END IF;sync_value.put('revision',sync_value.get_number('revision')+1);put_document(b,l,'op_ordersync','primary',sync_value);
  END;
  FUNCTION report_revision(b VARCHAR2,l VARCHAR2) RETURN VARCHAR2 IS n NUMBER;
  BEGIN SELECT NVL(MAX(version),0) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_reportsync' AND id='primary';RETURN 'oracle-'||TO_CHAR(n);END;
  FUNCTION stamp RETURN VARCHAR2 IS BEGIN RETURN TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');END;
  PROCEDURE lock_scope(p_business VARCHAR2,p_location VARCHAR2) IS n VARCHAR2(36);
  BEGIN SELECT id INTO n FROM locations WHERE business_id=p_business AND id=p_location AND active=1 FOR UPDATE;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible.');END;
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_id VARCHAR2,p_before CLOB,p_after CLOB) IS id_value VARCHAR2(36):=alliance_security.new_id;
  BEGIN INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json)VALUES(id_value,p_business,p_user,p_action,SUBSTR(p_id,1,36),p_before,p_after);END;
  FUNCTION document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2) RETURN JSON_OBJECT_T IS t CLOB;
  BEGIN SELECT data_json INTO t FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=p_entity AND id=p_id;RETURN JSON_OBJECT_T(t);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;END;
  PROCEDURE put_document(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2,p_id VARCHAR2,p_data JSON_OBJECT_T) IS t CLOB:=p_data.to_clob;
  BEGIN
  MERGE INTO alliance_pos_documents d USING(SELECT p_business b,p_location l,p_entity e,p_id i FROM dual)s
  ON(d.business_id=s.b AND d.location_id=s.l AND d.entity=s.e AND d.id=s.i)
  WHEN MATCHED THEN UPDATE SET data_json=t,version=d.version+1
  WHEN NOT MATCHED THEN INSERT(business_id,location_id,entity,id,data_json)VALUES(s.b,s.l,s.e,s.i,t);
  END;
  FUNCTION list_documents(p_business VARCHAR2,p_location VARCHAR2,p_entity VARCHAR2) RETURN JSON_ARRAY_T IS a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;other JSON_OBJECT_T;items JSON_ARRAY_T;session_value VARCHAR2(80);
  BEGIN
  FOR r IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=p_entity ORDER BY created_at,id) LOOP
    o:=JSON_OBJECT_T(r.data_json);
    IF p_entity IN('table_sessions','service_requests') THEN other:=document(p_business,p_location,'restaurant_tables',o.get_string('table_id'));IF other IS NULL THEN o.put_null('restaurant_tables');ELSE o.put('restaurant_tables',other);END IF;END IF;
    IF p_entity='table_sessions' THEN
      session_value:=o.get_string('id');items:=JSON_ARRAY_T();FOR i IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=session_value ORDER BY created_at,id) LOOP items.append(JSON_OBJECT_T(i.data_json));END LOOP;o.put('session_items',items);
    ELSIF p_entity='menu_items' THEN other:=document(p_business,p_location,'menu_categories',o.get_string('category_id'));IF other IS NOT NULL THEN o.put('menu_categories',other);END IF;END IF;
    a.append(o);
  END LOOP;RETURN a;
  END;
  FUNCTION inventory(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_ARRAY_T IS a JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;item JSON_OBJECT_T;
  BEGIN
  FOR r IN(SELECT s.*,p.name,p.price_minor,p.active,c.name category FROM alliance_pos_stock s JOIN products p ON p.id=s.product_id AND p.business_id=s.business_id JOIN product_categories c ON c.id=p.category_id AND c.business_id=p.business_id WHERE s.business_id=p_business AND s.location_id=p_location AND EXISTS(SELECT 1 FROM alliance_pos_documents d WHERE d.business_id=s.business_id AND d.location_id=s.location_id AND d.entity='menu_items' AND d.id=s.product_id) ORDER BY p.name) LOOP
    o:=JSON_OBJECT_T();o.put('productId',r.product_id);o.put('version',r.version);o.put('code',r.code);o.put('name',r.name);o.put('category',r.category);o.put('unit',r.unit_name);o.put('costPrice',r.cost_minor/100);o.put('stock',r.stock);o.put('minStock',r.min_stock);o.put('isAvailable',r.active=1);o.put('salePrice',r.price_minor/100);o.put('updatedAt',TO_CHAR(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));a.append(o);
  END LOOP;RETURN a;
  END;
  FUNCTION matches(p_row JSON_OBJECT_T,p_filters JSON_ARRAY_T) RETURN BOOLEAN IS f JSON_OBJECT_T;key_value VARCHAR2(80);mode_value VARCHAR2(12);actual JSON_ELEMENT_T;expected JSON_ELEMENT_T;xs JSON_ARRAY_T;hit BOOLEAN;
  BEGIN
  IF p_filters IS NULL THEN RETURN TRUE;END IF;IF p_filters.get_size>20 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados filtros.');END IF;
  FOR i IN 0..p_filters.get_size-1 LOOP f:=TREAT(p_filters.get(i) AS JSON_OBJECT_T);key_value:=f.get_string('field');mode_value:=f.get_string('op');
    IF NOT REGEXP_LIKE(key_value,'^[a-z_]{1,60}$') OR mode_value NOT IN('eq','neq','in','is') THEN alliance_security.fail(400,'INVALID_INPUT','Filtro no permitido.');END IF;
    actual:=p_row.get(key_value);expected:=f.get('value');
    IF mode_value='in' THEN xs:=f.get_array('value');hit:=FALSE;FOR j IN 0..xs.get_size-1 LOOP IF actual IS NOT NULL AND actual.to_string=xs.get(j).to_string THEN hit:=TRUE;END IF;END LOOP;IF NOT hit THEN RETURN FALSE;END IF;
    ELSIF mode_value='neq' THEN IF actual IS NOT NULL AND expected IS NOT NULL AND actual.to_string=expected.to_string THEN RETURN FALSE;END IF;
    ELSE IF actual IS NULL THEN IF expected IS NOT NULL AND NOT expected.is_null THEN RETURN FALSE;END IF;ELSIF expected IS NULL OR actual.to_string<>expected.to_string THEN RETURN FALSE;END IF;END IF;
  END LOOP;RETURN TRUE;
  END;
  FUNCTION query(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  entity_value VARCHAR2(32):=p_body.get_string('table');op VARCHAR2(12):=p_body.get_string('op');permission_value VARCHAR2(80);rows_json JSON_ARRAY_T;out_json JSON_ARRAY_T:=JSON_ARRAY_T();filters JSON_ARRAY_T:=p_body.get_array('filters');patch JSON_OBJECT_T;row_json JSON_OBJECT_T;old_json JSON_OBJECT_T;parent JSON_OBJECT_T;keys_json JSON_KEY_LIST;
  id_value VARCHAR2(80);category_value VARCHAR2(36);name_value VARCHAR2(160);price_value NUMBER;active_value NUMBER;data_value CLOB;n NUMBER;search_value VARCHAR2(80);result_json JSON_OBJECT_T:=JSON_OBJECT_T();
  BEGIN
  alliance_security.keys_only(p_body,'table,op,filters,values,single,order,limit,expected_versions');
  IF entity_value NOT IN('business_settings','restaurant_tables','menu_categories','menu_items','table_sessions','session_items','service_requests') OR op NOT IN('select','insert','update','upsert','delete') OR entity_value IS NULL OR op IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Operacion no permitida.');END IF;
  IF op='select' THEN
    permission_value:=CASE entity_value WHEN 'table_sessions' THEN 'accounts.read' WHEN 'session_items' THEN 'accounts.read' WHEN 'service_requests' THEN 'service.read' ELSE 'products.read' END;
  ELSE
    permission_value:=CASE entity_value WHEN 'business_settings' THEN 'brand.manage' WHEN 'restaurant_tables' THEN 'tables.manage' WHEN 'menu_categories' THEN 'products.write' WHEN 'menu_items' THEN 'products.write' ELSE 'service.write' END;
    IF op='delete' AND entity_value IN('table_sessions','session_items') THEN alliance_security.fail(409,'AUDIT_REQUIRED','Cancela el consumo para conservar su historial.');END IF;
    lock_scope(p_business,p_location);
  END IF;
  alliance_security.require_location(p_user,p_business,p_location,permission_value);
  rows_json:=list_documents(p_business,p_location,entity_value);
  IF op='insert' OR op='upsert' THEN
    patch:=p_body.get_object('values');IF patch IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Faltan datos.');END IF;
    id_value:=patch.get_string('id');IF entity_value='business_settings' THEN id_value:='primary';END IF;
    IF id_value IS NULL THEN id_value:=alliance_security.new_id;END IF;
    old_json:=document(p_business,p_location,entity_value,id_value);
    IF old_json IS NOT NULL AND op='insert' THEN result_json.put('value',old_json);RETURN result_json;END IF;
    IF old_json IS NULL THEN old_json:=JSON_OBJECT_T();old_json.put('id',id_value);old_json.put('created_at',stamp);END IF;rows_json:=JSON_ARRAY_T();rows_json.append(old_json);
  END IF;
  IF op<>'select' AND op<>'delete' THEN patch:=p_body.get_object('values');
    IF entity_value='business_settings' THEN alliance_security.keys_only(patch,'id,is_primary,business_name,subtitle,accent_color,currency,logo_url,cover_url,background_url,whatsapp,phone,address,tips_enabled,tip_percentage,business_type,persons_enabled');IF patch.has('persons_enabled') THEN n:=alliance_security.flag(patch,'persons_enabled');END IF;
    ELSIF entity_value='restaurant_tables' THEN alliance_security.keys_only(patch,'id,table_number,table_name,qr_code,qr_image_url,is_active');
    ELSIF entity_value='menu_categories' THEN alliance_security.keys_only(patch,'id,name,sort_order,is_active');
    ELSIF entity_value='menu_items' THEN alliance_security.keys_only(patch,'id,category_id,name,description,price,image_url,is_available,sort_order');
    ELSIF entity_value='table_sessions' THEN alliance_security.keys_only(patch,'id,table_id,status,sale_channel,assigned_waiter_id,payer_name,discount,tax,service_fee,discount_amount,tax_amount,service_fee_amount,closed_at,payment_method,paid_at,subtotal,total');
    ELSIF entity_value='session_items' THEN alliance_security.keys_only(patch,'id,session_id,table_id,menu_item_id,item_name,quantity,unit_price,status,notes,created_by_user_id,updated_by_user_id');
    ELSE alliance_security.keys_only(patch,'id,table_id,session_id,request_type,message,status,acknowledged_by_user_id,acknowledged_at,resolved_at');END IF;
  END IF;
  FOR i IN 0..rows_json.get_size-1 LOOP row_json:=TREAT(rows_json.get(i) AS JSON_OBJECT_T);
    IF op IN('insert','upsert') OR matches(row_json,filters) THEN
      id_value:=row_json.get_string('id');
      IF entity_value='service_requests' AND row_json.get_string('request_type')='order' AND op<>'select' THEN alliance_security.fail(409,'ORDER_WORKFLOW','Acepta o rechaza esta comanda desde su detalle en Inicio.');END IF;
      IF op='delete' THEN
        IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede eliminar registros.');END IF;
        IF entity_value='restaurant_tables' THEN SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=id_value AND JSON_VALUE(data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','La mesa tiene una cuenta abierta.');END IF;END IF;
        DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity=entity_value AND id=id_value;
      ELSIF op<>'select' THEN
        old_json:=JSON_OBJECT_T(row_json.to_clob);keys_json:=patch.get_keys;
        FOR j IN 1..keys_json.COUNT LOOP IF keys_json(j)<>'id' THEN row_json.put(keys_json(j),patch.get(keys_json(j)));END IF;END LOOP;
        row_json.remove('restaurant_tables');row_json.remove('session_items');row_json.remove('menu_categories');row_json.put('updated_at',stamp);
        IF entity_value IN('menu_categories','menu_items') THEN name_value:=alliance_security.text_value(row_json,'name',160);END IF;
        IF entity_value='menu_categories' AND NOT row_json.has('is_active') THEN row_json.put('is_active',TRUE);END IF;
        IF entity_value='menu_items' AND NOT row_json.has('is_available') THEN row_json.put('is_available',TRUE);END IF;
        IF entity_value='restaurant_tables' THEN IF row_json.get_number('table_number')<1 OR row_json.get_number('table_number')>10000 THEN alliance_security.fail(400,'INVALID_INPUT','Numero de mesa invalido.');END IF;IF NOT row_json.has('is_active') THEN row_json.put('is_active',TRUE);END IF;IF NOT row_json.has('qr_code') THEN row_json.put('qr_code',LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32))));END IF;END IF;
        IF entity_value='business_settings' THEN row_json.put('is_primary',TRUE);row_json.put('currency','COP');END IF;
        IF entity_value='menu_items' THEN
          IF NOT REGEXP_LIKE(id_value,'^[0-9a-fA-F-]{36}$') THEN alliance_security.fail(400,'INVALID_INPUT','ID de producto invalido.');END IF;
          price_value:=ROUND(row_json.get_number('price')*100);IF price_value IS NULL OR price_value<0 OR price_value>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','Precio invalido.');END IF;
          category_value:=row_json.get_string('category_id');parent:=document(p_business,p_location,'menu_categories',category_value);
          IF parent IS NULL THEN category_value:=NULL;SELECT MIN(id) INTO category_value FROM product_categories WHERE business_id=p_business AND name='Otros';IF category_value IS NULL THEN category_value:=alliance_security.new_id;INSERT INTO product_categories(id,business_id,name)VALUES(category_value,p_business,'Otros');END IF;
          ELSE SELECT COUNT(*) INTO n FROM product_categories WHERE business_id=p_business AND id=category_value;IF n=0 THEN name_value:=parent.get_string('name');SELECT MIN(id) INTO search_value FROM product_categories WHERE business_id=p_business AND name=name_value;IF search_value IS NOT NULL THEN category_value:=search_value;ELSE INSERT INTO product_categories(id,business_id,name)VALUES(category_value,p_business,name_value);END IF;END IF;END IF;
          name_value:=row_json.get_string('name');active_value:=1;IF row_json.has('is_available') AND NOT row_json.get_boolean('is_available') THEN active_value:=0;END IF;
          SELECT COUNT(*) INTO n FROM products WHERE id=id_value AND business_id=p_business;
          IF n=0 THEN INSERT INTO products(id,business_id,sku,name,category_id,price_minor,kind,unit_id,active)VALUES(id_value,p_business,SUBSTR(id_value,1,64),name_value,category_value,price_value,'SIMPLE','u',active_value);
          ELSE UPDATE products SET name=name_value,price_minor=price_value,active=active_value,version=version+1,updated_at=SYSTIMESTAMP WHERE id=id_value AND business_id=p_business;END IF;
          row_json.put('price',price_value/100);IF NOT row_json.has('is_available') THEN row_json.put('is_available',TRUE);END IF;
        ELSIF entity_value='table_sessions' THEN
          IF NOT row_json.has('status') THEN row_json.put('status','open');END IF;
          IF NOT row_json.has('sale_channel') THEN row_json.put('sale_channel','table');END IF;
          IF row_json.get_string('table_id') IS NOT NULL THEN parent:=document(p_business,p_location,'restaurant_tables',row_json.get_string('table_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Mesa no disponible.');END IF;END IF;
          IF row_json.get_string('status') NOT IN('open','paid','closed','cancelled') THEN alliance_security.fail(400,'INVALID_INPUT','Estado de cuenta invalido.');END IF;
          IF row_json.get_string('status')='open' THEN
            search_value:=row_json.get_string('table_id');SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='table_sessions' AND id<>id_value AND JSON_VALUE(data_json,'$.table_id')=search_value AND JSON_VALUE(data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','La mesa ya tiene una cuenta abierta.');END IF;
          ELSE
            alliance_security.require_location(p_user,p_business,p_location,'sales.write');
            IF row_json.get_string('status') IN('paid','closed') THEN SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=id_value AND NVL(JSON_VALUE(data_json,'$.status'),'served')<>'cancelled';IF n>0 THEN alliance_security.fail(409,'PAYMENT_REQUIRED','Registra el pago para cerrar una cuenta con consumos.');END IF;
            ELSIF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede cancelar una cuenta.');END IF;
          END IF;
          IF NOT row_json.has('opened_at') THEN row_json.put('opened_at',stamp);END IF;
        ELSIF entity_value='session_items' THEN
          IF row_json.get_string('status')='cancelled' AND NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede retirar consumos.');END IF;
          parent:=document(p_business,p_location,'table_sessions',row_json.get_string('session_id'));IF parent IS NULL OR parent.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;
          IF row_json.get_number('quantity') IS NULL OR row_json.get_number('quantity')<=0 OR row_json.get_number('quantity')>10000 OR row_json.get_number('unit_price') IS NULL OR row_json.get_number('unit_price')<0 THEN alliance_security.fail(400,'INVALID_INPUT','Cantidad o precio invalido.');END IF;
          IF row_json.get_string('menu_item_id') IS NOT NULL THEN parent:=document(p_business,p_location,'menu_items',row_json.get_string('menu_item_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Producto no disponible.');END IF;END IF;
          IF NOT row_json.has('status') THEN row_json.put('status','confirmed');END IF;row_json.put('updated_by_user_id',p_user);IF op='insert' THEN row_json.put('created_by_user_id',p_user);END IF;
        ELSIF entity_value='service_requests' THEN
          parent:=document(p_business,p_location,'restaurant_tables',row_json.get_string('table_id'));IF parent IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Mesa no disponible.');END IF;
          IF NOT row_json.has('status') THEN row_json.put('status','pending');END IF;
          IF row_json.get_string('status') NOT IN('pending','acknowledged','resolved') THEN alliance_security.fail(400,'INVALID_INPUT','Estado de solicitud invalido.');END IF;
        END IF;
        put_document(p_business,p_location,entity_value,id_value,row_json);audit(p_user,p_business,'POS_'||UPPER(entity_value),id_value,old_json.to_clob,row_json.to_clob);
      END IF;
      out_json.append(row_json);
    END IF;
  END LOOP;
  IF op='update' AND (entity_value='session_items' OR (entity_value='table_sessions' AND patch.get_string('status') IN('closed','paid'))) THEN FOR i IN 0..out_json.get_size-1 LOOP row_json:=TREAT(out_json.get(i) AS JSON_OBJECT_T);reconcile_session(p_user,p_business,p_location,CASE WHEN entity_value='session_items' THEN row_json.get_string('session_id') ELSE row_json.get_string('id') END);END LOOP;END IF;
  IF op<>'select' AND entity_value IN('session_items','table_sessions') THEN alliance_materials.guard_open(p_business,p_location);END IF;
  IF p_body.get_string('single') IN('single','maybeSingle') THEN
    IF out_json.get_size=0 THEN result_json.put_null('value');ELSIF out_json.get_size=1 THEN result_json.put('value',out_json.get(0));ELSE alliance_security.fail(409,'MULTIPLE_ROWS','El filtro devolvio varios registros.');END IF;
  ELSE result_json.put('value',out_json);END IF;RETURN result_json;
  END;
  PROCEDURE movement(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_id VARCHAR2,p_product VARCHAR2,p_delta NUMBER,p_kind VARCHAR2,p_reference VARCHAR2,p_session VARCHAR2) IS before_value NUMBER;cost_value NUMBER;n NUMBER;negative_value NUMBER;
  BEGIN
  SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND id=p_id;IF n>0 THEN RETURN;END IF;
  BEGIN SELECT stock,cost_minor,allow_negative INTO before_value,cost_value,negative_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=p_product FOR UPDATE;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Configura el inventario del producto.');END;
  IF p_delta IS NULL OR (before_value+p_delta<0 AND negative_value=0) THEN alliance_security.fail(409,'INSUFFICIENT_STOCK','No hay existencias suficientes.');END IF;
  UPDATE alliance_pos_stock SET stock=before_value+p_delta,version=version+1,updated_at=SYSTIMESTAMP WHERE business_id=p_business AND location_id=p_location AND product_id=p_product;
  INSERT INTO alliance_pos_movements(business_id,location_id,id,product_id,actor_user_id,delta,stock_before,stock_after,cost_minor,kind,reference,session_id,allow_negative)VALUES(p_business,p_location,p_id,p_product,p_user,p_delta,before_value,before_value+p_delta,cost_value,p_kind,SUBSTR(p_reference,1,160),p_session,negative_value);
  END;
  FUNCTION stock_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
  r JSON_OBJECT_T:=JSON_OBJECT_T();items JSON_ARRAY_T;item JSON_OBJECT_T;row_json JSON_OBJECT_T;id_value VARCHAR2(36);event_value VARCHAR2(160);code_value VARCHAR2(64);unit_value VARCHAR2(80);cost_value NUMBER;min_value NUMBER;stock_value NUMBER;before_value NUMBER;n NUMBER;cost_current NUMBER;entity VARCHAR2(36);search_value VARCHAR2(160);ctx JSON_OBJECT_T;pa JSON_ARRAY_T;can_read_cost BOOLEAN:=FALSE;
  BEGIN
  IF p_action IN('get_inventory','status','bootstrap') THEN alliance_security.require_location(p_user,p_business,p_location,'products.read');ctx:=alliance_security.context_for(p_user);pa:=ctx.get_object('permissions').get_array(p_location);FOR i IN 0..pa.get_size-1 LOOP IF pa.get_string(i)='inventory.read' THEN can_read_cost:=TRUE;END IF;END LOOP;items:=inventory(p_business,p_location);IF NOT can_read_cost THEN FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);item.put('costPrice',0);items.put(i,item,TRUE);END LOOP;END IF;r.put('items',items);r.put('everInitialized',TRUE);r.put('timezone','America/Bogota');r.put('syncedAt',stamp);r.put('historyRevision',report_revision(p_business,p_location));r.put('movementRevision',report_revision(p_business,p_location));r.put('ok',TRUE);RETURN r;END IF;
  lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'inventory.write');
  IF p_action IN('upsert_inventory','sync_inventory') THEN
    IF p_action='upsert_inventory' THEN items:=JSON_ARRAY_T();items.append(p_payload.get_object('item'));ELSE items:=p_payload.get_array('items');END IF;
    IF items.get_size>500 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados productos.');END IF;
    FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);id_value:=item.get_string('productId');row_json:=document(p_business,p_location,'menu_items',id_value);IF row_json IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Producto no disponible en esta sucursal.');END IF;
      cost_value:=ROUND(item.get_number('costPrice')*100);min_value:=item.get_number('minStock');stock_value:=item.get_number('stock');code_value:=SUBSTR(item.get_string('code'),1,64);unit_value:=SUBSTR(item.get_string('unit'),1,80);
      IF cost_value IS NULL OR cost_value<0 OR min_value IS NULL OR min_value<0 OR stock_value IS NULL OR stock_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Costo o existencias invalidos.');END IF;
      SELECT COUNT(*) INTO n FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      IF n=0 THEN INSERT INTO alliance_pos_stock(business_id,location_id,product_id,code,unit_name,cost_minor,min_stock)VALUES(p_business,p_location,id_value,code_value,unit_value,cost_value,min_value);ctx:=document(p_business,p_location,'op_settings','primary');IF ctx IS NOT NULL AND ctx.get_boolean('allowNegative') THEN UPDATE alliance_pos_stock SET allow_negative=1 WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;END IF;END IF;
      SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      IF item.has('expectedStockVersion') THEN SELECT version INTO cost_current FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;IF cost_current<>item.get_number('expectedStockVersion') THEN alliance_security.fail(409,'STOCK_CONFLICT','Las existencias cambiaron en otro equipo. Revisa el registro pendiente.');END IF;END IF;
      UPDATE alliance_pos_stock SET cost_minor=cost_value,min_stock=min_value,code=code_value,unit_name=unit_value,updated_at=SYSTIMESTAMP WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;
      event_value:=NVL(item.get_string('movementEventId'),alliance_security.new_id);movement(p_user,p_business,p_location,event_value,id_value,stock_value-before_value,CASE WHEN n=0 THEN 'NUEVO_PRODUCTO' WHEN stock_value>=before_value THEN 'ENTRADA_EDICION' ELSE 'SALIDA_EDICION' END,'FICHA_PRODUCTO',NULL);
    END LOOP;
  ELSIF p_action='adjust_inventory' THEN
    item:=p_payload.get_object('adjustment');id_value:=item.get_string('productId');event_value:=alliance_security.text_value(item,'eventId',160);
    IF item.get_string('reversesEventId') IS NOT NULL THEN search_value:=item.get_string('reversesEventId');SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND id=search_value;IF n=0 THEN r.put('skippedReversal',TRUE);ELSE movement(p_user,p_business,p_location,event_value,id_value,item.get_number('delta'),NVL(item.get_string('movementType'),'AJUSTE'),item.get_string('reference'),item.get_string('sessionId'));END IF;
    ELSE movement(p_user,p_business,p_location,event_value,id_value,item.get_number('delta'),NVL(item.get_string('movementType'),'AJUSTE'),item.get_string('reference'),item.get_string('sessionId'));END IF;
  ELSIF p_action='set_inventory_stock' THEN id_value:=p_payload.get_string('productId');SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;stock_value:=p_payload.get_number('stock');IF stock_value IS NULL OR stock_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Existencia invalida.');END IF;movement(p_user,p_business,p_location,alliance_security.new_id,id_value,stock_value-before_value,'AJUSTE_INVENTARIO','AJUSTE',NULL);
  ELSIF p_action IN('clear_inventory','clear_inventory_movements') THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede reiniciar el historial.');END IF;
    IF p_action='clear_inventory_movements' THEN row_json:=document(p_business,p_location,'configuration','history');IF row_json IS NULL THEN row_json:=JSON_OBJECT_T();END IF;row_json.put('movements_cutoff',stamp);put_document(p_business,p_location,'configuration','history',row_json);r.put('movements',JSON_ARRAY_T());
    ELSE
      SELECT COUNT(*) INTO n FROM alliance_pos_documents d JOIN alliance_pos_documents s ON s.business_id=d.business_id AND s.location_id=d.location_id AND s.entity='table_sessions' AND s.id=JSON_VALUE(d.data_json,'$.session_id') WHERE d.business_id=p_business AND d.location_id=p_location AND d.entity='session_items' AND NVL(JSON_VALUE(d.data_json,'$.status'),'served')<>'cancelled' AND JSON_VALUE(s.data_json,'$.status')='open';IF n>0 THEN alliance_security.fail(409,'OPEN_ACCOUNT','Cobra las cuentas abiertas antes de vaciar el inventario.');END IF;
      FOR x IN(SELECT product_id,stock FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location) LOOP movement(p_user,p_business,p_location,alliance_security.new_id,x.product_id,-x.stock,'RETIRO_CATALOGO','REINICIO_INVENTARIO',NULL);END LOOP;
      DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='menu_items';
    END IF;r.put('cleared',TRUE);
  ELSIF p_action='delete_inventory' THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede retirar productos.');END IF;
    id_value:=p_payload.get_string('productId');SELECT stock INTO before_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=id_value;movement(p_user,p_business,p_location,alliance_security.new_id,id_value,-before_value,'RETIRO_CATALOGO','RETIRO_PRODUCTO',NULL);
  ELSIF p_action='update_inventory_movement_cost' THEN
    IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede corregir costos historicos.');END IF;
    cost_value:=ROUND(p_payload.get_number('unitCost')*100);IF cost_value IS NULL OR cost_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Costo invalido.');END IF;
    search_value:=p_payload.get_string('movementId');UPDATE alliance_pos_movements SET cost_minor=cost_value WHERE business_id=p_business AND location_id=p_location AND id=search_value AND delta>0;IF SQL%ROWCOUNT=0 THEN alliance_security.fail(404,'NOT_FOUND','Compra no disponible.');END IF;
  ELSE alliance_security.fail(409,'AUDIT_REQUIRED','El historial se conserva para auditoria. Usa ajustes o anulaciones individuales.');END IF;
  audit(p_user,p_business,'POS_STOCK_'||UPPER(p_action),NVL(id_value,p_location),NULL,p_payload.to_clob);
  r.put('items',inventory(p_business,p_location));r.put('ok',TRUE);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_operations AUTHID DEFINER AS
  FUNCTION get_row(b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE put_row(u VARCHAR2,b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2,o IN OUT JSON_OBJECT_T);
  FUNCTION convert_quantity(q NUMBER,f VARCHAR2,t VARCHAR2) RETURN NUMBER;
  FUNCTION raw_item(b VARCHAR2,l VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE raw_move(u VARCHAR2,b VARCHAR2,l VARCHAR2,i VARCHAR2,ingredient VARCHAR2,q NUMBER,k VARCHAR2,ref VARCHAR2);
  FUNCTION open_cash(b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION cash_expected(b VARCHAR2,l VARCHAR2,s JSON_OBJECT_T) RETURN NUMBER;
  PROCEDURE cash_entry(u VARCHAR2,b VARCHAR2,l VARCHAR2,i VARCHAR2,amount NUMBER,method VARCHAR2,ref VARCHAR2);
  FUNCTION snapshot(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION customer_history(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  PROCEDURE guard_versions(b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T);
  FUNCTION device_status(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION checked(b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION numeric_value(p JSON_OBJECT_T,k VARCHAR2,lo NUMBER DEFAULT 0,hi NUMBER DEFAULT 1e12) RETURN NUMBER;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_operations AS
  FUNCTION customer_history(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    customer_id VARCHAR2(80);search_value VARCHAR2(200);offset_value NUMBER;n NUMBER:=0;old JSON_OBJECT_T;o JSON_OBJECT_T;r JSON_OBJECT_T:=JSON_OBJECT_T();arr JSON_ARRAY_T:=JSON_ARRAY_T();
  BEGIN
    alliance_security.require_location(u,b,l,'customers.read');alliance_security.keys_only(p,'customerId,query,offset');customer_id:=alliance_security.text_value(p,'customerId',80);old:=checked(b,l,'customers',customer_id);search_value:=LOWER(p.get_string('query'));IF LENGTH(search_value)>200 THEN alliance_security.fail(400,'INVALID_INPUT','Busqueda demasiado larga.');END IF;offset_value:=numeric_value(p,'offset',0,1000000);IF MOD(offset_value,1)<>0 THEN alliance_security.fail(400,'INVALID_INPUT','Pagina invalida.');END IF;
    FOR x IN(SELECT * FROM (
      SELECT 'Consumo' kind,NVL(JSON_VALUE(invoice_json,'$.createdAt' RETURNING TIMESTAMP WITH TIME ZONE NULL ON ERROR),created_at) moment,id,invoice_json doc FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND voided=0 AND JSON_VALUE(invoice_json,'$.customerId' RETURNING VARCHAR2(80))=customer_id
      UNION ALL
      SELECT 'Abono',NVL(JSON_VALUE(s.data_json,'$.occurredAt' RETURNING TIMESTAMP WITH TIME ZONE NULL ON ERROR),s.created_at),s.id,s.data_json FROM alliance_pos_documents s WHERE s.business_id=b AND s.location_id=l AND s.entity='op_settlements' AND JSON_VALUE(s.data_json,'$.type')='debt_pay' AND EXISTS(SELECT 1 FROM alliance_pos_documents d WHERE d.business_id=b AND d.location_id=l AND d.entity='op_debts' AND d.id=JSON_VALUE(s.data_json,'$.recordId') AND JSON_VALUE(d.data_json,'$.customerId')=customer_id)
    ) WHERE search_value IS NULL OR INSTR(LOWER(doc),search_value)>0 OR INSTR(LOWER(TO_CHAR(moment AT TIME ZONE 'America/Bogota','DD mon YYYY','NLS_DATE_LANGUAGE=SPANISH')),search_value)>0 ORDER BY moment DESC,id DESC OFFSET offset_value ROWS FETCH NEXT 26 ROWS ONLY) LOOP
      n:=n+1;IF n<=25 THEN old:=JSON_OBJECT_T(x.doc);o:=JSON_OBJECT_T();o.put('id',x.id);o.put('kind',x.kind);o.put('at',TO_CHAR(x.moment AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));
        IF x.kind='Consumo' THEN o.put('title',old.get_string('number'));o.put('actor',old.get_string('waiterName'));o.put('items',old.get_array('items'));o.put('total',old.get_object('totals').get_number('total'));
        ELSE o.put('title',NVL(old.get_string('reference'),'Abono a la cuenta'));o.put('actor',old.get_string('actorName'));o.put('items',JSON_ARRAY_T());o.put('total',old.get_number('amount'));END IF;arr.append(o);END IF;
    END LOOP;r.put('items',arr);r.put('hasMore',n>25);r.put('offset',offset_value);RETURN r;
  END;
  FUNCTION get_row(b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T IS BEGIN RETURN alliance_pos_store.document(b,l,'op_'||LOWER(k),i);END;
  PROCEDURE put_row(u VARCHAR2,b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2,o IN OUT JSON_OBJECT_T) IS name_value VARCHAR2(160);previous_row JSON_OBJECT_T;BEGIN
    SELECT full_name INTO name_value FROM users WHERE business_id=b AND id=u;
    IF LOWER(k) IN('customers','suppliers') THEN previous_row:=get_row(b,l,k,i);IF previous_row IS NULL THEN o.put('createdById',u);o.put('createdByName',name_value);o.put('createdAt',alliance_activity.occurred_at);ELSIF previous_row.has('createdById') THEN o.put('createdById',previous_row.get_string('createdById'));o.put('createdByName',previous_row.get_string('createdByName'));o.put('createdAt',previous_row.get_string('createdAt'));END IF;END IF;
    o.put('id',i);o.put('actorId',u);o.put('actorName',name_value);o.put('at',alliance_pos_store.stamp);o.put('occurredAt',alliance_activity.occurred_at);alliance_pos_store.put_document(b,l,'op_'||LOWER(k),i,o);
  END;
  FUNCTION checked(b VARCHAR2,l VARCHAR2,k VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T IS o JSON_OBJECT_T;BEGIN o:=get_row(b,l,k,i);IF o IS NULL THEN alliance_security.fail(404,'NOT_FOUND','El registro no pertenece a esta sucursal o ya no existe.');END IF;RETURN o;END;
  FUNCTION numeric_value(p JSON_OBJECT_T,k VARCHAR2,lo NUMBER DEFAULT 0,hi NUMBER DEFAULT 1e12) RETURN NUMBER IS n NUMBER;BEGIN
    IF NOT p.has(k) OR NOT p.get(k).is_number THEN alliance_security.fail(400,'INVALID_INPUT','Completa el valor de '||k||'.');END IF;n:=p.get_number(k);IF n<lo OR n>hi THEN alliance_security.fail(400,'INVALID_INPUT','Valor fuera del rango: '||k);END IF;RETURN n;
  END;
  FUNCTION convert_quantity(q NUMBER,f VARCHAR2,t VARCHAR2) RETURN NUMBER IS a units_of_measure%ROWTYPE;c units_of_measure%ROWTYPE;BEGIN
    SELECT * INTO a FROM units_of_measure WHERE id=CASE WHEN f='unit' THEN 'u' ELSE f END;SELECT * INTO c FROM units_of_measure WHERE id=CASE WHEN t='unit' THEN 'u' ELSE t END;
    IF a.dimension<>c.dimension THEN alliance_security.fail(400,'UNIT_MISMATCH','No mezcles peso, volumen y unidades.');END IF;RETURN q*a.factor/c.factor;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(400,'INVALID_UNIT','Unidad no disponible.');RETURN NULL;END;
  FUNCTION raw_item(b VARCHAR2,l VARCHAR2,i VARCHAR2) RETURN JSON_OBJECT_T IS x alliance_raw_stock%ROWTYPE;o JSON_OBJECT_T:=JSON_OBJECT_T();BEGIN
    SELECT * INTO x FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=i;o.put('id',x.id);o.put('name',x.name);o.put('unit',x.unit_id);o.put('quantity',x.quantity);o.put('unitCost',x.unit_cost);o.put('minStock',x.min_stock);o.put('revision',x.version);o.put('archived',get_row(b,l,'archivedingredients',i) IS NOT NULL);RETURN o;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Insumo no disponible en esta sucursal.');RETURN NULL;END;
  PROCEDURE raw_move(u VARCHAR2,b VARCHAR2,l VARCHAR2,i VARCHAR2,ingredient VARCHAR2,q NUMBER,k VARCHAR2,ref VARCHAR2) IS before_value NUMBER;after_value NUMBER;cost_value NUMBER;n NUMBER;BEGIN
    SELECT COUNT(*) INTO n FROM alliance_raw_movements WHERE business_id=b AND location_id=l AND id=i;IF n>0 THEN alliance_security.fail(409,'DUPLICATE_OPERATION','El movimiento ya existe.');END IF;
    SELECT quantity,unit_cost,allow_negative INTO before_value,cost_value,n FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=ingredient FOR UPDATE;after_value:=ROUND(before_value+q,8);
    IF after_value<0 AND n=0 THEN alliance_security.fail(409,'INSUFFICIENT_STOCK','No hay insumos suficientes. Revisa las existencias antes de vender.');END IF;
    INSERT INTO alliance_raw_movements(business_id,location_id,id,ingredient_id,actor_user_id,delta,stock_before,stock_after,unit_cost,kind,reference,allow_negative)VALUES(b,l,i,ingredient,u,ROUND(q,8),before_value,after_value,cost_value,k,ref,n);
    UPDATE alliance_raw_stock SET quantity=after_value,version=version+1 WHERE business_id=b AND location_id=l AND id=ingredient;
  EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Registra y abastece los insumos de la receta.');END;
  FUNCTION open_cash(b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T IS BEGIN
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_cashsessions' AND JSON_VALUE(data_json,'$.status')='open') LOOP RETURN JSON_OBJECT_T(x.data_json);END LOOP;RETURN NULL;
  END;
  FUNCTION cash_expected(b VARCHAR2,l VARCHAR2,s JSON_OBJECT_T) RETURN NUMBER IS n NUMBER;sid VARCHAR2(80):=s.get_string('id');BEGIN
    SELECT NVL(SUM(JSON_VALUE(data_json,'$.amount' RETURNING NUMBER)),0) INTO n FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_cashmovements' AND JSON_VALUE(data_json,'$.sessionId')=sid;RETURN ROUND(s.get_number('opening')+n,2);
  END;
  FUNCTION device_status(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS o JSON_OBJECT_T;r JSON_OBJECT_T:=JSON_OBJECT_T();id_value VARCHAR2(80);n NUMBER;v VARCHAR2(160);BEGIN
    alliance_security.keys_only(p,'id,name,pending,conflicts,appVersion');id_value:=alliance_security.text_value(p,'id',80,'^[a-zA-Z0-9_-]+$');v:=alliance_security.text_value(p,'name',160);n:=numeric_value(p,'pending',0,1000000);n:=numeric_value(p,'conflicts',0,1000000);v:=alliance_security.text_value(p,'appVersion',80);alliance_pos_store.lock_scope(b,l);o:=JSON_OBJECT_T(p.to_clob);put_row(u,b,l,'devices',id_value,o);r.put('ok',TRUE);RETURN r;
  END;
  PROCEDURE cash_entry(u VARCHAR2,b VARCHAR2,l VARCHAR2,i VARCHAR2,amount NUMBER,method VARCHAR2,ref VARCHAR2) IS s JSON_OBJECT_T;o JSON_OBJECT_T:=JSON_OBJECT_T();settings JSON_OBJECT_T;BEGIN
    IF method<>'cash' OR amount=0 THEN RETURN;END IF;s:=open_cash(b,l);IF s IS NULL THEN settings:=get_row(b,l,'settings','primary');IF settings IS NOT NULL AND settings.get_boolean('cashRequired') THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','Abre la caja antes de registrar efectivo.');END IF;RETURN;END IF;
    IF amount<0 AND cash_expected(b,l,s)+amount<0 THEN alliance_security.fail(409,'CASH_INSUFFICIENT','La caja no tiene ese efectivo disponible. Revisa el pago o registra una entrada real.');END IF;o.put('sessionId',s.get_string('id'));o.put('amount',ROUND(amount,2));o.put('reference',ref);o.put('kind',CASE WHEN amount>0 THEN 'in' ELSE 'out' END);put_row(u,b,l,'cashMovements',i,o);
  END;
  PROCEDURE guard_versions(b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) IS versions JSON_OBJECT_T;keys_value JSON_KEY_LIST;current_value NUMBER;expected_value NUMBER;entity_value VARCHAR2(40):=p.get_string('table');key_value VARCHAR2(80);BEGIN
    IF NOT p.has('expected_versions') THEN RETURN;END IF;versions:=p.get_object('expected_versions');IF versions IS NULL OR versions.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Versiones invalidas.');END IF;keys_value:=versions.get_keys;
    FOR i IN 1..keys_value.COUNT LOOP key_value:=keys_value(i);IF LENGTH(key_value)>80 OR NOT versions.get(key_value).is_number THEN alliance_security.fail(400,'INVALID_INPUT','Version invalida.');END IF;expected_value:=versions.get_number(key_value);SELECT NVL(MAX(version),0) INTO current_value FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity=entity_value AND id=key_value;IF current_value<>expected_value THEN alliance_security.fail(409,'VERSION_CONFLICT','Este registro cambio en otro equipo. Conservamos tu pendiente para revision.');END IF;END LOOP;
  END;
  FUNCTION snapshot(u VARCHAR2,b VARCHAR2,l VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();model JSON_OBJECT_T:=JSON_OBJECT_T();docs JSON_OBJECT_T:=JSON_OBJECT_T();versions JSON_OBJECT_T:=JSON_OBJECT_T();version_rows JSON_OBJECT_T;context_value JSON_OBJECT_T;perms JSON_ARRAY_T;arr JSON_ARRAY_T;o JSON_OBJECT_T;names JSON_ARRAY_T:=JSON_ARRAY_T('["suppliers","purchases","recipes","customers","debts","settlements","cashSessions","cashMovements","tickets","cashReviews","customerPayments"]');key_value VARCHAR2(40);order_session VARCHAR2(80);order_table VARCHAR2(80);p VARCHAR2(32767):=',';kitchen_only BOOLEAN;sup BOOLEAN;finance BOOLEAN;stock BOOLEAN;customer_value VARCHAR2(80);visits NUMBER;spent NUMBER;last_visit VARCHAR2(30);history JSON_OBJECT_T;macro_enabled NUMBER;cutoff TIMESTAMP WITH TIME ZONE;BEGIN
    SELECT 1 INTO macro_enabled FROM locations WHERE business_id=b AND id=l;context_value:=alliance_security.context_for(u);perms:=context_value.get_object('permissions').get_array(l);IF perms IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible.');END IF;FOR i IN 0..perms.get_size-1 LOOP p:=p||perms.get_string(i)||',';END LOOP;
    kitchen_only:=INSTR(p,',kitchen.write,')>0 AND INSTR(p,',service.write,')=0 AND INSTR(p,',accounts.read,')=0;
    sup:=INSTR(p,',supplies.read,')>0;finance:=INSTR(p,',sales.write,')>0;stock:=INSTR(p,',inventory.read,')>0 OR finance;
    FOR i IN 0..names.get_size-1 LOOP key_value:=names.get_string(i);arr:=JSON_ARRAY_T();
      IF (key_value IN('suppliers','purchases') AND sup) OR (key_value='recipes' AND (sup OR finance OR INSTR(p,',service.read,')>0 OR (macro_enabled=1 AND stock))) OR (key_value IN('customers','debts') AND INSTR(p,',customers.read,')>0) OR (key_value='customerPayments' AND INSTR(p,',sales.read,')>0) OR (key_value='settlements' AND (sup OR INSTR(p,',customers.read,')>0)) OR (key_value IN('cashSessions','cashMovements','cashReviews') AND INSTR(p,',cash.read,')>0) OR (key_value='tickets' AND INSTR(p,',kitchen.read,')>0) THEN arr:=alliance_pos_store.list_documents(b,l,'op_'||LOWER(key_value));END IF;IF key_value='customers' THEN FOR j IN 0..arr.get_size-1 LOOP o:=TREAT(arr.get(j) AS JSON_OBJECT_T);customer_value:=o.get_string('id');SELECT COUNT(*),NVL(SUM(total_minor),0),MAX(TO_CHAR(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')) INTO visits,spent,last_visit FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND voided=0 AND JSON_VALUE(invoice_json,'$.customerId' RETURNING VARCHAR2(80))=customer_value;o.put('visits',visits);o.put('totalSpent',spent/100);o.put('lastVisit',last_visit);arr.put(j,o,TRUE);END LOOP;END IF;model.put(key_value,arr);
    END LOOP;
    arr:=JSON_ARRAY_T();IF sup OR finance OR (macro_enabled=1 AND (INSTR(p,',inventory.read,')>0 OR INSTR(p,',service.write,')>0)) THEN FOR x IN(SELECT id FROM alliance_raw_stock WHERE business_id=b AND location_id=l ORDER BY name) LOOP o:=raw_item(b,l,x.id);IF NOT stock AND NOT sup THEN o.put('unitCost',0);END IF;arr.append(o);END LOOP;END IF;model.put('ingredients',arr);
    arr:=JSON_ARRAY_T();IF sup THEN FOR x IN(SELECT m.*,s.name,s.unit_id,v.full_name FROM alliance_raw_movements m JOIN alliance_raw_stock s ON s.business_id=m.business_id AND s.location_id=m.location_id AND s.id=m.ingredient_id JOIN users v ON v.business_id=m.business_id AND v.id=m.actor_user_id WHERE m.business_id=b AND m.location_id=l ORDER BY m.created_at DESC FETCH FIRST 1000 ROWS ONLY) LOOP o:=JSON_OBJECT_T();o.put('id',x.id);o.put('ingredientId',x.ingredient_id);o.put('name',x.name);o.put('unit',x.unit_id);o.put('delta',x.delta);o.put('before',x.stock_before);o.put('after',x.stock_after);o.put('unitCost',x.unit_cost);o.put('kind',x.kind);o.put('reference',x.reference);o.put('actorId',x.actor_user_id);o.put('actorName',x.full_name);o.put('at',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));arr.append(o);END LOOP;END IF;model.put('materialMovements',arr);
    o:=get_row(b,l,'settings','primary');IF o IS NULL THEN o:=JSON_OBJECT_T('{"cashRequired":false,"allowNegative":false}');END IF;model.put('settings',o);
    arr:=JSON_ARRAY_T();FOR x IN(SELECT * FROM units_of_measure ORDER BY dimension,factor) LOOP o:=JSON_OBJECT_T();o.put('id',x.id);o.put('name',x.name);o.put('dimension',x.dimension);o.put('factor',x.factor);arr.append(o);END LOOP;r.put('units',arr);r.put('model',model);
    FOR i IN 1..8 LOOP key_value:=CASE i WHEN 1 THEN 'business_settings' WHEN 2 THEN 'restaurant_tables' WHEN 3 THEN 'menu_categories' WHEN 4 THEN 'menu_items' WHEN 5 THEN 'table_sessions' WHEN 6 THEN 'session_items' WHEN 7 THEN 'service_requests' ELSE 'chat_messages' END;arr:=JSON_ARRAY_T();IF i<=4 OR (NOT kitchen_only AND (INSTR(p,',service.read,')>0 OR INSTR(p,',accounts.read,')>0)) THEN arr:=alliance_pos_store.list_documents(b,l,key_value);END IF;IF key_value='service_requests' AND kitchen_only THEN arr:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='service_requests' AND JSON_VALUE(data_json,'$.request_type')='order') LOOP o:=JSON_OBJECT_T(x.data_json);order_table:=o.get_string('table_id');order_session:=NULL;FOR account_row IN(SELECT id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=order_table AND JSON_VALUE(data_json,'$.status')='open') LOOP order_session:=account_row.id;END LOOP;o.put('currentSessionId',order_session);arr.append(o);END LOOP;END IF;docs.put(key_value,arr);END LOOP;
    FOR i IN 1..8 LOOP key_value:=CASE i WHEN 1 THEN 'business_settings' WHEN 2 THEN 'restaurant_tables' WHEN 3 THEN 'menu_categories' WHEN 4 THEN 'menu_items' WHEN 5 THEN 'table_sessions' WHEN 6 THEN 'session_items' WHEN 7 THEN 'service_requests' ELSE 'chat_messages' END;version_rows:=JSON_OBJECT_T();IF docs.get_array(key_value).get_size>0 THEN FOR x IN(SELECT id,version FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity=key_value ) LOOP version_rows.put(x.id,x.version);END LOOP;END IF;versions.put(key_value,version_rows);END LOOP;
    IF alliance_security.owner(u,b) THEN model.put('devices',alliance_pos_store.list_documents(b,l,'op_devices'));ELSE model.put('devices',JSON_ARRAY_T());END IF;
    r.put('docVersions',versions);r.put('docs',docs);IF stock THEN r.put('inventory',alliance_pos_store.inventory(b,l));ELSE r.put('inventory',JSON_ARRAY_T());END IF;
    history:=alliance_pos_store.document(b,l,'configuration','history');IF history IS NOT NULL AND history.has('income_cutoff') THEN cutoff:=FROM_TZ(TO_TIMESTAMP(history.get_string('income_cutoff'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');r.put('incomeCutoff',history.get_string('income_cutoff'));END IF;arr:=JSON_ARRAY_T();IF INSTR(p,',sales.read,')>0 THEN FOR x IN(SELECT invoice_json,voided FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND (cutoff IS NULL OR created_at>cutoff) ORDER BY created_at DESC FETCH FIRST 2000 ROWS ONLY) LOOP o:=JSON_OBJECT_T(x.invoice_json);o.put('voided',x.voided=1);arr.append(o);END LOOP;END IF;r.put('model',model);r.put('sales',arr);r.put('salesHistoryPartial',arr.get_size>=2000);r.put('at',alliance_pos_store.stamp);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_orders AUTHID DEFINER AS
  PROCEDURE touch(b VARCHAR2,l VARCHAR2);
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_orders AS
  PROCEDURE touch(b VARCHAR2,l VARCHAR2) IS row_value JSON_OBJECT_T;BEGIN row_value:=alliance_pos_store.document(b,l,'op_ordersync','primary');IF row_value IS NULL THEN row_value:=JSON_OBJECT_T('{"revision":0}');END IF;row_value.put('revision',row_value.get_number('revision')+1);alliance_pos_store.put_document(b,l,'op_ordersync','primary',row_value);END;
  FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T;tab JSON_OBJECT_T;product JSON_OBJECT_T;line JSON_OBJECT_T;item JSON_OBJECT_T;order_value JSON_OBJECT_T;session_value JSON_OBJECT_T;ticket JSON_OBJECT_T;sender JSON_OBJECT_T;
    items JSON_ARRAY_T;lines JSON_ARRAY_T:=JSON_ARRAY_T();ticket_lines JSON_ARRAY_T:=JSON_ARRAY_T();id_value VARCHAR2(80);session_id VARCHAR2(80);table_id_value VARCHAR2(80);line_id VARCHAR2(80);actor_name VARCHAR2(160);stamp VARCHAR2(30):=alliance_pos_store.stamp;
    context_value JSON_OBJECT_T;perms JSON_ARRAY_T;allowed BOOLEAN:=FALSE;quantity NUMBER;price NUMBER;total NUMBER:=0;n NUMBER;notes VARCHAR2(500);
  BEGIN
    IF a='orders_revision' THEN alliance_security.keys_only(p,'');context_value:=alliance_security.context_for(u);perms:=context_value.get_object('permissions').get_array(l);IF perms IS NOT NULL THEN FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i) IN('service.read','kitchen.read') THEN allowed:=TRUE;END IF;END LOOP;END IF;IF NOT allowed THEN alliance_security.fail(403,'FORBIDDEN','No puedes consultar comandas en esta sucursal.');END IF;r:=alliance_pos_store.document(b,l,'op_ordersync','primary');IF r IS NULL THEN r:=JSON_OBJECT_T('{"revision":0}');END IF;RETURN r;END IF;
    IF a='order_submit' THEN alliance_security.require_location(u,b,l,'service.write');ELSE context_value:=alliance_security.context_for(u);perms:=context_value.get_object('permissions').get_array(l);IF perms IS NOT NULL THEN FOR i IN 0..perms.get_size-1 LOOP IF perms.get_string(i) IN('service.write','kitchen.write') THEN allowed:=TRUE;END IF;END LOOP;END IF;IF NOT allowed THEN alliance_security.fail(403,'FORBIDDEN','Tu usuario no puede atender comandas en esta sucursal.');END IF;END IF;alliance_pos_store.lock_scope(b,l);
    SELECT full_name INTO actor_name FROM users WHERE business_id=b AND id=u;
    IF a='order_cancel' THEN
      IF NOT alliance_security.location_owner(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede retirar comandas y sus consumos.');END IF;
      alliance_security.keys_only(p,'ticketId');id_value:=alliance_security.text_value(p,'ticketId',80);ticket:=alliance_pos_store.document(b,l,'op_tickets',id_value);IF ticket IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Comanda no disponible.');END IF;IF ticket.get_string('status')='cancelled' THEN RETURN ticket;END IF;
      session_id:=ticket.get_string('sessionId');session_value:=alliance_pos_store.document(b,l,'table_sessions',session_id);IF session_value IS NULL OR session_value.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta ya fue cobrada o cerrada.');END IF;
      items:=ticket.get_array('items');FOR i IN 0..items.get_size-1 LOOP item:=TREAT(items.get(i) AS JSON_OBJECT_T);line_id:=item.get_string('id');line:=alliance_pos_store.document(b,l,'session_items',line_id);IF line IS NOT NULL AND line.get_string('session_id')=session_id THEN line.put('status','cancelled');line.put('updated_by_user_id',u);alliance_pos_store.put_document(b,l,'session_items',line_id,line);END IF;END LOOP;
      ticket.put('status','cancelled');alliance_pos_store.put_document(b,l,'op_tickets',id_value,ticket);alliance_pos_store.reconcile_session(u,b,l,session_id);alliance_pos_store.audit(u,b,'ORDER_CANCEL',id_value,NULL,ticket.to_clob);alliance_activity.record_event(u,b,l,'service','ORDER_CANCEL','Retiró la comanda y sus consumos de la cuenta',id_value);RETURN ticket;
    END IF;
    IF a='order_submit' THEN
      alliance_security.keys_only(p,'id,tableId,items,notes');id_value:=alliance_security.text_value(p,'id',60,'^[a-zA-Z0-9_-]+$');
      IF alliance_pos_store.document(b,l,'service_requests',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_ORDER','Esta comanda ya existe.');END IF;
      tab:=alliance_pos_store.document(b,l,'restaurant_tables',p.get_string('tableId'));
      IF tab IS NULL OR NOT tab.get_boolean('is_active') THEN alliance_security.fail(400,'INVALID_TABLE','Elige una mesa disponible en esta sucursal.');END IF;
      items:=p.get_array('items');IF items IS NULL OR items.get_size<1 OR items.get_size>50 THEN alliance_security.fail(400,'INVALID_INPUT','Elige de 1 a 50 productos.');END IF;
      IF LENGTH(p.get_string('notes'))>500 THEN alliance_security.fail(400,'INVALID_INPUT','La observacion debe tener hasta 500 caracteres.');END IF;
      FOR i IN 0..items.get_size-1 LOOP
        line:=TREAT(items.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(line,'productId,quantity,notes,unitPrice');product:=alliance_pos_store.document(b,l,'menu_items',line.get_string('productId'));
        IF product IS NULL OR NOT product.get_boolean('is_available') THEN alliance_security.fail(409,'PRODUCT_UNAVAILABLE','Un producto ya no esta disponible. Revisa la comanda.');END IF;
        quantity:=alliance_operations.numeric_value(line,'quantity',0.000001,10000);price:=product.get_number('price');
        IF line.get_number('unitPrice') IS NULL OR line.get_number('unitPrice')<>price THEN alliance_security.fail(409,'PRICE_CHANGED','El precio cambio. Actualiza y revisa la comanda antes de enviarla.');END IF;
        IF LENGTH(line.get_string('notes'))>300 THEN alliance_security.fail(400,'INVALID_INPUT','La observacion del producto debe tener hasta 300 caracteres.');END IF;
        item:=JSON_OBJECT_T();item.put('productId',product.get_string('id'));item.put('name',product.get_string('name'));item.put('quantity',quantity);item.put('unitPrice',price);item.put('notes',line.get_string('notes'));lines.append(item);total:=total+ROUND(quantity*price,2);
      END LOOP;
      order_value:=JSON_OBJECT_T();order_value.put('items',lines);order_value.put('notes',p.get_string('notes'));order_value.put('total',total);
      r:=JSON_OBJECT_T();r.put('id',id_value);r.put('table_id',tab.get_string('id'));r.put('request_type','order');r.put('status','pending');r.put('created_at',stamp);r.put('actor_user_id',u);r.put('actor_name',actor_name);r.put('order',order_value);r.put('message','Comanda enviada por '||actor_name);
      alliance_materials.guard_open(b,l);alliance_pos_store.put_document(b,l,'service_requests',id_value,r);alliance_pos_store.audit(u,b,'ORDER_SUBMIT',id_value,NULL,r.to_clob);alliance_activity.record_event(u,b,l,'service','ORDER_SUBMIT','Envio una comanda a '||tab.get_string('table_name'),id_value);
    ELSIF a IN('order_accept','order_reject') THEN
      alliance_security.keys_only(p,CASE WHEN a='order_accept' THEN 'requestId,expectedSessionId' ELSE 'requestId' END);id_value:=alliance_security.text_value(p,'requestId',80);
      r:=alliance_pos_store.document(b,l,'service_requests',id_value);IF r IS NULL OR r.get_string('request_type')<>'order' THEN alliance_security.fail(404,'ORDER_MISSING','La comanda no esta disponible.');END IF;
      IF r.get_string('status')<>'pending' THEN
        IF a='order_accept' AND r.get_string('status')='acknowledged' THEN IF r.get_string('session_id')<>NVL(p.get_string('expectedSessionId'),id_value) THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La comanda ya se agrego a otra cuenta. Revisa el registro para conservar los consumos correctos.');END IF;RETURN r;END IF;IF a='order_reject' AND r.get_string('status')='resolved' THEN RETURN r;END IF;
        alliance_security.fail(409,'ORDER_CHANGED','Otro usuario ya atendio esta comanda. Actualiza Inicio.');
      END IF;
      tab:=alliance_pos_store.document(b,l,'restaurant_tables',r.get_string('table_id'));
      IF a='order_accept' THEN
        IF tab IS NULL OR NOT tab.get_boolean('is_active') THEN alliance_security.fail(409,'INVALID_TABLE','La mesa ya no esta disponible.');END IF;
        table_id_value:=r.get_string('table_id');session_id:=NULL;FOR x IN(SELECT id FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=table_id_value AND JSON_VALUE(data_json,'$.status')='open') LOOP
          IF session_id IS NOT NULL THEN alliance_security.fail(409,'ACCOUNT_CHANGED','Hay mas de una cuenta abierta para esta mesa. Revisa sus cuentas.');END IF;session_id:=x.id;
        END LOOP;
        IF NVL(session_id,'-')<>NVL(p.get_string('expectedSessionId'),'-') THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta de esta mesa cambio en otro equipo. Actualiza y revisa la comanda.');END IF;
        IF session_id IS NULL THEN session_id:=id_value;session_value:=JSON_OBJECT_T();session_value.put('id',session_id);session_value.put('table_id',r.get_string('table_id'));session_value.put('status','open');session_value.put('opened_at',stamp);session_value.put('created_at',stamp);session_value.put('created_by_user_id',u);session_value.put('assigned_waiter_id',r.get_string('actor_user_id'));item:=JSON_OBJECT_T();item.put('id',r.get_string('actor_user_id'));item.put('full_name',r.get_string('actor_name'));session_value.put('assigned_waiter',item);alliance_pos_store.put_document(b,l,'table_sessions',session_id,session_value);END IF;
        sender:=JSON_OBJECT_T();sender.put('id',r.get_string('actor_user_id'));sender.put('full_name',r.get_string('actor_name'));
        items:=r.get_object('order').get_array('items');
        FOR i IN 0..items.get_size-1 LOOP
          line:=TREAT(items.get(i) AS JSON_OBJECT_T);line_id:='order-'||id_value||'-'||TO_CHAR(i);item:=JSON_OBJECT_T();item.put('id',line_id);item.put('session_id',session_id);item.put('menu_item_id',line.get_string('productId'));item.put('item_name',line.get_string('name'));item.put('quantity',line.get_number('quantity'));item.put('unit_price',line.get_number('unitPrice'));item.put('notes',line.get_string('notes'));item.put('status','pending');item.put('created_at',stamp);item.put('created_by_user_id',r.get_string('actor_user_id'));item.put('created_by_user',sender);item.put('accepted_by_user_id',u);item.put('order_id',id_value);alliance_pos_store.put_document(b,l,'session_items',line_id,item);
          item:=JSON_OBJECT_T();item.put('id',line_id);item.put('name',line.get_string('name'));item.put('quantity',line.get_number('quantity'));item.put('notes',line.get_string('notes'));ticket_lines.append(item);
        END LOOP;
        ticket:=JSON_OBJECT_T();ticket.put('id',id_value);ticket.put('orderId',id_value);ticket.put('sessionId',session_id);ticket.put('table',tab.get_string('table_name'));ticket.put('status','preparing');ticket.put('items',ticket_lines);ticket.put('notes',r.get_object('order').get_string('notes'));ticket.put('sentById',r.get_string('actor_user_id'));ticket.put('sentBy',r.get_string('actor_name'));ticket.put('updatedBy',actor_name);ticket.put('updatedById',u);ticket.put('updatedAt',stamp);alliance_operations.put_row(u,b,l,'tickets',id_value,ticket);
        r.put('session_id',session_id);r.put('ticket_id',id_value);r.put('status','acknowledged');r.put('acknowledged_at',stamp);r.put('acknowledged_by_user_id',u);r.put('accepted_by_name',actor_name);
      ELSE r.put('status','resolved');r.put('resolved_at',stamp);r.put('resolved_by_user_id',u);r.put('resolved_by_name',actor_name);END IF;
      alliance_pos_store.put_document(b,l,'service_requests',id_value,r);alliance_pos_store.audit(u,b,UPPER(a),id_value,NULL,r.to_clob);alliance_activity.record_event(u,b,l,'service',UPPER(a),CASE WHEN a='order_accept' THEN 'Acepto y agrego la comanda a la mesa' ELSE 'Rechazo la comanda sin agregar consumos' END,id_value);
    ELSE alliance_security.fail(404,'NOT_FOUND','Accion no disponible.');END IF;
    touch(b,l);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_customer_schedule AUTHID DEFINER AS
  PROCEDURE update_customer(u VARCHAR2,b VARCHAR2,l VARCHAR2,id_value VARCHAR2,body JSON_OBJECT_T,old JSON_OBJECT_T,o IN OUT JSON_OBJECT_T);
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_customer_schedule AS
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
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_operations_commands AUTHID DEFINER AS
FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_operations_commands AS
FUNCTION run_action(u VARCHAR2,b VARCHAR2,l VARCHAR2,a VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
command_value VARCHAR2(40);job VARCHAR2(80);id_value VARCHAR2(80);entity VARCHAR2(40);permission_value VARCHAR2(80);section_value VARCHAR2(40);summary_value VARCHAR2(240);body JSON_OBJECT_T;o JSON_OBJECT_T;old JSON_OBJECT_T;other JSON_OBJECT_T;row_json JSON_OBJECT_T;ing JSON_OBJECT_T;recipe JSON_OBJECT_T;costing JSON_OBJECT_T;arr JSON_ARRAY_T;lines JSON_ARRAY_T;ingredients JSON_ARRAY_T;out_lines JSON_ARRAY_T:=JSON_ARRAY_T();items JSON_ARRAY_T;at_value VARCHAR2(30):=alliance_activity.occurred_at;
revision_value NUMBER;n NUMBER;q NUMBER;total_value NUMBER:=0;paid_value NUMBER;usable NUMBER;amount NUMBER;cost_value NUMBER;before_value NUMBER;name_value VARCHAR2(160);label_value VARCHAR2(160);sales_total NUMBER;cost_total NUMBER;sales_count NUMBER;unit_value VARCHAR2(12);method_value VARCHAR2(20);found BOOLEAN;shift_date DATE;
BEGIN
IF a='operations_snapshot' THEN RETURN alliance_operations.snapshot(u,b,l);END IF;
IF a='customer_history' THEN RETURN alliance_operations.customer_history(u,b,l,p);END IF;
IF a='operations_device' THEN RETURN alliance_operations.device_status(u,b,l,p);END IF;
alliance_security.keys_only(p,'id,command,payload');job:=alliance_security.text_value(p,'id',80,'^[a-zA-Z0-9_-]+$');command_value:=alliance_security.text_value(p,'command',40);body:=p.get_object('payload');IF body IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Operacion incompleta.');END IF;
IF command_value LIKE 'materials_%' THEN RETURN alliance_materials.run_action(u,b,l,command_value,body,job);END IF;
section_value:=CASE WHEN command_value LIKE 'cash_%' THEN 'cash' WHEN command_value LIKE 'ticket_%' THEN 'kitchen' WHEN command_value LIKE 'customer_%' OR command_value LIKE 'debt_%' THEN 'customers' ELSE 'supplies' END;
permission_value:=CASE section_value WHEN 'cash' THEN 'cash.write' WHEN 'kitchen' THEN CASE WHEN command_value='ticket_send' OR body.get_string('status')='delivered' THEN 'service.write' ELSE 'kitchen.write' END WHEN 'customers' THEN CASE WHEN command_value='debt_pay' THEN 'sales.write' ELSE 'customers.write' END ELSE CASE WHEN command_value='purchase_pay' THEN 'cash.write' ELSE 'supplies.write' END END;
alliance_security.require_location(u,b,l,permission_value);alliance_pos_store.lock_scope(b,l);alliance_security.require_location(u,b,l,permission_value);
IF command_value='policy_save' THEN
  IF NOT alliance_security.location_owner(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe decide cómo registrar ventas con existencias por revisar.');END IF;alliance_security.keys_only(body,'allowNegative');n:=alliance_security.flag(body,'allowNegative');IF n=0 THEN SELECT COUNT(*) INTO q FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND quantity<0;SELECT q+COUNT(*) INTO q FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND stock<0;IF q>0 THEN alliance_security.fail(409,'NEGATIVE_STOCK','Reconcilia los saldos negativos antes de desactivar esta opción.');END IF;END IF;
  o:=alliance_operations.get_row(b,l,'settings','primary');IF o IS NULL THEN o:=JSON_OBJECT_T('{"cashRequired":false}');END IF;o.put('allowNegative',n=1);alliance_operations.put_row(u,b,l,'settings','primary',o);UPDATE alliance_raw_stock SET allow_negative=n WHERE business_id=b AND location_id=l;UPDATE alliance_pos_stock SET allow_negative=n WHERE business_id=b AND location_id=l;summary_value:='Configuró el registro de existencias por revisar';
ELSIF command_value='cash_count_review' THEN
  alliance_security.keys_only(body,'sessionId,actual,notes');id_value:=alliance_security.text_value(body,'sessionId',80);other:=alliance_operations.checked(b,l,'cashSessions',id_value);IF other.get_string('status')<>'closed' THEN alliance_security.fail(409,'REGISTER_CHANGED','Actualiza la caja antes de revisar el conteo.');END IF;o:=JSON_OBJECT_T(body.to_clob);amount:=alliance_operations.numeric_value(body,'actual');o.put('difference',ROUND(amount-other.get_number('actual'),2));o.put('expected',other.get_number('expected'));alliance_operations.put_row(u,b,l,'cashReviews',job,o);summary_value:='Registró un conteo de revisión; conservó el cierre original';
ELSIF command_value IN('supplier_save','customer_save','ingredient_save') THEN
  id_value:=alliance_security.text_value(body,'id',80,'^[a-zA-Z0-9_-]+$');revision_value:=alliance_operations.numeric_value(body,'revision');
  IF command_value='ingredient_save' THEN
    alliance_security.keys_only(body,'id,revision,name,unit,minStock');name_value:=alliance_security.text_value(body,'name',160);unit_value:=alliance_security.text_value(body,'unit',12);q:=alliance_operations.convert_quantity(1,unit_value,unit_value);q:=alliance_operations.numeric_value(body,'minStock');
    SELECT COUNT(*) INTO n FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=id_value;
    IF n=0 THEN IF revision_value<>0 THEN alliance_security.fail(409,'VERSION_CONFLICT','El insumo cambio.');END IF;INSERT INTO alliance_raw_stock(business_id,location_id,id,name,unit_id,min_stock)VALUES(b,l,id_value,name_value,unit_value,q);
    ELSE old:=alliance_operations.raw_item(b,l,id_value);IF old.get_number('revision')<>revision_value OR old.get_string('unit')<>unit_value THEN alliance_security.fail(409,'VERSION_CONFLICT','El insumo cambio. Conserva su unidad base y actualiza.');END IF;UPDATE alliance_raw_stock SET name=name_value,min_stock=q,version=version+1 WHERE business_id=b AND location_id=l AND id=id_value;END IF;o:=alliance_operations.raw_item(b,l,id_value);entity:='ingredients';
  ELSE
    entity:=CASE command_value WHEN 'supplier_save' THEN 'suppliers' ELSE 'customers' END;old:=alliance_operations.get_row(b,l,entity,id_value);IF (old IS NULL AND revision_value<>0) OR (old IS NOT NULL AND old.get_number('revision')<>revision_value) THEN alliance_security.fail(409,'VERSION_CONFLICT','El registro cambio. Actualiza antes de guardar.');END IF;
    IF command_value='supplier_save' THEN alliance_security.keys_only(body,'id,revision,name,phone,document,active');ELSE alliance_security.keys_only(body,'id,revision,name,phone,document,active,contactConsent,allowCredit,creditLimit,paymentFrequency,paymentDate,rescheduleDebts');n:=alliance_security.flag(body,'contactConsent');n:=alliance_security.flag(body,'allowCredit');q:=alliance_operations.numeric_value(body,'creditLimit');IF NOT alliance_security.location_owner(u,b,l) AND ((old IS NULL AND q>0) OR (old IS NOT NULL AND old.get_number('creditLimit')<>q)) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe cambia el credito de clientes.');END IF;END IF;
    name_value:=alliance_security.text_value(body,'name',160);IF LENGTH(body.get_string('phone'))>40 OR LENGTH(body.get_string('document'))>80 THEN alliance_security.fail(400,'INVALID_INPUT','Contacto demasiado largo.');END IF;n:=alliance_security.flag(body,'active');o:=JSON_OBJECT_T(body.to_clob);o.put('revision',revision_value+1);
    IF command_value='customer_save' THEN o.put('allowCredit',TRUE);alliance_customer_schedule.update_customer(u,b,l,id_value,body,old,o);END IF;
    alliance_operations.put_row(u,b,l,entity,id_value,o);
  END IF;
  other:=alliance_operations.get_row(b,l,'settings','primary');IF entity='ingredients' AND other IS NOT NULL AND other.get_boolean('allowNegative') THEN UPDATE alliance_raw_stock SET allow_negative=1 WHERE business_id=b AND location_id=l AND id=id_value;END IF;summary_value:=CASE WHEN revision_value=0 THEN 'Agrego ' ELSE 'Edito ' END||CASE command_value WHEN 'ingredient_save' THEN 'un insumo: ' WHEN 'supplier_save' THEN 'un proveedor: ' ELSE 'un cliente: ' END||name_value;
ELSIF command_value='ingredient_adjust' THEN
  alliance_security.keys_only(body,'ingredientId,quantity,kind,reason,totalCost');id_value:=alliance_security.text_value(body,'ingredientId',80);q:=alliance_operations.numeric_value(body,'quantity',0.00000001);name_value:=alliance_security.text_value(body,'reason',160);IF body.get_string('kind') NOT IN('waste','in','out') THEN alliance_security.fail(400,'INVALID_INPUT','Ajuste no disponible.');END IF;
  IF body.get_string('kind')='in' THEN ing:=alliance_operations.raw_item(b,l,id_value);cost_value:=(GREATEST(ing.get_number('quantity'),0)*ing.get_number('unitCost')+alliance_operations.numeric_value(body,'totalCost'))/(GREATEST(ing.get_number('quantity'),0)+q);IF cost_value>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','El valor por unidad es demasiado alto.');END IF;UPDATE alliance_raw_stock SET unit_cost=cost_value WHERE business_id=b AND location_id=l AND id=id_value;END IF;alliance_operations.raw_move(u,b,l,job,id_value,CASE WHEN body.get_string('kind')='in' THEN q ELSE -q END,body.get_string('kind'),SUBSTR(name_value,1,80));summary_value:='Registro un ajuste de insumos: '||name_value;
ELSIF command_value='purchase_record' THEN
  alliance_security.keys_only(body,'id,name,quantity,total');id_value:=alliance_security.text_value(body,'id',80);name_value:=alliance_security.text_value(body,'name',160);q:=alliance_operations.numeric_value(body,'quantity',0.000001,1000000000000);total_value:=ROUND(alliance_operations.numeric_value(body,'total',0,1000000000000),2);
  IF alliance_operations.get_row(b,l,'purchases',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_OPERATION','Esta compra ya existe.');END IF;
  o:=JSON_OBJECT_T();o.put('kind','simple');o.put('name',name_value);o.put('quantity',q);o.put('total',total_value);o.put('unitPrice',total_value/q);alliance_operations.put_row(u,b,l,'purchases',id_value,o);summary_value:='Registro una compra: '||name_value;
ELSIF command_value='purchase_add' THEN
  alliance_security.keys_only(body,'id,supplierId,reference,dueDate,lines,paid,method');id_value:=alliance_security.text_value(body,'id',80);other:=alliance_operations.checked(b,l,'suppliers',body.get_string('supplierId'));IF NOT other.get_boolean('active') THEN alliance_security.fail(400,'INVALID_INPUT','Proveedor deshabilitado.');END IF;IF alliance_operations.get_row(b,l,'purchases',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_OPERATION','Esta compra ya existe.');END IF;
  lines:=body.get_array('lines');IF lines IS NULL OR lines.get_size<1 OR lines.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Agrega los insumos de la compra.');END IF;
  FOR i IN 0..lines.get_size-1 LOOP row_json:=TREAT(lines.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(row_json,'ingredientId,productId,quantity,unit,total,yieldPercent');IF row_json.get_string('productId') IS NOT NULL THEN
      alliance_security.require_location(u,b,l,'inventory.write');name_value:=row_json.get_string('productId');other:=alliance_pos_store.document(b,l,'menu_items',name_value);IF other IS NULL OR alliance_operations.get_row(b,l,'recipes',name_value) IS NOT NULL OR row_json.get_string('ingredientId') IS NOT NULL THEN alliance_security.fail(400,'INVALID_INPUT','Compra los ingredientes de un producto preparado o elige un producto disponible.');END IF;
      BEGIN SELECT stock,cost_minor,unit_name INTO before_value,cost_value,label_value FROM alliance_pos_stock WHERE business_id=b AND location_id=l AND product_id=name_value;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Registra el inventario del producto antes de comprarlo.');END;
      SELECT COUNT(*) INTO n FROM units_of_measure WHERE id=label_value;unit_value:=CASE WHEN n=0 THEN 'u' ELSE label_value END;q:=alliance_operations.numeric_value(row_json,'quantity',0.000001);amount:=ROUND(alliance_operations.numeric_value(row_json,'total'),2);usable:=alliance_operations.convert_quantity(q,row_json.get_string('unit'),unit_value)*alliance_operations.numeric_value(row_json,'yieldPercent',0.000001,100)/100;cost_value:=ROUND((GREATEST(before_value,0)*cost_value+amount*100)/(GREATEST(before_value,0)+usable));UPDATE alliance_pos_stock SET cost_minor=cost_value WHERE business_id=b AND location_id=l AND product_id=name_value;alliance_pos_store.movement(u,b,l,job||':'||TO_CHAR(i),name_value,usable,'ENTRADA_COMPRA',id_value,NULL);row_json.put('name',other.get_string('name'));row_json.put('baseUnit',unit_value);row_json.put('usable',usable);row_json.put('unitPrice',amount/q);out_lines.append(row_json);total_value:=total_value+amount;
    ELSE ing:=alliance_operations.raw_item(b,l,row_json.get_string('ingredientId'));q:=alliance_operations.numeric_value(row_json,'quantity',0.000001);amount:=ROUND(alliance_operations.numeric_value(row_json,'total'),2);usable:=alliance_operations.convert_quantity(q,row_json.get_string('unit'),ing.get_string('unit'))*alliance_operations.numeric_value(row_json,'yieldPercent',0.000001,100)/100;
    IF usable<0.00000001 THEN alliance_security.fail(400,'INVALID_INPUT','La cantidad aprovechable es demasiado pequeña.');END IF;cost_value:=(ing.get_number('quantity')*ing.get_number('unitCost')+amount)/(GREATEST(ing.get_number('quantity'),0)+usable);IF cost_value>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','El valor por unidad es demasiado alto.');END IF;name_value:=ing.get_string('id');UPDATE alliance_raw_stock SET unit_cost=cost_value WHERE business_id=b AND location_id=l AND id=name_value;alliance_operations.raw_move(u,b,l,job||':'||TO_CHAR(i),name_value,usable,'purchase',id_value);
    row_json.put('name',ing.get_string('name'));row_json.put('baseUnit',ing.get_string('unit'));row_json.put('usable',usable);row_json.put('unitPrice',amount/q);out_lines.append(row_json);total_value:=total_value+amount;END IF;
  END LOOP;other:=alliance_operations.checked(b,l,'suppliers',body.get_string('supplierId'));paid_value:=ROUND(alliance_operations.numeric_value(body,'paid',0,total_value),2);method_value:=body.get_string('method');IF method_value NOT IN('cash','transfer','card','other') OR method_value IS NULL THEN alliance_security.fail(400,'INVALID_PAYMENT','Medio de pago invalido.');END IF;
  o:=JSON_OBJECT_T();o.put('supplierId',other.get_string('id'));o.put('supplierName',other.get_string('name'));o.put('reference',alliance_security.text_value(body,'reference',100));o.put('dueDate',body.get_string('dueDate'));o.put('lines',out_lines);o.put('total',ROUND(total_value,2));o.put('paid',paid_value);o.put('method',method_value);alliance_operations.cash_entry(u,b,l,job,-paid_value,method_value,id_value);alliance_operations.put_row(u,b,l,'purchases',id_value,o);summary_value:='Registro una compra a '||other.get_string('name');
ELSIF command_value IN('purchase_pay','debt_pay') THEN
  alliance_security.keys_only(body,'recordId,amount,method,reference');entity:=CASE command_value WHEN 'purchase_pay' THEN 'purchases' ELSE 'debts' END;id_value:=alliance_security.text_value(body,'recordId',80);old:=alliance_operations.checked(b,l,entity,id_value);IF old.get_string('kind')='simple' THEN alliance_security.fail(400,'INVALID_INPUT','Esta compra es un registro de costo por unidad y no utiliza abonos de proveedor.');END IF;IF old.get_boolean('voided') THEN alliance_security.fail(409,'VOIDED','El saldo fue anulado.');END IF;amount:=ROUND(alliance_operations.numeric_value(body,'amount',0.01,ROUND(old.get_number('total')-old.get_number('paid'),2)),2);method_value:=body.get_string('method');IF method_value NOT IN('cash','transfer','card','other') OR method_value IS NULL THEN alliance_security.fail(400,'INVALID_PAYMENT','Medio de pago invalido.');END IF;
  o:=JSON_OBJECT_T(old.to_clob);o.put('paid',ROUND(old.get_number('paid')+amount,2));alliance_operations.put_row(u,b,l,entity,id_value,o);o:=JSON_OBJECT_T(body.to_clob);o.put('type',command_value);alliance_operations.put_row(u,b,l,'settlements',job,o);alliance_operations.cash_entry(u,b,l,job,CASE command_value WHEN 'purchase_pay' THEN -amount ELSE amount END,method_value,id_value);summary_value:=CASE command_value WHEN 'purchase_pay' THEN 'Registro un pago a proveedor' ELSE 'Registro un abono de cliente' END;
ELSIF command_value='debt_add' THEN
  alliance_security.keys_only(body,'id,customerId,total,dueDate,reference');IF NOT alliance_security.location_owner(u,b,l) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe registra saldos anteriores.');END IF;id_value:=alliance_security.text_value(body,'id',80);other:=alliance_operations.checked(b,l,'customers',body.get_string('customerId'));IF NOT other.get_boolean('active') THEN alliance_security.fail(400,'CREDIT_DISABLED','Cliente sin credito habilitado.');END IF;amount:=alliance_operations.numeric_value(body,'total',0.01);name_value:=other.get_string('id');SELECT NVL(SUM(JSON_VALUE(data_json,'$.total' RETURNING NUMBER)-JSON_VALUE(data_json,'$.paid' RETURNING NUMBER)),0) INTO q FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_debts' AND JSON_VALUE(data_json,'$.customerId')=name_value AND NVL(JSON_VALUE(data_json,'$.voided'),'false')<>'true';IF other.get_number('creditLimit')>0 AND q+amount>other.get_number('creditLimit') THEN alliance_security.fail(409,'CREDIT_LIMIT','El saldo supera el limite autorizado.');END IF;IF alliance_operations.get_row(b,l,'debts',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_OPERATION','El saldo ya existe.');END IF;
  o:=JSON_OBJECT_T(body.to_clob);o.put('total',ROUND(amount,2));o.put('paid',0);o.put('customerName',other.get_string('name'));o.put('source','opening');name_value:=alliance_security.text_value(body,'reference',160);name_value:=alliance_security.text_value(body,'dueDate',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');alliance_operations.put_row(u,b,l,'debts',id_value,o);summary_value:='Registro un saldo anterior del cliente';
ELSIF command_value='cash_shift_update' THEN
  alliance_security.keys_only(body,'sessionId,revision,date,startTime,endTime,opening,action');id_value:=alliance_security.text_value(body,'sessionId',80);old:=alliance_operations.checked(b,l,'cashSessions',id_value);
  IF old.get_string('status')<>'open' OR NVL(old.get_number('revision'),1)<>alliance_operations.numeric_value(body,'revision') THEN alliance_security.fail(409,'VERSION_CONFLICT','El turno cambio. Actualiza antes de guardar.');END IF;
  method_value:=alliance_security.text_value(body,'action',20);IF method_value NOT IN('replace','add','schedule') THEN alliance_security.fail(400,'INVALID_INPUT','Operacion de turno no disponible.');END IF;
  name_value:=alliance_security.text_value(body,'date',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');BEGIN shift_date:=TO_DATE(name_value,'FXYYYY-MM-DD');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del turno.');END;
  IF NOT REGEXP_LIKE(NVL(body.get_string('startTime'),'-'),'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$') OR NOT REGEXP_LIKE(NVL(body.get_string('endTime'),'-'),'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$') OR body.get_string('startTime')=body.get_string('endTime') THEN alliance_security.fail(400,'INVALID_INPUT','Revisa las horas del turno.');END IF;
  before_value:=old.get_number('opening');amount:=alliance_operations.numeric_value(body,'opening');amount:=CASE method_value WHEN 'add' THEN before_value+amount WHEN 'replace' THEN amount ELSE before_value END;
  IF alliance_operations.cash_expected(b,l,old)-before_value+amount<0 THEN alliance_security.fail(409,'CASH_INSUFFICIENT','La base dejaria el efectivo esperado en negativo.');END IF;
  o:=JSON_OBJECT_T(old.to_clob);IF NOT o.has('openedBy') THEN o.put('openedBy',old.get_string('actorName'));o.put('openedById',old.get_string('actorId'));o.put('openedAt',NVL(old.get_string('occurredAt'),old.get_string('at')));END IF;IF NOT o.has('initialOpening') THEN o.put('initialOpening',before_value);END IF;o.put('opening',ROUND(amount,2));o.put('date',name_value);o.put('startTime',body.get_string('startTime'));o.put('endTime',body.get_string('endTime'));o.put('revision',NVL(old.get_number('revision'),1)+1);
  IF o.has('baseChanges') THEN arr:=o.get_array('baseChanges');ELSE arr:=JSON_ARRAY_T();END IF;row_json:=JSON_OBJECT_T();row_json.put('before',before_value);row_json.put('after',amount);row_json.put('action',method_value);row_json.put('at',at_value);row_json.put('actorId',u);SELECT full_name INTO label_value FROM users WHERE business_id=b AND id=u;row_json.put('actorName',label_value);arr.append(row_json);o.put('baseChanges',arr);alliance_operations.put_row(u,b,l,'cashSessions',id_value,o);summary_value:='Actualizo el horario o saldo base del turno';
ELSIF command_value='cash_open' THEN
  alliance_security.keys_only(body,'id,opening,name,startTime,endTime,date');
  IF body.has('date') THEN name_value:=alliance_security.text_value(body,'date',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');BEGIN shift_date:=TO_DATE(name_value,'FXYYYY-MM-DD');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha del turno.');END;END IF;
  IF (body.has('startTime') OR body.has('endTime')) AND (NOT REGEXP_LIKE(NVL(body.get_string('startTime'),'-'),'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$') OR NOT REGEXP_LIKE(NVL(body.get_string('endTime'),'-'),'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$')) THEN alliance_security.fail(400,'INVALID_INPUT','Revisa las horas del turno.');END IF;
  id_value:=alliance_security.text_value(body,'id',80);IF alliance_operations.open_cash(b,l) IS NOT NULL OR alliance_operations.get_row(b,l,'cashSessions',id_value) IS NOT NULL THEN alliance_security.fail(409,'REGISTER_ALREADY_OPEN','La caja ya esta abierta o este turno ya existe.');END IF;o:=JSON_OBJECT_T(body.to_clob);amount:=alliance_operations.numeric_value(body,'opening');name_value:=alliance_security.text_value(body,'name',80);o.put('opening',ROUND(amount,2));o.put('status','open');alliance_operations.put_row(u,b,l,'cashSessions',id_value,o);o:=alliance_operations.get_row(b,l,'settings','primary');IF o IS NULL THEN o:=JSON_OBJECT_T();END IF;o.put('cashRequired',TRUE);alliance_operations.put_row(u,b,l,'settings','primary',o);summary_value:='Abrio la caja: '||name_value;
ELSIF command_value='cash_move' THEN
  alliance_security.keys_only(body,'sessionId,amount,kind,reason');id_value:=alliance_security.text_value(body,'sessionId',80);other:=alliance_operations.checked(b,l,'cashSessions',id_value);IF other.get_string('status')<>'open' THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','La caja ya esta cerrada.');END IF;amount:=ROUND(alliance_operations.numeric_value(body,'amount',0.01),2);IF body.get_string('kind') NOT IN('in','out') THEN alliance_security.fail(400,'INVALID_INPUT','Movimiento invalido.');END IF;o:=JSON_OBJECT_T();o.put('sessionId',id_value);IF body.get_string('kind')='out' AND alliance_operations.cash_expected(b,l,other)<amount THEN alliance_security.fail(409,'CASH_INSUFFICIENT','La caja no tiene ese efectivo disponible.');END IF;o.put('amount',CASE WHEN body.get_string('kind')='out' THEN -amount ELSE amount END);o.put('kind',body.get_string('kind'));o.put('reference',alliance_security.text_value(body,'reason',160));alliance_operations.put_row(u,b,l,'cashMovements',job,o);summary_value:='Registro una entrada o retiro de caja';
ELSIF command_value='cash_close' THEN
  alliance_security.keys_only(body,'sessionId,expected,actual,notes');id_value:=alliance_security.text_value(body,'sessionId',80);old:=alliance_operations.checked(b,l,'cashSessions',id_value);IF old.get_string('status')<>'open' THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','La caja ya esta cerrada.');END IF;amount:=alliance_operations.cash_expected(b,l,old);IF ROUND(alliance_operations.numeric_value(body,'expected',-1e12),2)<>amount THEN alliance_security.fail(409,'CASH_CHANGED','La caja cambio mientras contabas. Revisa el nuevo esperado.');END IF;paid_value:=ROUND(alliance_operations.numeric_value(body,'actual'),2);o:=JSON_OBJECT_T(old.to_clob);SELECT NVL(SUM(total_minor),0),NVL(SUM(cost_minor),0),COUNT(*) INTO sales_total,cost_total,sales_count FROM alliance_pos_sales WHERE business_id=b AND location_id=l AND voided=0 AND JSON_VALUE(invoice_json,'$.cashSessionId')=id_value;o.put('salesTotal',sales_total/100);o.put('costTotal',cost_total/100);o.put('salesCount',sales_count);o.put('expected',amount);o.put('actual',paid_value);o.put('difference',paid_value-amount);o.put('status','closed');o.put('closedAt',at_value);SELECT full_name INTO name_value FROM users WHERE business_id=b AND id=u;o.put('closedBy',name_value);IF LENGTH(body.get_string('notes'))>500 THEN alliance_security.fail(400,'INVALID_INPUT','Observacion demasiado larga.');END IF;o.put('notes',body.get_string('notes'));alliance_operations.put_row(u,b,l,'cashSessions',id_value,o);summary_value:='Cerro y concilio la caja';
ELSIF command_value='recipe_link' THEN
  old:=alliance_operations.get_row(b,l,'recipes',body.get_string('productId'));IF old IS NOT NULL AND old.get_boolean('managed') THEN alliance_security.fail(409,'MANAGED_RECIPE','Actualiza esta receta desde la macro de insumos.');END IF;
  alliance_security.keys_only(body,'productId,recipeId,revision');id_value:=alliance_security.text_value(body,'productId',80);other:=alliance_pos_store.document(b,l,'menu_items',id_value);IF other IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto de otra sucursal.');END IF;costing:=alliance_pos_store.document(b,l,'costing','primary');IF costing IS NULL OR costing.get_number('revision')<>alliance_operations.numeric_value(body,'revision') THEN alliance_security.fail(409,'VERSION_CONFLICT','Actualiza el costeo antes de vincular la receta.');END IF;costing:=costing.get_object('model');arr:=costing.get_array('recipes');ingredients:=costing.get_array('ingredients');recipe:=NULL;
  FOR i IN 0..arr.get_size-1 LOOP row_json:=TREAT(arr.get(i) AS JSON_OBJECT_T);IF row_json.get_string('id')=body.get_string('recipeId') THEN recipe:=row_json;END IF;END LOOP;IF recipe IS NULL OR recipe.get_array('lines').get_size=0 THEN alliance_security.fail(400,'INVALID_RECIPE','La receta necesita ingredientes.');END IF;lines:=recipe.get_array('lines');
  FOR i IN 0..lines.get_size-1 LOOP row_json:=TREAT(lines.get(i) AS JSON_OBJECT_T);FOR j IN 0..ingredients.get_size-1 LOOP ing:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);IF ing.get_string('id')=row_json.get_string('ingredientId') THEN EXIT;END IF;END LOOP;unit_value:=CASE WHEN ing.get_string('unit') IN('g','kg') THEN 'g' WHEN ing.get_string('unit') IN('ml','l') THEN 'ml' ELSE 'u' END;name_value:=ing.get_string('id');SELECT COUNT(*) INTO n FROM alliance_raw_stock WHERE business_id=b AND location_id=l AND id=name_value;IF n=0 THEN label_value:=ing.get_string('name');INSERT INTO alliance_raw_stock(business_id,location_id,id,name,unit_id)VALUES(b,l,name_value,label_value,unit_value);END IF;
    q:=alliance_operations.convert_quantity(row_json.get_number('quantity')/alliance_yield.factor(row_json),row_json.get_string('unit'),unit_value)/recipe.get_number('output');o:=JSON_OBJECT_T();o.put('ingredientId',name_value);o.put('name',ing.get_string('name'));o.put('quantity',q);o.put('unit',unit_value);out_lines.append(o);
  END LOOP;o:=JSON_OBJECT_T();other:=alliance_operations.get_row(b,l,'settings','primary');IF other IS NOT NULL AND other.get_boolean('allowNegative') THEN UPDATE alliance_raw_stock SET allow_negative=1 WHERE business_id=b AND location_id=l;END IF;other:=alliance_pos_store.document(b,l,'menu_items',id_value);o.put('productId',id_value);o.put('name',other.get_string('name'));o.put('recipeId',body.get_string('recipeId'));o.put('lines',out_lines);alliance_operations.put_row(u,b,l,'recipes',id_value,o);summary_value:='Vinculo una receta al producto '||other.get_string('name');
ELSIF command_value='ticket_send' THEN
  alliance_security.keys_only(body,'id,sessionId,itemIds,notes,lineNotes');id_value:=alliance_security.text_value(body,'id',80);other:=alliance_pos_store.document(b,l,'table_sessions',body.get_string('sessionId'));IF other IS NULL OR other.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;IF alliance_operations.get_row(b,l,'tickets',id_value) IS NOT NULL THEN alliance_security.fail(409,'DUPLICATE_OPERATION','La comanda ya existe.');END IF;
  items:=body.get_array('itemIds');IF items IS NULL OR items.get_size<1 OR items.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Elige los productos de la comanda.');END IF;o:=JSON_OBJECT_T();o.put('sessionId',other.get_string('id'));row_json:=alliance_pos_store.document(b,l,'restaurant_tables',other.get_string('table_id'));o.put('table',CASE WHEN row_json IS NULL THEN 'Venta individual' ELSE row_json.get_string('table_name') END);o.put('status','queued');IF LENGTH(body.get_string('notes'))>500 THEN alliance_security.fail(400,'INVALID_INPUT','Observacion demasiado larga.');END IF;o.put('notes',body.get_string('notes'));
  FOR i IN 0..items.get_size-1 LOOP name_value:=items.get_string(i);row_json:=alliance_pos_store.document(b,l,'session_items',name_value);IF row_json IS NULL OR row_json.get_string('session_id')<>other.get_string('id') OR row_json.get_string('status')='cancelled' THEN alliance_security.fail(403,'FORBIDDEN','Producto de otra cuenta o cancelado.');END IF;
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_tickets' AND NVL(JSON_VALUE(data_json,'$.status'),'queued')<>'cancelled') LOOP lines:=JSON_OBJECT_T(x.data_json).get_array('items');FOR j IN 0..lines.get_size-1 LOOP ing:=TREAT(lines.get(j) AS JSON_OBJECT_T);IF ing.get_string('id')=name_value THEN alliance_security.fail(409,'ALREADY_SENT','Este producto ya fue enviado a cocina.');END IF;END LOOP;END LOOP;
    ing:=JSON_OBJECT_T();ing.put('id',name_value);ing.put('name',row_json.get_string('item_name'));ing.put('quantity',row_json.get_number('quantity'));ing.put('notes',row_json.get_string('notes'));IF body.get_object('lineNotes') IS NOT NULL AND body.get_object('lineNotes').has(name_value) THEN IF LENGTH(body.get_object('lineNotes').get_string(name_value))>300 THEN alliance_security.fail(400,'INVALID_INPUT','Observacion demasiado larga.');END IF;ing.put('notes',body.get_object('lineNotes').get_string(name_value));END IF;out_lines.append(ing);
  END LOOP;o.put('items',out_lines);o.put('sentById',u);SELECT full_name INTO name_value FROM users WHERE business_id=b AND id=u;o.put('sentBy',name_value);alliance_operations.put_row(u,b,l,'tickets',id_value,o);summary_value:='Envio una comanda a cocina';
ELSIF command_value='ticket_status' THEN
  alliance_security.keys_only(body,'ticketId,status');id_value:=alliance_security.text_value(body,'ticketId',80);old:=alliance_operations.checked(b,l,'tickets',id_value);name_value:=body.get_string('status');IF NOT((old.get_string('status')='queued' AND name_value IN('preparing','cancelled')) OR (old.get_string('status')='preparing' AND name_value IN('ready','cancelled')) OR (old.get_string('status')='ready' AND name_value IN('delivered','cancelled'))) THEN alliance_security.fail(409,'TICKET_CHANGED','La comanda cambio. Actualiza la cocina.');END IF;
  o:=JSON_OBJECT_T(old.to_clob);o.put('status',name_value);o.put('updatedAt',at_value);SELECT full_name INTO label_value FROM users WHERE business_id=b AND id=u;o.put('updatedBy',label_value);o.put('updatedById',u);alliance_operations.put_row(u,b,l,'tickets',id_value,o);summary_value:='Actualizo una comanda: '||name_value;
ELSE alliance_security.fail(400,'INVALID_INPUT','Operacion no disponible.');END IF;
alliance_materials.guard_open(b,l);
IF command_value IN('ticket_send','ticket_status') THEN alliance_orders.touch(b,l);END IF;
alliance_pos_store.audit(u,b,'OPERATIONS_'||UPPER(command_value),l,CASE WHEN old IS NULL THEN NULL ELSE old.to_clob END,body.to_clob);alliance_activity.record_event(u,b,l,section_value,command_value,summary_value,NVL(id_value,job));o:=JSON_OBJECT_T();o.put('ok',TRUE);o.put('operationId',job);o.put('command',command_value);o.put('entityId',NVL(id_value,job));RETURN o;
END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_operations_sales AUTHID DEFINER AS
  FUNCTION recipe_for(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION recipe_cost(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN NUMBER;
  PROCEDURE guard_recipes(b VARCHAR2,l VARCHAR2,expected JSON_OBJECT_T);
  PROCEDURE after_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice IN OUT JSON_OBJECT_T);
  PROCEDURE reverse_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T);
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_operations_sales AS
  FUNCTION recipe_for(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN JSON_OBJECT_T IS BEGIN RETURN alliance_operations.get_row(b,l,'recipes',product);END;
  PROCEDURE guard_recipes(b VARCHAR2,l VARCHAR2,expected JSON_OBJECT_T) IS fields JSON_KEY_LIST;current JSON_OBJECT_T;previous_recipe JSON_OBJECT_T;old_lines JSON_ARRAY_T;new_lines JSON_ARRAY_T;a JSON_OBJECT_T;c JSON_OBJECT_T;BEGIN
    IF expected IS NULL THEN RETURN;END IF;fields:=expected.get_keys;IF fields.COUNT>500 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiados productos.');END IF;
    FOR i IN 1..fields.COUNT LOOP current:=recipe_for(b,l,fields(i));
      IF expected.get(fields(i)).is_null THEN IF current IS NOT NULL THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;
      ELSE IF NOT expected.get(fields(i)).is_object THEN alliance_security.fail(400,'INVALID_INPUT','Receta esperada inválida.');END IF;previous_recipe:=expected.get_object(fields(i));old_lines:=previous_recipe.get_array('lines');IF old_lines IS NULL OR previous_recipe.get_string('recipeId') IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Receta esperada incompleta.');END IF;
        IF current IS NULL THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;new_lines:=current.get_array('lines');IF current.get_string('recipeId')<>previous_recipe.get_string('recipeId') OR new_lines.get_size<>old_lines.get_size THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;
        FOR j IN 0..old_lines.get_size-1 LOOP a:=TREAT(old_lines.get(j) AS JSON_OBJECT_T);c:=TREAT(new_lines.get(j) AS JSON_OBJECT_T);IF a.get_string('ingredientId') IS NULL OR a.get_string('unit') IS NULL OR a.get_number('quantity') IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Ingrediente esperado incompleto.');END IF;IF a.get_string('ingredientId')<>c.get_string('ingredientId') OR a.get_string('unit')<>c.get_string('unit') OR ABS(a.get_number('quantity')-c.get_number('quantity'))>0.00000001 THEN alliance_security.fail(409,'RECIPE_CHANGED','La receta cambió en otro equipo. Revisa la venta pendiente antes de confirmar.');END IF;END LOOP;
      END IF;
    END LOOP;
  END;
  FUNCTION recipe_cost(b VARCHAR2,l VARCHAR2,product VARCHAR2) RETURN NUMBER IS recipe JSON_OBJECT_T;lines JSON_ARRAY_T;o JSON_OBJECT_T;ingredient JSON_OBJECT_T;total NUMBER:=0;BEGIN
    recipe:=recipe_for(b,l,product);IF recipe IS NULL THEN RETURN NULL;END IF;lines:=recipe.get_array('lines');
    FOR i IN 0..lines.get_size-1 LOOP o:=TREAT(lines.get(i) AS JSON_OBJECT_T);ingredient:=alliance_operations.raw_item(b,l,o.get_string('ingredientId'));total:=total+alliance_operations.convert_quantity(o.get_number('quantity'),o.get_string('unit'),ingredient.get_string('unit'))*ingredient.get_number('unitCost');END LOOP;RETURN ROUND(total+NVL(recipe.get_number('overheadCost'),0),2);
  END;
  PROCEDURE after_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice IN OUT JSON_OBJECT_T) IS
    lines JSON_ARRAY_T:=invoice.get_array('items');payments JSON_ARRAY_T:=invoice.get_array('payments');line JSON_OBJECT_T;pay JSON_OBJECT_T;recipe JSON_OBJECT_T;parts JSON_ARRAY_T;part JSON_OBJECT_T;ingredient JSON_OBJECT_T;customer JSON_OBJECT_T;debt JSON_OBJECT_T;cash_session JSON_OBJECT_T;settings JSON_OBJECT_T;
    quantity_value NUMBER;credit_value NUMBER:=0;cash_value NUMBER:=0;owed NUMBER;customer_id VARCHAR2(80):=invoice.get_string('customerId');sale_id VARCHAR2(80):=invoice.get_string('id');due_value VARCHAR2(10);date_check DATE;
  BEGIN
    IF customer_id IS NOT NULL THEN customer:=alliance_operations.get_row(b,l,'customers',customer_id);IF customer IS NULL OR NOT customer.get_boolean('active') THEN alliance_security.fail(403,'CUSTOMER_MISSING','Cliente no disponible en esta sucursal.');END IF;invoice.put('customerName',customer.get_string('name'));invoice.put('payerName',customer.get_string('name'));END IF;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')='credit' THEN credit_value:=credit_value+pay.get_number('amount');ELSIF pay.get_string('method')='cash' THEN cash_value:=cash_value+pay.get_number('amount');END IF;END LOOP;
    IF credit_value>0 THEN
      IF customer IS NULL THEN alliance_security.fail(403,'CREDIT_DISABLED','Selecciona un cliente con credito habilitado por el jefe.');END IF;
      SELECT NVL(SUM(JSON_VALUE(data_json,'$.total' RETURNING NUMBER)-JSON_VALUE(data_json,'$.paid' RETURNING NUMBER)),0) INTO owed FROM alliance_pos_documents WHERE business_id=b AND location_id=l AND entity='op_debts' AND JSON_VALUE(data_json,'$.customerId')=customer_id AND NVL(JSON_VALUE(data_json,'$.voided'),'false')<>'true';
      IF customer.get_number('creditLimit')>0 AND owed+credit_value>customer.get_number('creditLimit') THEN alliance_security.fail(409,'CREDIT_LIMIT','La venta supera el limite de credito disponible.');END IF;
      due_value:=alliance_security.text_value(invoice,'creditDueDate',10,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');BEGIN date_check:=TO_DATE(due_value,'FXYYYY-MM-DD');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la fecha de vencimiento.');END;
      debt:=JSON_OBJECT_T();debt.put('customerId',customer_id);debt.put('customerName',customer.get_string('name'));debt.put('total',ROUND(credit_value,2));debt.put('paid',0);debt.put('dueDate',due_value);debt.put('reference',invoice.get_string('number'));debt.put('source','sale');debt.put('saleId',sale_id);alliance_operations.put_row(u,b,l,'debts',sale_id,debt);
    END IF;
    cash_session:=alliance_operations.open_cash(b,l);settings:=alliance_operations.get_row(b,l,'settings','primary');IF cash_session IS NULL AND settings IS NOT NULL AND settings.get_boolean('cashRequired') THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','Abre la caja antes de registrar una venta.');END IF;IF cash_session IS NOT NULL THEN invoice.put('cashSessionId',cash_session.get_string('id'));END IF;
    alliance_operations.cash_entry(u,b,l,alliance_security.new_id,cash_value,'cash',sale_id);
    FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);recipe:=recipe_for(b,l,line.get_string('menu_item_id'));IF recipe IS NOT NULL THEN
      line.put('recipeId',recipe.get_string('recipeId'));parts:=recipe.get_array('lines');line.put('recipeConsumption',parts);lines.put(i,line,TRUE);
      FOR j IN 0..parts.get_size-1 LOOP part:=TREAT(parts.get(j) AS JSON_OBJECT_T);ingredient:=alliance_operations.raw_item(b,l,part.get_string('ingredientId'));quantity_value:=alliance_operations.convert_quantity(part.get_number('quantity'),part.get_string('unit'),ingredient.get_string('unit'))*line.get_number('quantity');
        IF recipe.get_boolean('managed') AND quantity_value>ingredient.get_number('quantity')+0.00000001 THEN alliance_security.fail(409,'MATERIALS_INSUFFICIENT','No alcanza '||ingredient.get_string('name')||'. Abastece la macro de insumos.');END IF;
        alliance_operations.raw_move(u,b,l,alliance_security.new_id,ingredient.get_string('id'),-quantity_value,'sale',sale_id);
      END LOOP;
    END IF;END LOOP;alliance_materials.guard_open(b,l,invoice.get_string('sessionId'));invoice.put('items',lines);
  END;
  PROCEDURE reverse_sale(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T) IS debt JSON_OBJECT_T;payments JSON_ARRAY_T:=invoice.get_array('payments');pay JSON_OBJECT_T;sale_id VARCHAR2(80):=invoice.get_string('id');cash_value NUMBER:=0;BEGIN
    debt:=alliance_operations.get_row(b,l,'debts',sale_id);IF debt IS NOT NULL THEN IF debt.get_number('paid')>0 THEN alliance_security.fail(409,'CREDIT_ALREADY_PAID','La venta tiene abonos. Revisa la cartera antes de anular o corregir.');END IF;debt.put('voided',TRUE);alliance_operations.put_row(u,b,l,'debts',sale_id,debt);END IF;
    FOR x IN(SELECT ingredient_id,SUM(delta) delta FROM alliance_raw_movements WHERE business_id=b AND location_id=l AND reference=sale_id AND kind IN('sale','return') GROUP BY ingredient_id HAVING SUM(delta)<0) LOOP alliance_operations.raw_move(u,b,l,alliance_security.new_id,x.ingredient_id,-x.delta,'return',sale_id);END LOOP;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')='cash' THEN cash_value:=cash_value+pay.get_number('amount');END IF;END LOOP;alliance_operations.cash_entry(u,b,l,alliance_security.new_id,-cash_value,'cash',sale_id);
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_customer_payments AUTHID DEFINER AS
  FUNCTION collect_payment(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_customer_payments AS
  FUNCTION collect_payment(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    id_value VARCHAR2(80);customer_id VARCHAR2(80);customer JSON_OBJECT_T;receipt JSON_OBJECT_T;old JSON_OBJECT_T;debt JSON_OBJECT_T;allocation JSON_OBJECT_T;pay JSON_OBJECT_T;settlement JSON_OBJECT_T;turn JSON_OBJECT_T;settings JSON_OBJECT_T;seen JSON_OBJECT_T:=JSON_OBJECT_T();allocations JSON_ARRAY_T;payments JSON_ARRAY_T;amount NUMBER;total NUMBER:=0;paid NUMBER:=0;stamp_value VARCHAR2(30):=alliance_activity.occurred_at;actor VARCHAR2(160);method_seen JSON_OBJECT_T:=JSON_OBJECT_T();cash_total NUMBER:=0;
  BEGIN
    alliance_security.require_location(u,b,l,'sales.write');alliance_security.require_location(u,b,l,'customers.read');alliance_pos_store.lock_scope(b,l);
    alliance_security.keys_only(p,'id,customerId,allocations,payments,reference,number,createdAt,cashReceived,changeDue');id_value:=alliance_security.text_value(p,'id',80,'^[a-zA-Z0-9_-]+$');customer_id:=alliance_security.text_value(p,'customerId',80);customer:=alliance_operations.checked(b,l,'customers',customer_id);allocations:=p.get_array('allocations');payments:=p.get_array('payments');
    IF allocations IS NULL OR allocations.get_size<1 OR allocations.get_size>300 OR payments IS NULL OR payments.get_size<1 OR payments.get_size>4 THEN alliance_security.fail(400,'INVALID_INPUT','Completa los saldos y medios de pago.');END IF;
    old:=alliance_operations.get_row(b,l,'customerPayments',id_value);IF old IS NOT NULL THEN IF old.get_array('allocations').to_string<>allocations.to_string OR old.get_array('payments').to_string<>payments.to_string OR old.get_string('customerId')<>customer_id THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','El recibo ya tiene otros datos.');END IF;RETURN old;END IF;
    FOR i IN 0..allocations.get_size-1 LOOP
      allocation:=TREAT(allocations.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(allocation,'debtId,amount,expectedPaid');debt:=alliance_operations.checked(b,l,'debts',allocation.get_string('debtId'));
      IF seen.has(debt.get_string('id')) OR NVL(debt.get_string('customerId'),'-')<>customer_id OR debt.get_boolean('voided') THEN alliance_security.fail(409,'DEBT_CHANGED','Saldo no disponible para este cliente.');END IF;seen.put(debt.get_string('id'),TRUE);
      amount:=ROUND(alliance_operations.numeric_value(allocation,'amount',0.01)*100);IF ROUND(alliance_operations.numeric_value(allocation,'expectedPaid')*100)<>ROUND(debt.get_number('paid')*100) OR amount>ROUND((debt.get_number('total')-debt.get_number('paid'))*100) THEN alliance_security.fail(409,'DEBT_CHANGED','El saldo cambió en otro equipo. Actualiza la cartera antes de cobrar.');END IF;total:=total+amount;
    END LOOP;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(pay,'method,amount');IF NVL(pay.get_string('method'),'-') NOT IN('cash','transfer','breb','card') OR method_seen.has(pay.get_string('method')) THEN alliance_security.fail(400,'INVALID_PAYMENT','Elige efectivo, transferencia, Bre-B o tarjeta.');END IF;method_seen.put(pay.get_string('method'),TRUE);paid:=paid+ROUND(alliance_operations.numeric_value(pay,'amount')*100);IF pay.get_string('method')='cash' THEN cash_total:=ROUND(pay.get_number('amount')*100);END IF;END LOOP;
    IF total<>paid THEN alliance_security.fail(400,'INVALID_PAYMENT','Los pagos no coinciden con el saldo a cobrar.');END IF;
    IF p.has('cashReceived') AND NOT p.get('cashReceived').is_null THEN IF ROUND(alliance_operations.numeric_value(p,'cashReceived')*100)<cash_total OR ROUND((p.get_number('cashReceived')-cash_total/100)*100)<>ROUND(NVL(p.get_number('changeDue'),0)*100) THEN alliance_security.fail(400,'INVALID_PAYMENT','Revisa el efectivo recibido y el cambio.');END IF;END IF;
    turn:=alliance_operations.open_cash(b,l);settings:=alliance_operations.get_row(b,l,'settings','primary');IF turn IS NULL AND settings IS NOT NULL AND settings.get_boolean('cashRequired') THEN alliance_security.fail(409,'REGISTER_NOT_OPEN','Abre el turno antes de cobrar.');END IF;
    FOR i IN 0..allocations.get_size-1 LOOP allocation:=TREAT(allocations.get(i) AS JSON_OBJECT_T);debt:=alliance_operations.checked(b,l,'debts',allocation.get_string('debtId'));amount:=ROUND(allocation.get_number('amount'),2);debt.put('paid',ROUND(debt.get_number('paid')+amount,2));alliance_operations.put_row(u,b,l,'debts',debt.get_string('id'),debt);
      settlement:=JSON_OBJECT_T();settlement.put('type','debt_pay');settlement.put('recordId',debt.get_string('id'));settlement.put('amount',amount);settlement.put('method',CASE WHEN payments.get_size>1 THEN 'mixed' ELSE TREAT(payments.get(0) AS JSON_OBJECT_T).get_string('method') END);settlement.put('reference',NVL(p.get_string('reference'),'Pago de cartera'));settlement.put('paymentId',id_value);alliance_operations.put_row(u,b,l,'settlements',id_value||'-'||TO_CHAR(i),settlement);
    END LOOP;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);alliance_operations.cash_entry(u,b,l,id_value||'-cash-'||TO_CHAR(i),pay.get_number('amount'),pay.get_string('method'),id_value);END LOOP;
    receipt:=JSON_OBJECT_T(p.to_clob);receipt.put('recordType','collection');receipt.put('customerName',customer.get_string('name'));receipt.put('total',total/100);receipt.put('createdAt',stamp_value);IF turn IS NOT NULL THEN receipt.put('cashSessionId',turn.get_string('id'));END IF;alliance_operations.put_row(u,b,l,'customerPayments',id_value,receipt);
    alliance_pos_store.audit(u,b,'CUSTOMER_PAYMENT',id_value,NULL,receipt.to_clob);alliance_activity.record_event(u,b,l,'customers','CUSTOMER_PAYMENT','Registró un pago de cartera: '||customer.get_string('name'),id_value);RETURN receipt;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_pos_finance AUTHID DEFINER AS
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_pos_finance AS
  -- One output-product movement, with its immutable ingredient breakdown. Never debit stock here.
  PROCEDURE recipe_entries(u VARCHAR2,b VARCHAR2,l VARCHAR2,invoice JSON_OBJECT_T,reversing BOOLEAN DEFAULT FALSE) IS
    lines JSON_ARRAY_T:=invoice.get_array('items');parts JSON_ARRAY_T;line JSON_OBJECT_T;part JSON_OBJECT_T;ingredient JSON_OBJECT_T;detail JSON_OBJECT_T;entries JSON_OBJECT_T;entry JSON_OBJECT_T;ingredients JSON_ARRAY_T;keys JSON_KEY_LIST;
    event_id VARCHAR2(160);ingredient_id VARCHAR2(80);quantity_value NUMBER;body CLOB:=lines.to_clob;n NUMBER;reference_value VARCHAR2(160):=SUBSTR(invoice.get_string('number'),1,160);session_value VARCHAR2(80):=invoice.get_string('sessionId');movement_delta NUMBER;movement_kind VARCHAR2(40);
  BEGIN
    FOR x IN(SELECT product_key,SUM(qty) qty,SUM(qty*unit_cost)/SUM(qty) cost FROM JSON_TABLE(body,'$[*]' COLUMNS(product_key VARCHAR2(36) PATH '$.menu_item_id',recipe_key VARCHAR2(80) PATH '$.recipeId',qty NUMBER PATH '$.quantity',unit_cost NUMBER PATH '$.unit_cost')) WHERE product_key IS NOT NULL AND recipe_key IS NOT NULL GROUP BY product_key) LOOP
      event_id:=CASE WHEN reversing THEN alliance_security.new_id ELSE 'SALE-'||invoice.get_string('id')||'-'||x.product_key END;
      SELECT COUNT(*) INTO n FROM alliance_pos_movements WHERE business_id=b AND location_id=l AND id=event_id;IF n>0 THEN CONTINUE;END IF;
      entries:=JSON_OBJECT_T();
      FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);IF line.get_string('menu_item_id')=x.product_key AND line.has('recipeConsumption') THEN
        parts:=line.get_array('recipeConsumption');FOR j IN 0..parts.get_size-1 LOOP part:=TREAT(parts.get(j) AS JSON_OBJECT_T);ingredient_id:=part.get_string('ingredientId');ingredient:=alliance_operations.raw_item(b,l,ingredient_id);
          quantity_value:=alliance_operations.convert_quantity(part.get_number('quantity'),part.get_string('unit'),ingredient.get_string('unit'))*line.get_number('quantity');
          IF entries.has(ingredient_id) THEN entry:=entries.get_object(ingredient_id);quantity_value:=quantity_value+entry.get_number('quantity');ELSE entry:=JSON_OBJECT_T();entry.put('ingredientId',ingredient_id);entry.put('name',ingredient.get_string('name'));entry.put('unit',ingredient.get_string('unit'));END IF;entry.put('quantity',quantity_value);entries.put(ingredient_id,entry);
        END LOOP;END IF;END LOOP;
      ingredients:=JSON_ARRAY_T();keys:=entries.get_keys;FOR i IN 1..keys.COUNT LOOP ingredients.append(entries.get_object(keys(i)));END LOOP;detail:=JSON_OBJECT_T();detail.put('movementId',event_id);detail.put('ingredients',ingredients);
      movement_delta:=CASE WHEN reversing THEN x.qty ELSE -x.qty END;movement_kind:=CASE WHEN reversing THEN 'DEVOLUCION_VENTA_RECETA' ELSE 'SALIDA_VENTA_RECETA' END;
      INSERT INTO alliance_pos_movements(business_id,location_id,id,product_id,actor_user_id,delta,stock_before,stock_after,cost_minor,kind,reference,session_id,allow_negative)VALUES(b,l,event_id,x.product_key,u,movement_delta,0,0,ROUND(NVL(x.cost,0)*100),movement_kind,reference_value,session_value,0);
      alliance_pos_store.put_document(b,l,'op_movementdetail',alliance_security.hash_text(event_id),detail);
    END LOOP;
  END;
  FUNCTION save_sale(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_invoice JSON_OBJECT_T,p_edit BOOLEAN DEFAULT FALSE,p_expected JSON_OBJECT_T DEFAULT NULL) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();invoice JSON_OBJECT_T:=JSON_OBJECT_T(p_invoice.to_clob);lines JSON_ARRAY_T;line JSON_OBJECT_T;totals JSON_OBJECT_T;payments JSON_ARRAY_T;pay JSON_OBJECT_T;session_json JSON_OBJECT_T;old_invoice JSON_OBJECT_T;
    sale_id VARCHAR2(80);session_value VARCHAR2(80);product_value VARCHAR2(36);fingerprint VARCHAR2(64);previous_hash VARCHAR2(64);json_text CLOB;old_text CLOB;n NUMBER;quantity_value NUMBER;price_value NUMBER;cost_value NUMBER;subtotal_value NUMBER:=0;cost_total NUMBER:=0;payment_total NUMBER:=0;total_value NUMBER;discount_value NUMBER;tax_value NUMBER;fee_value NUMBER;tip_value NUMBER;already_adjusted NUMBER;delta_value NUMBER;kind_value VARCHAR2(40);void_value NUMBER;effective_user VARCHAR2(160);stored_line JSON_OBJECT_T;seen_lines JSON_OBJECT_T:=JSON_OBJECT_T();line_id VARCHAR2(80);table_sale BOOLEAN:=FALSE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'sales.write');alliance_pos_store.lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'sales.write');
    sale_id:=alliance_security.text_value(invoice,'id',80);session_value:=alliance_security.text_value(invoice,'sessionId',80);
    SELECT COUNT(*) INTO n FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND (id=sale_id OR session_id=session_value);
    IF n>0 AND NOT p_edit THEN
      SELECT invoice_json INTO old_text FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND (id=sale_id OR session_id=session_value);old_invoice:=JSON_OBJECT_T(old_text);
      IF old_invoice.get_string('id')<>sale_id OR old_invoice.get_array('items').to_string<>invoice.get_array('items').to_string OR old_invoice.get_object('totals').to_string<>invoice.get_object('totals').to_string OR old_invoice.get_array('payments').to_string<>invoice.get_array('payments').to_string THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La cuenta ya se cobro con otros datos.');END IF;
      r.put('duplicate',TRUE);r.put('ok',TRUE);r.put('saleId',sale_id);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
    END IF;
    alliance_operations_sales.guard_recipes(p_business,p_location,p_expected);
    IF p_edit THEN
      IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede corregir una venta.');END IF;
      IF n<>1 THEN alliance_security.fail(404,'NOT_FOUND','Venta no disponible.');END IF;
      SELECT invoice_json,voided INTO old_text,void_value FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND id=sale_id;IF void_value=1 THEN alliance_security.fail(409,'VOIDED','La venta esta anulada.');END IF;
      old_invoice:=JSON_OBJECT_T(old_text);alliance_operations_sales.reverse_sale(p_user,p_business,p_location,old_invoice);lines:=old_invoice.get_array('items');
      FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);product_value:=line.get_string('menu_item_id');IF product_value IS NOT NULL AND line.get_string('recipeId') IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,alliance_security.new_id,product_value,line.get_number('quantity'),'DEVOLUCION_CORRECCION',sale_id,session_value);END IF;END LOOP;recipe_entries(p_user,p_business,p_location,old_invoice,TRUE);
    ELSE
      session_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);
      IF session_json IS NOT NULL THEN
        IF session_json.get_string('status')<>'open' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;table_sale:=TRUE;invoice.put('saleChannel','table');
      ELSIF NVL(invoice.get_string('saleChannel'),'table')<>'walk_in' THEN alliance_security.fail(409,'CLOSED_ACCOUNT','La cuenta no esta abierta.');END IF;
    END IF;
    lines:=invoice.get_array('items');totals:=invoice.get_object('totals');payments:=invoice.get_array('payments');
    IF lines IS NULL OR lines.get_size<1 OR lines.get_size>300 OR payments IS NULL OR payments.get_size<1 OR payments.get_size>10 THEN alliance_security.fail(400,'INVALID_INPUT','Venta incompleta.');END IF;
    IF table_sale THEN
      SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='session_items' AND JSON_VALUE(data_json,'$.session_id')=session_value AND NVL(JSON_VALUE(data_json,'$.status'),'confirmed')<>'cancelled';
      IF n<>lines.get_size THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta cambio. Actualiza sus consumos antes de cobrar.');END IF;
    END IF;
    FOR i IN 0..lines.get_size-1 LOOP
      line:=TREAT(lines.get(i) AS JSON_OBJECT_T);quantity_value:=line.get_number('quantity');price_value:=ROUND(line.get_number('unit_price')*100);
      IF table_sale THEN
        line_id:=line.get_string('id');stored_line:=alliance_pos_store.document(p_business,p_location,'session_items',line_id);
        IF stored_line IS NULL OR seen_lines.has(line_id) THEN alliance_security.fail(409,'ACCOUNT_CHANGED','Consumo inexistente o repetido.');END IF;seen_lines.put(line_id,TRUE);
        IF stored_line.get_string('session_id')<>session_value OR stored_line.get_string('status')='cancelled' OR NVL(stored_line.get_string('menu_item_id'),'manual')<>NVL(line.get_string('menu_item_id'),'manual') OR stored_line.get_number('quantity')<>quantity_value OR ROUND(stored_line.get_number('unit_price')*100)<>price_value THEN alliance_security.fail(409,'ACCOUNT_CHANGED','La cuenta cambio. Actualiza sus consumos antes de cobrar.');END IF;
      END IF;
      IF quantity_value IS NULL OR quantity_value<=0 OR quantity_value>10000 OR price_value IS NULL OR price_value<0 THEN alliance_security.fail(400,'INVALID_INPUT','Producto o cantidad invalida.');END IF;
      product_value:=line.get_string('menu_item_id');cost_value:=0;
      IF product_value IS NOT NULL THEN
        SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='menu_items' AND id=product_value;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Producto de otra sucursal o no disponible.');END IF;
        cost_value:=alliance_operations_sales.recipe_cost(p_business,p_location,product_value);IF cost_value IS NOT NULL THEN cost_value:=ROUND(cost_value*100);ELSE BEGIN SELECT cost_minor INTO cost_value FROM alliance_pos_stock WHERE business_id=p_business AND location_id=p_location AND product_id=product_value;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(409,'STOCK_MISSING','Configura el inventario antes de cobrar.');END;END IF;
      END IF;
      line.put('unit_cost',cost_value/100);line.put('unit_price',price_value/100);lines.put(i,line,TRUE);
      subtotal_value:=subtotal_value+ROUND(quantity_value*price_value);cost_total:=cost_total+ROUND(quantity_value*cost_value);
    END LOOP;
    discount_value:=ROUND(NVL(totals.get_number('discount'),0)*100);tax_value:=ROUND(NVL(totals.get_number('tax'),0)*100);fee_value:=ROUND(NVL(totals.get_number('serviceFee'),0)*100);tip_value:=ROUND(NVL(totals.get_number('tip'),0)*100);
    total_value:=subtotal_value-discount_value+tax_value+fee_value+tip_value;
    IF discount_value<0 OR discount_value>subtotal_value OR tax_value<0 OR fee_value<0 OR tip_value<0 OR total_value<>ROUND(totals.get_number('total')*100) OR subtotal_value<>ROUND(totals.get_number('subtotal')*100) THEN alliance_security.fail(400,'INVALID_TOTAL','El total no coincide con los productos.');END IF;
    FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);price_value:=ROUND(pay.get_number('amount')*100);
      IF price_value IS NULL OR price_value<0 OR pay.get_string('method') NOT IN('cash','transfer','breb','card','other','credit') THEN alliance_security.fail(400,'INVALID_PAYMENT','Pago invalido.');END IF;payment_total:=payment_total+price_value;
    END LOOP;IF payment_total<>total_value THEN alliance_security.fail(400,'INVALID_PAYMENT','Los pagos no coinciden con el total.');END IF;
    -- Aggregate by product so a duplicate line cannot debit the same stock twice.
    json_text:=lines.to_clob;
    FOR x IN(SELECT product_key,SUM(qty) quantity_sum,SUM(qty*unit_cost)/SUM(qty) unit_cost FROM JSON_TABLE(json_text,'$[*]' COLUMNS(product_key VARCHAR2(36) PATH '$.menu_item_id',qty NUMBER PATH '$.quantity',unit_cost NUMBER PATH '$.unit_cost')) WHERE product_key IS NOT NULL GROUP BY product_key) LOOP
      product_value:=x.product_key;quantity_value:=x.quantity_sum;already_adjusted:=0;IF NOT p_edit THEN SELECT NVL(-SUM(delta),0) INTO already_adjusted FROM alliance_pos_movements WHERE business_id=p_business AND location_id=p_location AND product_id=product_value AND session_id=session_value AND kind IN('CONSUMO_MESA','DEVOLUCION_CONSUMO');END IF;
      delta_value:=GREATEST(0,already_adjusted)-quantity_value;kind_value:=CASE WHEN delta_value<=0 THEN 'SALIDA_VENTA' ELSE 'DEVOLUCION_VENTA' END;
      IF delta_value<>0 AND alliance_operations_sales.recipe_for(p_business,p_location,product_value) IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,CASE WHEN p_edit THEN alliance_security.new_id ELSE 'SALE-'||sale_id||'-'||product_value END,product_value,delta_value,kind_value,invoice.get_string('number'),session_value);END IF;
    END LOOP;
    alliance_operations_sales.after_sale(p_user,p_business,p_location,invoice);lines:=invoice.get_array('items');recipe_entries(p_user,p_business,p_location,invoice);
    SELECT full_name INTO effective_user FROM users WHERE business_id=p_business AND id=p_user;invoice.put('soldByUserId',p_user);invoice.put('waiterName',effective_user);invoice.put('items',lines);json_text:=invoice.to_clob;
    IF p_edit THEN UPDATE alliance_pos_sales SET invoice_json=json_text,total_minor=total_value,subtotal_minor=subtotal_value,cost_minor=cost_total WHERE business_id=p_business AND location_id=p_location AND id=sale_id;
    ELSE INSERT INTO alliance_pos_sales(business_id,location_id,id,session_id,actor_user_id,invoice_json,total_minor,subtotal_minor,cost_minor)VALUES(p_business,p_location,sale_id,session_value,p_user,json_text,total_value,subtotal_value,cost_total);END IF;
    session_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);
    IF session_json IS NOT NULL THEN session_json.put('status','closed');session_json.put('closed_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'table_sessions',session_value,session_json);END IF;
    FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='service_requests' AND JSON_VALUE(data_json,'$.session_id')=session_value) LOOP session_json:=JSON_OBJECT_T(x.data_json);session_json.put('status','resolved');alliance_pos_store.put_document(p_business,p_location,'service_requests',x.id,session_json);END LOOP;
    alliance_pos_store.reconcile_session(p_user,p_business,p_location,session_value);
    alliance_pos_store.audit(p_user,p_business,CASE WHEN p_edit THEN 'POS_SALE_EDIT' ELSE 'POS_SALE' END,sale_id,old_text,json_text);
    r.put('duplicate',FALSE);r.put('ok',TRUE);r.put('saleId',sale_id);r.put('archivedSessionId',session_value);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
  END;
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();arr JSON_ARRAY_T:=JSON_ARRAY_T();record_json JSON_OBJECT_T;invoice JSON_OBJECT_T;lines JSON_ARRAY_T;line JSON_OBJECT_T;payments JSON_ARRAY_T;pay JSON_OBJECT_T;line_out JSON_OBJECT_T;totals JSON_OBJECT_T:=JSON_OBJECT_T();invoice_totals JSON_OBJECT_T;
    from_stamp TIMESTAMP WITH TIME ZONE;to_stamp TIMESTAMP WITH TIME ZONE;cursor_stamp TIMESTAMP WITH TIME ZONE;cursor_id VARCHAR2(160);cursor_json JSON_OBJECT_T;next_json JSON_OBJECT_T;has_more BOOLEAN:=FALSE;
    from_value VARCHAR2(10);to_value VARCHAR2(10);date_value VARCHAR2(10);method_value VARCHAR2(20):=NVL(p_payload.get_string('paymentMethod'),'all');query_value VARCHAR2(200):=LOWER(p_payload.get_string('query'));sale_id VARCHAR2(80);sale_type VARCHAR2(20):=NVL(p_payload.get_string('saleType'),'all');json_text CLOB;n NUMBER;value NUMBER;match_value BOOLEAN;cost_total NUMBER;fields JSON_KEY_LIST;user_name VARCHAR2(160);history JSON_OBJECT_T;movement_cutoff TIMESTAMP WITH TIME ZONE;income_cutoff TIMESTAMP WITH TIME ZONE;
  BEGIN
    history:=alliance_pos_store.document(p_business,p_location,'configuration','history');IF history IS NOT NULL THEN
      IF history.has('movements_cutoff') THEN movement_cutoff:=FROM_TZ(TO_TIMESTAMP(history.get_string('movements_cutoff'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
      IF history.has('income_cutoff') THEN income_cutoff:=FROM_TZ(TO_TIMESTAMP(history.get_string('income_cutoff'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
    ELSE history:=JSON_OBJECT_T();END IF;
    IF p_action='clear_income' THEN alliance_pos_store.lock_scope(p_business,p_location);IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede reiniciar el historial.');END IF;history.put('income_cutoff',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'configuration','history',history);alliance_pos_store.audit(p_user,p_business,'POS_SALES_ARCHIVE',p_location,NULL,history.to_clob);r.put('ok',TRUE);r.put('cleared',TRUE);RETURN r;END IF;
    IF p_action IN('record_sale','edit_sale') THEN RETURN save_sale(p_user,p_business,p_location,p_payload.get_object('invoice'),p_action='edit_sale',p_payload.get_object('expected_recipes'));END IF;
    IF p_action='delete_sale' THEN
      alliance_pos_store.lock_scope(p_business,p_location);alliance_security.require_location(p_user,p_business,p_location,'sales.write');IF NOT alliance_security.location_owner(p_user,p_business,p_location) THEN alliance_security.fail(403,'FORBIDDEN','Solo el propietario puede anular ventas.');END IF;
      sale_id:=p_payload.get_string('saleId');BEGIN SELECT invoice_json,voided INTO json_text,n FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND id=sale_id;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Venta no disponible.');END;
      IF n=0 THEN invoice:=JSON_OBJECT_T(json_text);alliance_operations_sales.reverse_sale(p_user,p_business,p_location,invoice);lines:=invoice.get_array('items');FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);IF line.get_string('menu_item_id') IS NOT NULL AND line.get_string('recipeId') IS NULL THEN alliance_pos_store.movement(p_user,p_business,p_location,'VOID-'||sale_id||'-'||TO_CHAR(i),line.get_string('menu_item_id'),line.get_number('quantity'),'DEVOLUCION_VENTA',sale_id,invoice.get_string('sessionId'));END IF;END LOOP;recipe_entries(p_user,p_business,p_location,invoice,TRUE);
        UPDATE alliance_pos_sales SET voided=1 WHERE business_id=p_business AND location_id=p_location AND id=sale_id;alliance_pos_store.audit(p_user,p_business,'POS_SALE_VOID',sale_id,json_text,p_payload.to_clob);
      END IF;r.put('ok',TRUE);r.put('saleId',sale_id);r.put('items',alliance_pos_store.inventory(p_business,p_location));RETURN r;
    END IF;
    IF p_action='get_inventory_movements' THEN
      alliance_security.require_location(p_user,p_business,p_location,'movements.read');
      IF p_payload.has('cursor') AND NOT p_payload.get('cursor').is_null THEN cursor_json:=p_payload.get_object('cursor');cursor_id:=cursor_json.get_string('id');BEGIN cursor_stamp:=FROM_TZ(TO_TIMESTAMP(cursor_json.get_string('at'),'YYYY-MM-DD"T"HH24:MI:SS.FF9"Z"'),'UTC');EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa la página de movimientos.');END;END IF;
      FOR x IN(SELECT m.*,p.name,u.full_name,s.code,d.data_json movement_detail FROM alliance_pos_movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id JOIN users u ON u.id=m.actor_user_id AND u.business_id=m.business_id LEFT JOIN alliance_pos_stock s ON s.business_id=m.business_id AND s.location_id=m.location_id AND s.product_id=m.product_id LEFT JOIN alliance_pos_documents d ON d.business_id=m.business_id AND d.location_id=m.location_id AND d.entity='op_movementdetail' AND d.id=alliance_security.hash_text(m.id) WHERE m.business_id=p_business AND m.location_id=p_location AND (movement_cutoff IS NULL OR m.created_at>movement_cutoff) AND (cursor_stamp IS NULL OR m.created_at<cursor_stamp OR (m.created_at=cursor_stamp AND m.id<cursor_id)) ORDER BY m.created_at DESC,m.id DESC FETCH FIRST 801 ROWS ONLY) LOOP
        IF arr.get_size=800 THEN has_more:=TRUE;EXIT;END IF;next_json:=JSON_OBJECT_T();next_json.put('id',x.id);next_json.put('at',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF9"Z"'));
        record_json:=JSON_OBJECT_T();record_json.put('movementId',x.id);record_json.put('productId',x.product_id);record_json.put('code',x.code);record_json.put('product',x.name);record_json.put('type',x.kind);record_json.put('delta',x.delta);record_json.put('before',x.stock_before);record_json.put('after',x.stock_after);record_json.put('unitCost',x.cost_minor/100);record_json.put('reference',x.reference);record_json.put('sessionId',x.session_id);record_json.put('date',TO_CHAR(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'));record_json.put('user',x.full_name);IF x.kind IN('SALIDA_VENTA_RECETA','DEVOLUCION_VENTA_RECETA') THEN record_json.put('stockBasis','recipe');record_json.put_null('before');record_json.put_null('after');IF x.movement_detail IS NOT NULL THEN invoice:=JSON_OBJECT_T(x.movement_detail);record_json.put('ingredients',invoice.get_array('ingredients'));END IF;END IF;arr.append(record_json);
      END LOOP;r.put('ok',TRUE);r.put('movements',arr);r.put('hasMore',has_more);IF has_more THEN r.put('nextCursor',next_json);ELSE r.put_null('nextCursor');END IF;r.put('revision',alliance_pos_store.report_revision(p_business,p_location));RETURN r;
    END IF;
    IF p_action<>'get_income_report' THEN alliance_security.fail(400,'INVALID_INPUT','Accion no permitida.');END IF;
    alliance_security.require_location(p_user,p_business,p_location,'sales.read');from_value:=NVL(p_payload.get_string('dateFrom'),TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Bogota','YYYY-MM-DD'));to_value:=NVL(p_payload.get_string('dateTo'),from_value);
    IF NOT REGEXP_LIKE(from_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR NOT REGEXP_LIKE(to_value,'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN alliance_security.fail(400,'INVALID_INPUT','Fechas invalidas.');END IF;
    BEGIN
      IF p_payload.get_string('startAt') IS NOT NULL THEN from_stamp:=FROM_TZ(TO_TIMESTAMP(p_payload.get_string('startAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
      IF p_payload.get_string('endAt') IS NOT NULL THEN to_stamp:=FROM_TZ(TO_TIMESTAMP(p_payload.get_string('endAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC');END IF;
    EXCEPTION WHEN OTHERS THEN alliance_security.fail(400,'INVALID_INPUT','Revisa el horario de ventas.');END;
    IF from_stamp IS NOT NULL AND to_stamp IS NOT NULL AND from_stamp>=to_stamp THEN alliance_security.fail(400,'INVALID_INPUT','El cierre debe ser posterior al inicio.');END IF;
    totals:=JSON_OBJECT_T('{"income":0,"sales":0,"subtotal":0,"discount":0,"tax":0,"service":0,"cost":0,"profit":0,"cash":0,"transfer":0,"breb":0,"other":0,"card":0,"credit":0,"received":0}');
    FOR x IN(SELECT * FROM alliance_pos_sales WHERE business_id=p_business AND location_id=p_location AND voided=0 AND (income_cutoff IS NULL OR created_at>income_cutoff) ORDER BY created_at DESC,id) LOOP
      invoice:=JSON_OBJECT_T(x.invoice_json);date_value:=TO_CHAR(FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC') AT TIME ZONE 'America/Bogota','YYYY-MM-DD');
      IF date_value BETWEEN from_value AND to_value AND (from_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>=from_stamp) AND (to_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')<to_stamp) THEN
        payments:=invoice.get_array('payments');match_value:=method_value='all' OR (method_value='mixed' AND payments.get_size>1);
        FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')=method_value THEN match_value:=TRUE;END IF;END LOOP;
        IF sale_type<>'all' AND sale_type<>CASE WHEN invoice.get_string('saleChannel')='walk_in' THEN 'walk_in' ELSE 'table' END THEN match_value:=FALSE;END IF;
        IF query_value IS NOT NULL AND INSTR(LOWER(DBMS_LOB.SUBSTR(x.invoice_json,32000,1)),query_value)=0 THEN match_value:=FALSE;END IF;
        IF match_value THEN
          record_json:=JSON_OBJECT_T();record_json.put('saleId',x.id);record_json.put('invoice',invoice.get_string('number'));record_json.put('sessionId',x.session_id);record_json.put('table',invoice.get_string('table'));record_json.put('date',invoice.get_string('createdAt'));record_json.put('payer',invoice.get_string('payerName'));record_json.put('waiter',invoice.get_string('waiterName'));record_json.put('total',x.total_minor/100);record_json.put('subtotal',x.subtotal_minor/100);record_json.put('cost',x.cost_minor/100);record_json.put('profit',x.subtotal_minor/100-NVL(invoice.get_object('totals').get_number('discount'),0)-x.cost_minor/100);record_json.put('reference',invoice.get_string('reference'));record_json.put('isMixed',payments.get_size>1);record_json.put('payments',payments);
          invoice_totals:=invoice.get_object('totals');record_json.put('discount',NVL(invoice_totals.get_number('discount'),0));record_json.put('tax',NVL(invoice_totals.get_number('tax'),0));record_json.put('service',NVL(invoice_totals.get_number('serviceFee'),0));
          lines:=invoice.get_array('items');arr:=JSON_ARRAY_T();FOR i IN 0..lines.get_size-1 LOOP line:=TREAT(lines.get(i) AS JSON_OBJECT_T);line_out:=JSON_OBJECT_T();line_out.put('lineId',line.get_string('id'));line_out.put('menuItemId',line.get_string('menu_item_id'));line_out.put('name',line.get_string('item_name'));line_out.put('quantity',line.get_number('quantity'));line_out.put('unitPrice',line.get_number('unit_price'));value:=line.get_number('quantity')*line.get_number('unit_price');line_out.put('total',value);cost_total:=line.get_number('quantity')*line.get_number('unit_cost');line_out.put('cost',cost_total);line_out.put('profit',value-cost_total);arr.append(line_out);END LOOP;record_json.put('items',arr);
          IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;arr:=r.get_array('records');arr.append(record_json);r.put('records',arr);
          totals.put('sales',totals.get_number('sales')+1);totals.put('income',totals.get_number('income')+x.total_minor/100);totals.put('subtotal',totals.get_number('subtotal')+x.subtotal_minor/100);totals.put('cost',totals.get_number('cost')+x.cost_minor/100);totals.put('profit',totals.get_number('profit')+record_json.get_number('profit'));totals.put('discount',totals.get_number('discount')+record_json.get_number('discount'));totals.put('tax',totals.get_number('tax')+record_json.get_number('tax'));totals.put('service',totals.get_number('service')+record_json.get_number('service'));
          FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);method_value:=pay.get_string('method');IF method_value NOT IN('cash','transfer','breb','card','credit') THEN method_value:='other';END IF;totals.put(method_value,totals.get_number(method_value)+pay.get_number('amount'));IF method_value<>'credit' THEN totals.put('received',totals.get_number('received')+pay.get_number('amount'));END IF;END LOOP;method_value:=NVL(p_payload.get_string('paymentMethod'),'all');
        END IF;
      END IF;
    END LOOP;
    IF sale_type IN('all','collection') THEN
      FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='op_customerpayments' ORDER BY created_at DESC,id DESC) LOOP
        invoice:=JSON_OBJECT_T(x.data_json);json_text:=invoice.to_clob;date_value:=TO_CHAR(FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC') AT TIME ZONE 'America/Bogota','YYYY-MM-DD');
        IF date_value BETWEEN from_value AND to_value AND (income_cutoff IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>income_cutoff) AND (from_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')>=from_stamp) AND (to_stamp IS NULL OR FROM_TZ(TO_TIMESTAMP(invoice.get_string('createdAt'),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')<to_stamp) THEN
          method_value:=NVL(p_payload.get_string('paymentMethod'),'all');payments:=invoice.get_array('payments');match_value:=method_value='all' OR (method_value='mixed' AND payments.get_size>1);FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);IF pay.get_string('method')=method_value THEN match_value:=TRUE;END IF;END LOOP;
          IF query_value IS NOT NULL AND INSTR(LOWER(DBMS_LOB.SUBSTR(json_text,32000,1)),query_value)=0 THEN match_value:=FALSE;END IF;
          IF match_value THEN
            record_json:=JSON_OBJECT_T();record_json.put('saleId',x.id);record_json.put('recordType','collection');record_json.put('invoice',invoice.get_string('number'));record_json.put('sessionId',x.id);record_json.put('table',invoice.get_string('customerName'));record_json.put('date',invoice.get_string('createdAt'));record_json.put('payer',invoice.get_string('customerName'));record_json.put('waiter',invoice.get_string('actorName'));record_json.put('total',invoice.get_number('total'));record_json.put('subtotal',0);record_json.put('discount',0);record_json.put('tax',0);record_json.put('service',0);record_json.put('cost',0);record_json.put('profit',0);record_json.put('reference','Abono de cartera · venta ya registrada');record_json.put('isMixed',payments.get_size>1);record_json.put('payments',payments);record_json.put('items',JSON_ARRAY_T());
            IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;arr:=r.get_array('records');arr.append(record_json);r.put('records',arr);totals.put('collections',NVL(totals.get_number('collections'),0)+invoice.get_number('total'));
            FOR i IN 0..payments.get_size-1 LOOP pay:=TREAT(payments.get(i) AS JSON_OBJECT_T);method_value:=pay.get_string('method');totals.put(method_value,NVL(totals.get_number(method_value),0)+pay.get_number('amount'));totals.put('received',totals.get_number('received')+pay.get_number('amount'));END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;
    IF NOT r.has('records') THEN r.put('records',JSON_ARRAY_T());END IF;r.put('ok',TRUE);r.put('totals',totals);r.put('hasMore',FALSE);r.put_null('nextCursor');r.put('revision',alliance_pos_store.report_revision(p_business,p_location));r.put('generatedAt',alliance_pos_store.stamp);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_jespresso AUTHID DEFINER AS
  PROCEDURE validate_sheet(s JSON_OBJECT_T);
  PROCEDURE validate_line(l JSON_OBJECT_T);
  FUNCTION approved_product(m JSON_OBJECT_T,r JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_jespresso AS
  PROCEDURE num(o JSON_OBJECT_T,k VARCHAR2,lo NUMBER,hi NUMBER,optional BOOLEAN DEFAULT FALSE) IS n NUMBER;
  BEGIN
    IF NOT o.has(k) THEN alliance_security.fail(400,'COSTING_INPUT','Falta el campo '||k);END IF;
    IF o.get(k).is_null AND optional THEN RETURN;END IF;
    IF NOT o.get(k).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el valor de '||k);END IF;
    n:=o.get_number(k);IF n<lo OR n>hi THEN alliance_security.fail(400,'COSTING_INPUT','Valor fuera del rango: '||k);END IF;
  END;
  PROCEDURE short_text(o JSON_OBJECT_T,k VARCHAR2,max_length NUMBER) IS
  BEGIN IF NOT o.has(k) OR NOT o.get(k).is_string OR LENGTH(o.get_string(k))>max_length THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el campo '||k);END IF;END;
  PROCEDURE validate_sheet(s JSON_OBJECT_T) IS a JSON_ARRAY_T;v JSON_OBJECT_T;
  BEGIN
    IF s IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Hoja de receta invalida.');END IF;
    alliance_security.keys_only(s,'version,responsible,date,code,quantity,workingDays,closingDays,monthlySales,operating,management,unforeseenPercent,factorPercent,capitalMode,capitalPercent,consumptionPercent,ivaPercent,source');
    num(s,'version',1,1);short_text(s,'responsible',160);short_text(s,'date',10);short_text(s,'code',80);short_text(s,'source',160);
    IF s.get_string('date') IS NOT NULL AND (NOT REGEXP_LIKE(s.get_string('date'),'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR VALIDATE_CONVERSION(s.get_string('date') AS DATE,'FXYYYY-MM-DD')=0) THEN alliance_security.fail(400,'COSTING_INPUT','Fecha de preparacion invalida.');END IF;
    num(s,'quantity',0.000001,1e12,TRUE);num(s,'workingDays',1,366);num(s,'closingDays',1,366);num(s,'monthlySales',0,1e12,TRUE);
    num(s,'unforeseenPercent',0,100);num(s,'factorPercent',0,10000);num(s,'capitalPercent',0,100);num(s,'consumptionPercent',0,100);num(s,'ivaPercent',0,100);
    IF s.get_string('capitalMode') IS NULL OR s.get_string('capitalMode') NOT IN('daily','manual') THEN alliance_security.fail(400,'COSTING_INPUT','Recuperacion de capital invalida.');END IF;
    FOR section IN 1..2 LOOP
      a:=s.get_array(CASE WHEN section=1 THEN 'operating' ELSE 'management' END);
      IF a IS NULL OR a.get_size>20 THEN alliance_security.fail(400,'COSTING_INPUT','Conceptos de la hoja invalidos.');END IF;
      FOR i IN 0..a.get_size-1 LOOP
        v:=TREAT(a.get(i) AS JSON_OBJECT_T);
        IF section=1 THEN alliance_security.keys_only(v,'name,detail,amount');num(v,'amount',0,1e12);short_text(v,'detail',160);
        ELSE alliance_security.keys_only(v,'name,percent');num(v,'percent',0,100);END IF;
        IF alliance_security.text_value(v,'name',160) IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Escribe el nombre del concepto.');END IF;
      END LOOP;
    END LOOP;
  END;
  PROCEDURE validate_line(l JSON_OBJECT_T) IS
  BEGIN
    IF l.has('stage') AND (l.get_string('stage') IS NULL OR l.get_string('stage') NOT IN('batch','portion')) THEN alliance_security.fail(400,'COSTING_INPUT','Aplicacion de ingrediente invalida.');END IF;
    IF l.has('manualCost') THEN num(l,'manualCost',0,1e12,TRUE);END IF;
  END;
  FUNCTION approved_product(m JSON_OBJECT_T,r JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    s JSON_OBJECT_T:=r.get_object('sheet');ingredients JSON_ARRAY_T:=m.get_array('ingredients');lines JSON_ARRAY_T:=r.get_array('lines');a JSON_ARRAY_T;row_json JSON_OBJECT_T;l JSON_OBJECT_T;i JSON_OBJECT_T;result JSON_OBJECT_T:=JSON_OBJECT_T();w JSON_OBJECT_T:=JSON_OBJECT_T();
    batch NUMBER:=0;extras NUMBER:=0;line_cost NUMBER;unit_price NUMBER;management_percent NUMBER:=0;unforeseen NUMBER;management NUMBER;preparation NUMBER;cost NUMBER;sale_base NUMBER;capital_percent NUMBER;capital NUMBER;consumption NUMBER;iva NUMBER;final_price NUMBER;price NUMBER;monthly_fixed NUMBER:=0;daily_value NUMBER;estimate NUMBER;tax_rate NUMBER;tax_amount NUMBER;net NUMBER;profit NUMBER;
    FUNCTION factor(u VARCHAR2) RETURN NUMBER IS BEGIN RETURN CASE WHEN u IN('kg','l') THEN 1000 ELSE 1 END;END;
  BEGIN
    validate_sheet(s);
    IF lines.get_size=0 THEN alliance_security.fail(400,'COSTING_GOAL','Agrega los ingredientes de la receta.');END IF;
    FOR k IN 0..lines.get_size-1 LOOP
      l:=TREAT(lines.get(k) AS JSON_OBJECT_T);validate_line(l);i:=NULL;
      FOR j IN 0..ingredients.get_size-1 LOOP row_json:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=l.get_string('ingredientId') THEN i:=row_json;EXIT;END IF;END LOOP;
      IF i IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Ingrediente no disponible.');END IF;
      IF l.has('manualCost') AND NOT l.get('manualCost').is_null THEN line_cost:=l.get_number('manualCost')/alliance_yield.factor(l);
      ELSE
        unit_price:=i.get_number('purchasePrice');IF i.get_boolean('recoverableTax') THEN unit_price:=unit_price/(1+i.get_number('purchaseTaxRate')/100);END IF;
        unit_price:=unit_price/i.get_number('quantity');
        line_cost:=l.get_number('quantity')/alliance_yield.factor(l)*factor(l.get_string('unit'))/factor(i.get_string('unit'))*unit_price;
      END IF;
      IF l.get_string('stage')='portion' THEN extras:=extras+line_cost;ELSE batch:=batch+line_cost;END IF;
    END LOOP;
    a:=s.get_array('management');FOR k IN 0..a.get_size-1 LOOP row_json:=TREAT(a.get(k) AS JSON_OBJECT_T);management_percent:=management_percent+row_json.get_number('percent');END LOOP;
    a:=s.get_array('operating');FOR k IN 0..a.get_size-1 LOOP row_json:=TREAT(a.get(k) AS JSON_OBJECT_T);monthly_fixed:=monthly_fixed+row_json.get_number('amount');END LOOP;
    unforeseen:=batch*s.get_number('unforeseenPercent')/100;management:=batch*management_percent/100;preparation:=batch+unforeseen+management;cost:=preparation/r.get_number('output')+extras;
    daily_value:=monthly_fixed/s.get_number('workingDays');estimate:=daily_value*s.get_number('closingDays');
    IF s.get_string('capitalMode')='daily' THEN capital_percent:=CASE WHEN estimate>0 THEN daily_value/estimate*100 ELSE 0 END;ELSE capital_percent:=s.get_number('capitalPercent');END IF;
    sale_base:=cost*s.get_number('factorPercent')/100;capital:=sale_base*capital_percent/100;consumption:=sale_base*s.get_number('consumptionPercent')/100;iva:=sale_base*s.get_number('ivaPercent')/100;final_price:=sale_base+capital+consumption+iva;
    price:=NVL(r.get_number('currentPrice'),final_price);
    IF price<=0 OR cost<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Completa los costos y el factor de venta.');END IF;
    tax_rate:=(s.get_number('consumptionPercent')+s.get_number('ivaPercent'))/100;tax_amount:=price*tax_rate/(1+capital_percent/100+tax_rate);net:=price-tax_amount;profit:=net-cost;
    IF profit<0 THEN alliance_security.fail(400,'COSTING_GOAL','El precio no cubre el costo por porcion.');END IF;
    w.put('batchIngredients',batch);w.put('portionExtras',extras);w.put('managementPercent',management_percent);w.put('unforeseen',unforeseen);w.put('management',management);w.put('preparation',preparation);w.put('cost',cost);w.put('saleBase',sale_base);w.put('capitalPercent',capital_percent);w.put('capital',capital);w.put('consumption',consumption);w.put('iva',iva);w.put('final',final_price);w.put('monthlyFixed',monthly_fixed);w.put('dailyBreakEven',daily_value);w.put('monthlyEstimate',estimate);
    IF s.get('monthlySales').is_null THEN w.put_null('monthlyProfit');ELSE w.put('monthlyProfit',s.get_number('monthlySales')-monthly_fixed);END IF;
    result.put('worksheet',w);result.put('pricingBasis','production');result.put('recipeId',r.get_string('id'));result.put('name',r.get_string('name'));result.put('size',r.get_string('size'));result.put('channelName','Venta directa');result.put('cost',cost);result.put('price',price);result.put('profit',profit);result.put('actualPercent',profit/net*100);result.put('targetPercent',0);result.put('marginMode','margin');result.put('model',m);RETURN result;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_costing AUTHID DEFINER AS
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_costing AS
  PROCEDURE numeric_value(o JSON_OBJECT_T,k VARCHAR2,lo NUMBER,hi NUMBER,optional BOOLEAN DEFAULT FALSE) IS n NUMBER;
  BEGIN
    IF NOT o.has(k) THEN alliance_security.fail(400,'COSTING_INPUT','Falta el campo '||k);END IF;
    IF o.get(k).is_null AND optional THEN RETURN;END IF;
    IF NOT o.get(k).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Numero invalido: '||k);END IF;
    n:=o.get_number(k);IF n<lo OR n>hi THEN alliance_security.fail(400,'COSTING_INPUT','Valor fuera del rango: '||k);END IF;
  END;
  PROCEDURE enum_value(o JSON_OBJECT_T,k VARCHAR2,allowed VARCHAR2) IS v VARCHAR2(100);
  BEGIN v:=o.get_string(k);IF v IS NULL OR INSTR(','||allowed||',',','||v||',')=0 THEN alliance_security.fail(400,'COSTING_INPUT','Opcion invalida: '||k);END IF;END;
  FUNCTION family(v VARCHAR2) RETURN VARCHAR2 IS
  BEGIN RETURN CASE WHEN v IN('g','kg') THEN 'mass' WHEN v IN('ml','l') THEN 'volume' WHEN v='unit' THEN 'count' ELSE NULL END;END;
  PROCEDURE flag(o JSON_OBJECT_T,k VARCHAR2) IS
  BEGIN IF NOT o.has(k) OR NOT o.get(k).is_boolean THEN alliance_security.fail(400,'COSTING_INPUT','Confirma la opcion '||k);END IF;END;
  PROCEDURE validate_model(m IN OUT JSON_OBJECT_T) IS
    s JSON_OBJECT_T;a JSON_ARRAY_T;rows_json JSON_ARRAY_T;row_json JSON_OBJECT_T;line_json JSON_OBJECT_T;ingredients_json JSON_ARRAY_T;recipes_json JSON_ARRAY_T;channels_json JSON_ARRAY_T;ingredient_json JSON_OBJECT_T;other_json JSON_OBJECT_T;ids CLOB;id_value VARCHAR2(80);found BOOLEAN;
  BEGIN
    alliance_security.keys_only(m,'settings,ingredients,expenses,channels,recipes');s:=m.get_object('settings');alliance_security.keys_only(s,'monthlyUnits,monthlyMinutes,taxRate,taxMode');
    numeric_value(s,'monthlyUnits',0.000001,1e12,TRUE);numeric_value(s,'monthlyMinutes',0.000001,1e12,TRUE);numeric_value(s,'taxRate',0,100);enum_value(s,'taxMode','included,added');
    ingredients_json:=m.get_array('ingredients');recipes_json:=m.get_array('recipes');channels_json:=m.get_array('channels');
    FOR section IN 1..4 LOOP
      a:=m.get_array(CASE section WHEN 1 THEN 'ingredients' WHEN 2 THEN 'expenses' WHEN 3 THEN 'channels' ELSE 'recipes' END);
      IF a IS NULL OR a.get_size>500 THEN alliance_security.fail(400,'COSTING_INPUT','Catalogo invalido o demasiado grande.');END IF;ids:=',';
      FOR i IN 0..a.get_size-1 LOOP
        row_json:=TREAT(a.get(i) AS JSON_OBJECT_T);id_value:=alliance_security.text_value(row_json,'id',80,'^[a-zA-Z0-9_-]+$');
        IF INSTR(ids,','||id_value||',')>0 THEN alliance_security.fail(400,'COSTING_INPUT','Identificador duplicado.');END IF;ids:=ids||id_value||',';
        id_value:=alliance_security.text_value(row_json,'name',160);
        IF section=1 THEN
          row_json.put('yieldPercent',100);a.put(i,row_json,TRUE);m.put('ingredients',a);
          alliance_security.keys_only(row_json,'id,name,unit,quantity,purchasePrice,yieldPercent,purchaseTaxRate,recoverableTax,purchaseDate,invoice');enum_value(row_json,'unit','g,kg,ml,l,unit');numeric_value(row_json,'quantity',0.000001,1e12);numeric_value(row_json,'purchasePrice',0,1e12);numeric_value(row_json,'yieldPercent',0.000001,100);numeric_value(row_json,'purchaseTaxRate',0,100);flag(row_json,'recoverableTax');IF row_json.has('invoice') AND (NOT row_json.get('invoice').is_string OR LENGTH(row_json.get_string('invoice'))>80) THEN alliance_security.fail(400,'COSTING_INPUT','Factura invalida.');END IF;IF row_json.get_string('purchaseDate') IS NOT NULL AND (NOT REGEXP_LIKE(row_json.get_string('purchaseDate'),'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR VALIDATE_CONVERSION(row_json.get_string('purchaseDate') AS DATE,'FXYYYY-MM-DD')=0) THEN alliance_security.fail(400,'COSTING_INPUT','Fecha de compra invalida.');END IF;
        ELSIF section=2 THEN
          alliance_security.keys_only(row_json,'id,name,amount,periodMonths,kind,allocation,recipeId,includedElsewhere');numeric_value(row_json,'amount',0,1e12);numeric_value(row_json,'periodMonths',0.000001,1e12);enum_value(row_json,'kind','fixed,unit,batch');IF row_json.get_string('kind')='batch' AND row_json.get_string('recipeId') IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Asigna el costo del lote a un producto.');END IF;enum_value(row_json,'allocation','units,minutes');flag(row_json,'includedElsewhere');
          FOR j IN 0..i-1 LOOP other_json:=TREAT(a.get(j) AS JSON_OBJECT_T);IF LOWER(TRIM(other_json.get_string('name')))=LOWER(TRIM(row_json.get_string('name'))) AND other_json.get_string('kind')=row_json.get_string('kind') AND NVL(other_json.get_string('recipeId'),'-')=NVL(row_json.get_string('recipeId'),'-') THEN alliance_security.fail(400,'COSTING_INPUT','Gasto duplicado: edita el existente.');END IF;END LOOP;
          IF row_json.get_string('recipeId') IS NOT NULL THEN found:=FALSE;FOR j IN 0..recipes_json.get_size-1 LOOP other_json:=TREAT(recipes_json.get(j) AS JSON_OBJECT_T);IF other_json.get_string('id')=row_json.get_string('recipeId') THEN found:=TRUE;END IF;END LOOP;IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Producto del gasto inexistente.');END IF;END IF;
        ELSIF section=3 THEN
          alliance_security.keys_only(row_json,'id,name,salesPercent,paymentPercent,flatFee,feeBase');numeric_value(row_json,'salesPercent',0,99.999);numeric_value(row_json,'paymentPercent',0,99.999);numeric_value(row_json,'flatFee',0,1e12);enum_value(row_json,'feeBase','net,gross');
        ELSE
          row_json.put('wastePercent',0);a.put(i,row_json,TRUE);m.put('recipes',a);
          alliance_security.keys_only(row_json,'id,name,size,category,output,wastePercent,minutes,monthlyUnits,currentPrice,targetPercent,marginMode,channelId,lines,pricingBasis,sheet');IF row_json.has('sheet') THEN alliance_jespresso.validate_sheet(row_json.get_object('sheet'));END IF;IF row_json.has('pricingBasis') THEN enum_value(row_json,'pricingBasis','full,production');END IF;numeric_value(row_json,'output',0.000001,1e12);numeric_value(row_json,'wastePercent',0,99.999);numeric_value(row_json,'minutes',0.000001,1e12,TRUE);numeric_value(row_json,'monthlyUnits',0.000001,1e12,TRUE);numeric_value(row_json,'currentPrice',0,1e12,TRUE);enum_value(row_json,'marginMode','margin,markup');numeric_value(row_json,'targetPercent',0,CASE WHEN row_json.get_string('marginMode')='markup' THEN 1000 ELSE 99.999 END);
          IF LENGTH(row_json.get_string('size'))>80 OR LENGTH(row_json.get_string('category'))>80 THEN alliance_security.fail(400,'COSTING_INPUT','Variante demasiado larga.');END IF;
          IF row_json.get_string('channelId') IS NOT NULL THEN found:=FALSE;FOR j IN 0..channels_json.get_size-1 LOOP other_json:=TREAT(channels_json.get(j) AS JSON_OBJECT_T);IF other_json.get_string('id')=row_json.get_string('channelId') THEN found:=TRUE;END IF;END LOOP;IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Canal inexistente.');END IF;END IF;
          rows_json:=row_json.get_array('lines');IF rows_json IS NULL OR rows_json.get_size>100 THEN alliance_security.fail(400,'COSTING_INPUT','Receta demasiado grande.');END IF;
          FOR j IN 0..rows_json.get_size-1 LOOP
            line_json:=TREAT(rows_json.get(j) AS JSON_OBJECT_T);alliance_security.keys_only(line_json,'ingredientId,quantity,unit,stage,manualCost,processing');IF row_json.has('sheet') THEN alliance_jespresso.validate_line(line_json);ELSIF line_json.has('stage') OR line_json.has('manualCost') THEN alliance_security.fail(400,'COSTING_INPUT','Opciones de ingrediente fuera de la hoja de recetas.');END IF;numeric_value(line_json,'quantity',CASE WHEN row_json.has('sheet') THEN 0 ELSE 0.000001 END,1e12);enum_value(line_json,'unit','g,kg,ml,l,unit');IF alliance_yield.factor(line_json)<=0 THEN alliance_security.fail(400,'COSTING_INPUT','Rendimiento invalido.');END IF;found:=FALSE;
            FOR k IN 0..ingredients_json.get_size-1 LOOP ingredient_json:=TREAT(ingredients_json.get(k) AS JSON_OBJECT_T);IF ingredient_json.get_string('id')=line_json.get_string('ingredientId') THEN found:=TRUE;IF family(ingredient_json.get_string('unit'))<>family(line_json.get_string('unit')) THEN alliance_security.fail(400,'COSTING_INPUT','Conversion incompatible.');END IF;END IF;END LOOP;
            IF NOT found THEN alliance_security.fail(400,'COSTING_INPUT','Ingrediente inexistente o eliminado.');END IF;
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END;
  -- Recalculate approval in Oracle; clients cannot submit invented profit figures.
  FUNCTION approved_product(m JSON_OBJECT_T,recipe_id VARCHAR2) RETURN JSON_OBJECT_T IS
    recipes JSON_ARRAY_T:=m.get_array('recipes');ingredients JSON_ARRAY_T:=m.get_array('ingredients');expenses JSON_ARRAY_T:=m.get_array('expenses');channels JSON_ARRAY_T:=m.get_array('channels');
    recipe JSON_OBJECT_T;ingredient JSON_OBJECT_T;expense JSON_OBJECT_T;channel JSON_OBJECT_T;s JSON_OBJECT_T:=m.get_object('settings');line JSON_OBJECT_T;lines JSON_ARRAY_T;result JSON_OBJECT_T:=JSON_OBJECT_T();
    batch NUMBER:=0;direct NUMBER:=0;allocated NUMBER:=0;price NUMBER;cost NUMBER;net NUMBER;fees NUMBER;profit NUMBER;actual NUMBER;capacity NUMBER;monthly NUMBER;unit_price NUMBER;quantity NUMBER;tax NUMBER;rate NUMBER;denominator NUMBER;
    FUNCTION factor(u VARCHAR2) RETURN NUMBER IS BEGIN RETURN CASE WHEN u IN('kg','l') THEN 1000 ELSE 1 END;END;
  BEGIN
    FOR i IN 0..recipes.get_size-1 LOOP recipe:=TREAT(recipes.get(i) AS JSON_OBJECT_T);EXIT WHEN recipe.get_string('id')=recipe_id;recipe:=NULL;END LOOP;
    IF recipe IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto no disponible.');END IF;
    IF recipe.has('sheet') THEN RETURN alliance_jespresso.approved_product(m,recipe);END IF;
    lines:=recipe.get_array('lines');price:=recipe.get_number('currentPrice');
    IF lines.get_size=0 OR price IS NULL OR price<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Completa la receta y el precio antes de guardar el producto.');END IF;
    FOR i IN 0..channels.get_size-1 LOOP channel:=TREAT(channels.get(i) AS JSON_OBJECT_T);EXIT WHEN channel.get_string('id')=recipe.get_string('channelId');channel:=NULL;END LOOP;
    IF channel IS NULL THEN alliance_security.fail(400,'COSTING_GOAL','Selecciona una forma de venta.');END IF;
    FOR i IN 0..lines.get_size-1 LOOP
      line:=TREAT(lines.get(i) AS JSON_OBJECT_T);
      FOR j IN 0..ingredients.get_size-1 LOOP ingredient:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);EXIT WHEN ingredient.get_string('id')=line.get_string('ingredientId');END LOOP;
      unit_price:=ingredient.get_number('purchasePrice');IF ingredient.get_boolean('recoverableTax') THEN unit_price:=unit_price/(1+ingredient.get_number('purchaseTaxRate')/100);END IF;
      unit_price:=unit_price/ingredient.get_number('quantity');
      quantity:=line.get_number('quantity')/alliance_yield.factor(line)*factor(line.get_string('unit'))/factor(ingredient.get_string('unit'));batch:=batch+quantity*unit_price;
    END LOOP;
    FOR i IN 0..expenses.get_size-1 LOOP
      expense:=TREAT(expenses.get(i) AS JSON_OBJECT_T);
      IF NOT expense.get_boolean('includedElsewhere') AND (expense.get_string('recipeId') IS NULL OR expense.get_string('recipeId')=recipe_id) THEN
        IF expense.get_string('kind')='unit' THEN direct:=direct+expense.get_number('amount');ELSIF expense.get_string('kind')='batch' THEN direct:=direct+expense.get_number('amount')/recipe.get_number('output');
        ELSIF NVL(recipe.get_string('pricingBasis'),'full')<>'production' THEN monthly:=expense.get_number('amount')/expense.get_number('periodMonths');
          IF expense.get_string('allocation')='minutes' THEN
            IF expense.get_string('recipeId') IS NOT NULL THEN capacity:=recipe.get_number('minutes')*recipe.get_number('monthlyUnits');ELSE capacity:=s.get_number('monthlyMinutes');END IF;
            IF capacity IS NULL OR capacity<=0 OR recipe.get_number('minutes') IS NULL THEN alliance_security.fail(400,'COSTING_GOAL','Faltan tiempos para repartir los gastos.');END IF;
            allocated:=allocated+monthly*recipe.get_number('minutes')/capacity;
          ELSE
            IF expense.get_string('recipeId') IS NOT NULL THEN capacity:=recipe.get_number('monthlyUnits');ELSE capacity:=s.get_number('monthlyUnits');END IF;
            IF capacity IS NULL OR capacity<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Indica las ventas del mes para repartir los gastos.');END IF;
            allocated:=allocated+monthly/capacity;
          END IF;
        END IF;
      END IF;
    END LOOP;
    cost:=batch/recipe.get_number('output')+direct+allocated;
    tax:=s.get_number('taxRate')/100;net:=price;IF s.get_string('taxMode')='included' THEN net:=price/(1+tax);END IF;
    rate:=(channel.get_number('salesPercent')+channel.get_number('paymentPercent'))/100;IF channel.get_string('feeBase')='gross' THEN rate:=rate*(1+tax);END IF;
    denominator:=1-rate;IF recipe.get_string('marginMode')='margin' THEN denominator:=denominator-recipe.get_number('targetPercent')/100;END IF;
    fees:=net*rate+channel.get_number('flatFee');profit:=net-cost-fees;
    IF recipe.get_string('marginMode')='markup' THEN IF cost<=0 THEN alliance_security.fail(400,'COSTING_GOAL','El recargo necesita un costo mayor que cero.');END IF;actual:=profit/cost*100;ELSE actual:=profit/net*100;END IF;
    IF denominator<=0 OR profit<0 OR actual+0.0000001<recipe.get_number('targetPercent') THEN alliance_security.fail(400,'COSTING_GOAL','El precio actual todavía no alcanza tu ganancia objetivo.');END IF;
    result.put('pricingBasis',NVL(recipe.get_string('pricingBasis'),'full'));result.put('recipeId',recipe_id);result.put('name',recipe.get_string('name'));result.put('size',recipe.get_string('size'));result.put('channelName',channel.get_string('name'));result.put('cost',cost);result.put('price',price);result.put('profit',profit);result.put('actualPercent',actual);result.put('targetPercent',recipe.get_number('targetPercent'));result.put('marginMode',recipe.get_string('marginMode'));result.put('model',m);RETURN result;
  END;
  FUNCTION run_action(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();o JSON_OBJECT_T;model_json JSON_OBJECT_T;history_json JSON_ARRAY_T:=JSON_ARRAY_T();approved_json JSON_ARRAY_T:=JSON_ARRAY_T();recipe_id VARCHAR2(80);revision_value NUMBER:=0;stamp_value VARCHAR2(40);actor_name VARCHAR2(160);actor_id_value VARCHAR2(36);old_json CLOB;new_json CLOB;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'inventory.read');
    o:=alliance_pos_store.document(p_business,p_location,'costing','primary');IF o IS NOT NULL THEN revision_value:=o.get_number('revision');END IF;
    IF p_action='costing_load' THEN alliance_security.keys_only(p_payload,'revision');
      IF p_payload.has('revision') THEN numeric_value(p_payload,'revision',1,1e12);o:=alliance_pos_store.document(p_business,p_location,'costing_history',TO_CHAR(p_payload.get_number('revision')));IF o IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Version no disponible.');END IF;END IF;
      r.put('revision',revision_value);IF o IS NOT NULL THEN r.put('model',o.get_object('model'));r.put('updatedAt',o.get_string('updatedAt'));r.put('actor',o.get_string('actor'));BEGIN actor_id_value:=o.get_string('actor');SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=actor_id_value;r.put('actorName',actor_name);EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;ELSE r.put_null('model');END IF;
      FOR h IN(SELECT JSON_VALUE(data_json,'$.revision' RETURNING NUMBER) rev,JSON_VALUE(data_json,'$.updatedAt') stamp,JSON_VALUE(data_json,'$.actor') actor FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_history' ORDER BY created_at DESC FETCH FIRST 100 ROWS ONLY) LOOP
        model_json:=JSON_OBJECT_T();model_json.put('revision',h.rev);model_json.put('updatedAt',h.stamp);model_json.put('actor',h.actor);history_json.append(model_json);
      END LOOP;r.put('history',history_json);
      FOR h IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_approved' ORDER BY created_at DESC) LOOP
        model_json:=JSON_OBJECT_T.parse(h.data_json);model_json.remove('model');BEGIN actor_id_value:=model_json.get_string('actor');SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=actor_id_value;model_json.put('actorName',actor_name);EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;approved_json.append(model_json);
      END LOOP;r.put('approved',approved_json);RETURN r;
    ELSIF p_action IN('costing_approve','costing_product_load','costing_product_delete') THEN
      IF p_action='costing_approve' THEN alliance_security.keys_only(p_payload,'recipeId,revision');ELSE alliance_security.keys_only(p_payload,'recipeId');END IF;
      recipe_id:=alliance_security.text_value(p_payload,'recipeId',80,'^[a-zA-Z0-9_-]+$');
      IF p_action='costing_product_load' THEN
        r:=alliance_pos_store.document(p_business,p_location,'costing_approved',recipe_id);IF r IS NULL THEN alliance_security.fail(404,'NOT_FOUND','Producto guardado no disponible.');END IF;RETURN r;
      END IF;
      alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_pos_store.lock_scope(p_business,p_location);
      model_json:=alliance_pos_store.document(p_business,p_location,'costing_approved',recipe_id);IF model_json IS NOT NULL THEN old_json:=model_json.to_clob;END IF;
      IF p_action='costing_product_delete' THEN
        DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='costing_approved' AND id=recipe_id;
        r.put('deleted',TRUE);
      ELSE
        numeric_value(p_payload,'revision',0,1e12);o:=alliance_pos_store.document(p_business,p_location,'costing','primary');
        IF o IS NULL OR o.get_number('revision')<>p_payload.get_number('revision') THEN alliance_security.fail(409,'COSTING_CONFLICT','El costeo cambió. Recarga antes de guardar el producto.');END IF;
        r:=approved_product(o.get_object('model'),recipe_id);r.put('updatedAt',alliance_pos_store.stamp);r.put('actor',p_user);SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=p_user;r.put('actorName',actor_name);
        alliance_pos_store.put_document(p_business,p_location,'costing_approved',recipe_id,r);new_json:=r.to_clob;r.remove('model');
      END IF;
      INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,CASE WHEN p_action='costing_approve' THEN 'COSTING_APPROVE' ELSE 'COSTING_UNSAVE' END,p_location,old_json,new_json);RETURN r;
    ELSIF p_action='costing_save' THEN
      alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_security.keys_only(p_payload,'model,revision');numeric_value(p_payload,'revision',0,1e12);
      alliance_pos_store.lock_scope(p_business,p_location);o:=alliance_pos_store.document(p_business,p_location,'costing','primary');revision_value:=0;IF o IS NOT NULL THEN revision_value:=o.get_number('revision');old_json:=o.to_clob;END IF;
      IF revision_value<>p_payload.get_number('revision') THEN alliance_security.fail(409,'COSTING_CONFLICT','Otra persona modifico el costeo. Recarga antes de guardar. Tu borrador se conserva.');END IF;
      model_json:=p_payload.get_object('model');validate_model(model_json);alliance_materials.processing_prices(p_business,p_location,CASE WHEN old_json IS NULL THEN NULL ELSE JSON_OBJECT_T(old_json).get_object('model') END,model_json);stamp_value:=alliance_pos_store.stamp;
      o:=JSON_OBJECT_T();o.put('model',model_json);o.put('revision',revision_value+1);o.put('updatedAt',stamp_value);o.put('actor',p_user);
      alliance_pos_store.put_document(p_business,p_location,'costing','primary',o);alliance_materials.sync_processing(p_user,p_business,p_location,CASE WHEN old_json IS NULL THEN NULL ELSE JSON_OBJECT_T(old_json).get_object('model') END,model_json,revision_value+1);new_json:=o.to_clob;
      INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,'COSTING_SAVE',p_location,old_json,new_json);
      alliance_activity.costing_changes(p_user,p_business,p_location,old_json,model_json);
      SELECT full_name INTO actor_name FROM users WHERE business_id=p_business AND id=p_user;r.put('actorName',actor_name);r.put('actor',p_user);r.put('revision',revision_value+1);r.put('updatedAt',stamp_value);RETURN r;
    END IF;alliance_security.fail(404,'NOT_FOUND','Accion de costeo no disponible.');RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_materials AS
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
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_pos AUTHID DEFINER AS
  PROCEDURE initialize(p_business VARCHAR2,p_location VARCHAR2);
  FUNCTION dispatch(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION public_dispatch(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_pos AS
  FUNCTION events(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_action VARCHAR2,p_payload JSON_OBJECT_T,p_public_table VARCHAR2 DEFAULT NULL) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();event_object JSON_OBJECT_T;data_object JSON_OBJECT_T;session_object JSON_OBJECT_T;channel_value VARCHAR2(100):=p_payload.get_string('channel');table_value VARCHAR2(80);session_value VARCHAR2(80);event_name VARCHAR2(30);id_value VARCHAR2(80);data_text CLOB;
  BEGIN
    IF p_public_table IS NOT NULL THEN table_value:=p_public_table;IF channel_value<>'table:'||table_value THEN alliance_security.fail(403,'TABLE_ACCESS','Canal de otra mesa.');END IF;
    ELSE alliance_security.require_location(p_user,p_business,p_location,'service.read');
      IF channel_value<>'admin' THEN table_value:=SUBSTR(channel_value,7);IF SUBSTR(channel_value,1,6)<>'table:' OR alliance_pos_store.document(p_business,p_location,'restaurant_tables',table_value) IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Canal no disponible.');END IF;END IF;
    END IF;
    IF p_action='broadcast' THEN
      event_name:=p_payload.get_string('event');IF event_name NOT IN('typing','chat-refresh','admin-presence','chat-closed','refresh') OR event_name IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Evento invalido.');END IF;
      data_object:=p_payload.get_object('payload');IF data_object IS NULL THEN data_object:=JSON_OBJECT_T();END IF;data_text:=data_object.to_clob;IF DBMS_LOB.GETLENGTH(data_text)>2000 THEN alliance_security.fail(400,'INVALID_INPUT','Evento demasiado grande.');END IF;
      IF p_public_table IS NOT NULL THEN
        IF event_name NOT IN('typing','chat-refresh') THEN alliance_security.fail(403,'TABLE_ACCESS','Evento reservado al personal.');END IF;data_object.put('role','client');
      ELSE alliance_security.require_location(p_user,p_business,p_location,'service.write');data_object.put('role','staff');END IF;
      session_value:=data_object.get_string('sessionId');IF table_value IS NOT NULL THEN session_object:=alliance_pos_store.document(p_business,p_location,'table_sessions',session_value);IF session_object IS NULL OR session_object.get_string('table_id')<>table_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible para este evento.');END IF;END IF;
      alliance_pos_store.lock_scope(p_business,p_location);event_object:=JSON_OBJECT_T();event_object.put('id',alliance_security.new_id);event_object.put('channel',channel_value);event_object.put('event',event_name);event_object.put('payload',data_object);event_object.put('sender',NVL(p_user,'client:'||table_value));event_object.put('created_at',alliance_pos_store.stamp);
      id_value:=alliance_security.hash_text(channel_value||':'||event_name||':'||NVL(p_user,'client')||':'||session_value);alliance_pos_store.put_document(p_business,p_location,'realtime',id_value,event_object);r.put('ok',TRUE);RETURN r;
    END IF;
    FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='realtime' AND JSON_VALUE(data_json,'$.channel')=channel_value ORDER BY JSON_VALUE(data_json,'$.created_at')) LOOP a.append(JSON_OBJECT_T(x.data_json));END LOOP;r.put('events',a);RETURN r;
  END;
  PROCEDURE initialize(p_business VARCHAR2,p_location VARCHAR2) IS o JSON_OBJECT_T;n NUMBER;name_value VARCHAR2(160);color_value VARCHAR2(7);id_value VARCHAR2(36);code_value VARCHAR2(64);
  BEGIN
    alliance_pos_store.lock_scope(p_business,p_location);
    SELECT name,color INTO name_value,color_value FROM locations WHERE business_id=p_business AND id=p_location;
    o:=alliance_pos_store.document(p_business,p_location,'business_settings','primary');IF o IS NULL THEN
      o:=JSON_OBJECT_T();o.put('id','primary');o.put('is_primary',TRUE);o.put('business_name',name_value);o.put('subtitle','Panel operativo');o.put('accent_color',color_value);o.put('currency','COP');o.put('tips_enabled',FALSE);o.put('tip_percentage',10);alliance_pos_store.put_document(p_business,p_location,'business_settings','primary',o);
    END IF;
    SELECT COUNT(*) INTO n FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='configuration' AND id='initialized';
    IF n=0 THEN
      FOR i IN 1..24 LOOP id_value:=alliance_security.new_id;code_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));o:=JSON_OBJECT_T();o.put('id',id_value);o.put('table_number',i);o.put('table_name','M'||TO_CHAR(i));o.put('qr_code',code_value);o.put('is_active',TRUE);o.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'restaurant_tables',id_value,o);END LOOP;
      FOR i IN 1..12 LOOP id_value:=alliance_security.new_id;o:=JSON_OBJECT_T();o.put('id',id_value);o.put('table_number',24+i);o.put('table_name',CASE WHEN i<=6 THEN 'Terraza '||TO_CHAR(i) ELSE 'Matera '||TO_CHAR(i-6) END);o.put('qr_code',CASE WHEN i<=6 THEN 'interno-bar-' ELSE 'interno-planter-' END||id_value);o.put('is_active',TRUE);o.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'restaurant_tables',id_value,o);END LOOP;
      o:=JSON_OBJECT_T('{"initialized":true}');alliance_pos_store.put_document(p_business,p_location,'configuration','initialized',o);
    END IF;
  END;
  FUNCTION snapshot(p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T;filtered JSON_ARRAY_T:=JSON_ARRAY_T();o JSON_OBJECT_T;
  BEGIN
    a:=alliance_pos_store.list_documents(p_business,p_location,'table_sessions');FOR i IN 0..a.get_size-1 LOOP o:=TREAT(a.get(i) AS JSON_OBJECT_T);IF o.get_string('status')='open' THEN filtered.append(o);END IF;END LOOP;r.put('sessions',filtered);
    a:=alliance_pos_store.list_documents(p_business,p_location,'service_requests');filtered:=JSON_ARRAY_T();FOR i IN 0..a.get_size-1 LOOP o:=TREAT(a.get(i) AS JSON_OBJECT_T);IF o.get_string('status') IN('pending','acknowledged') THEN filtered.append(o);END IF;END LOOP;r.put('requests',filtered);RETURN r;
  END;
  FUNCTION dispatch(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    action_value VARCHAR2(50):=p_body.get_string('action');payload JSON_OBJECT_T:=p_body.get_object('payload');r JSON_OBJECT_T:=JSON_OBJECT_T();q JSON_OBJECT_T;value_json JSON_OBJECT_T;arr JSON_ARRAY_T;out_json JSON_ARRAY_T;row_json JSON_OBJECT_T;filters JSON_ARRAY_T;f JSON_OBJECT_T;
    job_id VARCHAR2(160):=p_body.get_string('operation_id');digest VARCHAR2(64);saved_hash VARCHAR2(64);saved_user VARCHAR2(36);saved_value CLOB;save_value CLOB;id_value VARCHAR2(80);table_value VARCHAR2(80);code_value VARCHAR2(64);n NUMBER;permission_value VARCHAR2(32767);is_write BOOLEAN:=FALSE;
  BEGIN
    alliance_security.keys_only(p_body,'action,payload,operation_id,device_id,client_created_at');IF payload IS NULL THEN payload:=JSON_OBJECT_T();END IF;
    alliance_activity.client_context(p_body.get_string('device_id'),p_body.get_string('client_created_at'));
    -- Base scope check does not require a particular operational section.
    value_json:=alliance_security.context_for(p_user);q:=value_json.get_object('permissions');IF p_location IS NULL OR NOT q.has(p_location) THEN alliance_security.fail(403,'FORBIDDEN','No tienes acceso a esta sucursal.');END IF;
    IF action_value='bootstrap' THEN
      initialize(p_business,p_location);r.put('business',alliance_pos_store.document(p_business,p_location,'business_settings','primary'));r.put('tables',alliance_pos_store.list_documents(p_business,p_location,'restaurant_tables'));r.put('categories',alliance_pos_store.list_documents(p_business,p_location,'menu_categories'));r.put('items',alliance_pos_store.list_documents(p_business,p_location,'menu_items'));arr:=JSON_ARRAY_T();FOR x IN(SELECT id FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='op_recipes') LOOP arr.append(x.id);END LOOP;r.put('preparedProductIds',arr);r.put('value',JSON_OBJECT_T(r.to_clob));RETURN r;
    END IF;
    is_write:=action_value NOT IN('getAdminSnapshot','query','get_inventory','get_inventory_movements','get_income_report','status','remote_bootstrap','listChatMessages','getClientSnapshot','getEvents','costing_load','costing_product_load','operations_snapshot','operations_device','orders_revision','customer_history');
    IF action_value='query' THEN is_write:=payload.get_string('op')<>'select';END IF;
    IF is_write THEN
      alliance_pos_store.lock_scope(p_business,p_location);
      IF job_id IS NOT NULL THEN
        IF LENGTH(job_id)>160 THEN alliance_security.fail(400,'INVALID_INPUT','Operacion invalida.');END IF;
        save_value:=p_body.to_clob;digest:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(save_value,DBMS_CRYPTO.HASH_SH256)));
        BEGIN SELECT fingerprint,actor_user_id,result_json INTO saved_hash,saved_user,saved_value FROM alliance_pos_receipts WHERE business_id=p_business AND location_id=p_location AND id=job_id;
          IF saved_hash<>digest OR saved_user<>p_user THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La operacion ya se uso con otros datos.');END IF;RETURN JSON_OBJECT_T(saved_value);
        EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;
      END IF;
    END IF;
    IF action_value IN('operations_snapshot','operations_apply','operations_device','customer_history') THEN r.put('value',alliance_operations_commands.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('orders_revision','order_submit','order_accept','order_reject','order_cancel') THEN r.put('value',alliance_orders.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('costing_load','costing_product_load','costing_save','costing_approve','costing_product_delete') THEN r.put('value',alliance_costing.run_action(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value IN('broadcast','getEvents') THEN r.put('value',events(p_user,p_business,p_location,action_value,payload));
    ELSIF action_value='query' THEN
      IF is_write THEN alliance_operations.guard_versions(p_business,p_location,payload);END IF;
      IF payload.has('values') AND payload.get('values').is_array THEN
        IF payload.get_string('op') NOT IN('insert','upsert') THEN alliance_security.fail(400,'INVALID_INPUT','Operacion por lote invalida.');END IF;
        arr:=payload.get_array('values');IF arr.get_size<1 OR arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Envia de 1 a 100 registros.');END IF;out_json:=JSON_ARRAY_T();
        FOR i IN 0..arr.get_size-1 LOOP q:=JSON_OBJECT_T(payload.to_clob);q.put('values',arr.get(i));q.put('single','single');value_json:=alliance_pos_store.query(p_user,p_business,p_location,q);out_json.append(value_json.get('value'));END LOOP;r.put('value',out_json);
      ELSE r:=alliance_pos_store.query(p_user,p_business,p_location,payload);END IF;
    ELSIF action_value='getAdminSnapshot' THEN
      -- Service and accounts are independently granted; only permitted arrays return.
      value_json:=alliance_security.context_for(p_user);arr:=value_json.get_object('permissions').get_array(p_location);permission_value:=',';
      FOR i IN 0..arr.get_size-1 LOOP permission_value:=permission_value||arr.get_string(i)||',';END LOOP;
      r:=snapshot(p_business,p_location);IF INSTR(permission_value,',service.read,')=0 OR (INSTR(permission_value,',kitchen.write,')>0 AND INSTR(permission_value,',service.write,')=0 AND INSTR(permission_value,',accounts.read,')=0) THEN out_json:=JSON_ARRAY_T();IF INSTR(permission_value,',kitchen.read,')>0 THEN arr:=r.get_array('requests');FOR i IN 0..arr.get_size-1 LOOP value_json:=TREAT(arr.get(i) AS JSON_OBJECT_T);IF value_json.get_string('request_type')='order' THEN out_json.append(value_json);END IF;END LOOP;END IF;r.put('requests',out_json);END IF;IF (INSTR(permission_value,',accounts.read,')=0 AND INSTR(permission_value,',service.read,')=0) OR (INSTR(permission_value,',kitchen.write,')>0 AND INSTR(permission_value,',service.write,')=0 AND INSTR(permission_value,',accounts.read,')=0) THEN r.put('sessions',JSON_ARRAY_T());END IF;q:=JSON_OBJECT_T();q.put('value',r);r:=q;
    ELSIF action_value IN('remote_bootstrap','get_inventory','status','upsert_inventory','sync_inventory','adjust_inventory','set_inventory_stock','delete_inventory','update_inventory_movement_cost','clear_inventory','clear_inventory_movements') THEN
      value_json:=alliance_pos_store.stock_action(p_user,p_business,p_location,CASE WHEN action_value='remote_bootstrap' THEN 'bootstrap' ELSE action_value END,payload);r.put('value',value_json);
    ELSIF action_value='customer_payment' THEN r.put('value',alliance_customer_payments.collect_payment(p_user,p_business,p_location,payload));
    ELSIF action_value IN('record_sale','edit_sale','delete_sale','clear_income','get_inventory_movements','get_income_report') THEN value_json:=alliance_pos_finance.run_action(p_user,p_business,p_location,action_value,payload);r.put('value',value_json);
    ELSIF action_value IN('createServiceRequest','createServiceRequestsBatch','acknowledgeServiceRequests','resolveBill') THEN
      alliance_security.require_location(p_user,p_business,p_location,'service.write');
      IF action_value='createServiceRequestsBatch' THEN arr:=payload.get_array('requests');ELSE arr:=JSON_ARRAY_T();arr.append(payload);END IF;out_json:=JSON_ARRAY_T();
      FOR i IN 0..arr.get_size-1 LOOP row_json:=TREAT(arr.get(i) AS JSON_OBJECT_T);q:=JSON_OBJECT_T();q.put('table','service_requests');q.put('single','single');q.put('filters',JSON_ARRAY_T());
        IF action_value IN('createServiceRequest','createServiceRequestsBatch') THEN
          value_json:=JSON_OBJECT_T();id_value:=row_json.get_string('request_id');IF id_value IS NULL THEN id_value:=row_json.get_string('id');END IF;value_json.put('id',id_value);value_json.put('table_id',row_json.get_string('table_id'));value_json.put('session_id',row_json.get_string('session_id'));value_json.put('request_type',row_json.get_string('request_type'));value_json.put('message',row_json.get_string('message'));q.put('op','insert');q.put('values',value_json);
        ELSE
          q.put('op','update');value_json:=JSON_OBJECT_T();filters:=JSON_ARRAY_T();f:=JSON_OBJECT_T();f.put('field','id');
          IF action_value='acknowledgeServiceRequests' THEN f.put('op','in');f.put('value',payload.get_array('ids'));value_json.put('status','acknowledged');value_json.put('acknowledged_by_user_id',p_user);value_json.put('acknowledged_at',alliance_pos_store.stamp);q.remove('single');
          ELSE f.put('op','eq');f.put('value',payload.get_string('request_id'));value_json.put('status','resolved');value_json.put('resolved_at',alliance_pos_store.stamp);END IF;filters.append(f);q.put('filters',filters);q.put('values',value_json);
        END IF;
        value_json:=alliance_pos_store.query(p_user,p_business,p_location,q);
        IF action_value='acknowledgeServiceRequests' THEN r:=value_json;EXIT;
        ELSIF action_value='createServiceRequestsBatch' THEN q:=JSON_OBJECT_T();q.put('request',value_json.get('value'));q.put('duplicate',FALSE);out_json.append(q);
        ELSE q:=JSON_OBJECT_T();q.put('request',value_json.get('value'));q.put('duplicate',FALSE);r.put('value',q);END IF;
      END LOOP;IF action_value='createServiceRequestsBatch' THEN value_json:=JSON_OBJECT_T();value_json.put('results',out_json);r.put('value',value_json);END IF;
    ELSIF action_value IN('listChatMessages','sendChatMessage','closeChatSession') THEN
      alliance_security.require_location(p_user,p_business,p_location,'service.read');id_value:=payload.get_string('p_session_id');value_json:=alliance_pos_store.document(p_business,p_location,'table_sessions',id_value);IF value_json IS NULL THEN alliance_security.fail(403,'FORBIDDEN','Cuenta no disponible.');END IF;
      IF action_value='sendChatMessage' THEN
        alliance_security.require_location(p_user,p_business,p_location,'service.write');q:=JSON_OBJECT_T();q.put('id',NVL(payload.get_string('p_message_id'),alliance_security.new_id));q.put('session_id',id_value);q.put('table_id',value_json.get_string('table_id'));q.put('sender_type','staff');q.put('sender_user_id',p_user);SELECT full_name INTO table_value FROM users WHERE id=p_user AND business_id=p_business;q.put('sender_name',table_value);q.put('body',alliance_security.text_value(payload,'p_body',600));q.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(p_business,p_location,'chat_messages',q.get_string('id'),q);value_json:=JSON_OBJECT_T();value_json.put('message',q);
      ELSIF action_value='closeChatSession' THEN alliance_security.require_location(p_user,p_business,p_location,'service.write');DELETE FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value;value_json:=JSON_OBJECT_T('{"closed":true}');
      ELSE out_json:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=p_business AND location_id=p_location AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP out_json.append(JSON_OBJECT_T(x.data_json));END LOOP;value_json:=JSON_OBJECT_T();value_json.put('messages',out_json);END IF;r.put('value',value_json);
    ELSE alliance_security.fail(404,'NOT_FOUND','Accion no disponible.');END IF;
    IF is_write AND action_value<>'operations_apply' THEN alliance_activity.pos_event(p_user,p_business,p_location,action_value,payload);END IF;
    IF is_write THEN alliance_pos_store.put_document(p_business,p_location,'op_reportsync','primary',JSON_OBJECT_T('{}'));END IF;
    IF is_write AND job_id IS NOT NULL THEN save_value:=r.to_clob;INSERT INTO alliance_pos_receipts(business_id,location_id,id,actor_user_id,fingerprint,result_json)VALUES(p_business,p_location,job_id,p_user,digest,save_value);END IF;RETURN r;
  END;
  FUNCTION public_dispatch(p_body JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();payload JSON_OBJECT_T:=p_body.get_object('payload');action_value VARCHAR2(50):=p_body.get_string('action');business_value VARCHAR2(36);location_value VARCHAR2(36);table_id_value VARCHAR2(80);table_json CLOB;table_object JSON_OBJECT_T;arr JSON_ARRAY_T;out_json JSON_ARRAY_T;row_json JSON_OBJECT_T;session_object JSON_OBJECT_T;id_value VARCHAR2(80);body_value VARCHAR2(600);business_slug_value VARCHAR2(80);branch_slug_value VARCHAR2(80);table_code_value VARCHAR2(64);request_object JSON_OBJECT_T;entry JSON_OBJECT_T;product_object JSON_OBJECT_T;duplicate BOOLEAN;
  BEGIN
    alliance_security.keys_only(p_body,'action,payload,business_slug,branch_slug,table_code');
    business_slug_value:=p_body.get_string('business_slug');branch_slug_value:=p_body.get_string('branch_slug');table_code_value:=p_body.get_string('table_code');
    IF action_value='bootstrap' AND table_code_value IS NULL THEN
      BEGIN SELECT l.business_id,l.id INTO business_value,location_value FROM businesses b JOIN locations l ON l.business_id=b.id WHERE b.slug=business_slug_value AND l.slug=branch_slug_value AND l.active=1;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Sucursal no disponible.');END;
      r.put('business',alliance_pos_store.document(business_value,location_value,'business_settings','primary'));r.put('tables',JSON_ARRAY_T());r.put('categories',alliance_pos_store.list_documents(business_value,location_value,'menu_categories'));r.put('items',alliance_pos_store.list_documents(business_value,location_value,'menu_items'));row_json:=JSON_OBJECT_T();row_json.put('value',r);RETURN row_json;
    END IF;
    BEGIN SELECT l.business_id,l.id,d.id,d.data_json INTO business_value,location_value,table_id_value,table_json FROM businesses b JOIN locations l ON l.business_id=b.id AND l.active=1 JOIN alliance_pos_documents d ON d.business_id=l.business_id AND d.location_id=l.id AND d.entity='restaurant_tables' WHERE b.slug=business_slug_value AND l.slug=branch_slug_value AND JSON_VALUE(d.data_json,'$.qr_code')=table_code_value AND JSON_VALUE(d.data_json,'$.is_active')='true';
    EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(403,'TABLE_ACCESS','Escanea el QR vigente de tu mesa.');END;
    table_object:=JSON_OBJECT_T(table_json);
    IF action_value IN('broadcast','getEvents') THEN r:=events(NULL,business_value,location_value,action_value,payload,table_id_value);
    ELSIF action_value='bootstrap' THEN r.put('business',alliance_pos_store.document(business_value,location_value,'business_settings','primary'));arr:=JSON_ARRAY_T();arr.append(table_object);r.put('tables',arr);r.put('categories',alliance_pos_store.list_documents(business_value,location_value,'menu_categories'));r.put('items',alliance_pos_store.list_documents(business_value,location_value,'menu_items'));
    ELSIF action_value IN('getClientTableState','getClientSnapshot') THEN
      alliance_pos_store.lock_scope(business_value,location_value);id_value:=NULL;
      FOR x IN(SELECT id,data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity='table_sessions' AND JSON_VALUE(data_json,'$.table_id')=table_id_value AND JSON_VALUE(data_json,'$.status')='open') LOOP id_value:=x.id;session_object:=JSON_OBJECT_T(x.data_json);END LOOP;
      IF id_value IS NULL AND action_value='getClientTableState' THEN id_value:=alliance_security.new_id;session_object:=JSON_OBJECT_T();session_object.put('id',id_value);session_object.put('table_id',table_id_value);session_object.put('status','open');session_object.put('sale_channel','table');session_object.put('opened_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'table_sessions',id_value,session_object);alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_ACCOUNT_OPEN','Abrió una cuenta desde '||table_object.get_string('table_name'),id_value);END IF;
      IF session_object IS NULL THEN r.put_null('session');ELSE r.put('session',session_object);END IF;arr:=JSON_ARRAY_T();out_json:=JSON_ARRAY_T();
      FOR x IN(SELECT entity,data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity IN('session_items','service_requests') AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP IF x.entity='session_items' THEN arr.append(JSON_OBJECT_T(x.data_json));ELSE out_json.append(JSON_OBJECT_T(x.data_json));END IF;END LOOP;r.put('sessionItems',arr);r.put('requests',out_json);
    ELSE
      alliance_pos_store.lock_scope(business_value,location_value);
      id_value:=NVL(payload.get_string('p_session_id'),payload.get_string('session_id'));
      session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
      IF action_value IN('createServiceRequest','createServiceRequestsBatch') THEN
        IF action_value='createServiceRequestsBatch' THEN arr:=payload.get_array('requests');ELSE arr:=JSON_ARRAY_T();arr.append(payload);END IF;
        IF arr IS NULL OR arr.get_size>20 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiadas solicitudes.');END IF;out_json:=JSON_ARRAY_T();
        FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);id_value:=entry.get_string('session_id');session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
          IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','La cuenta no pertenece a tu mesa o esta cerrada.');END IF;
          IF entry.get_string('request_type') NOT IN('waiter','bill','other','chat','song') THEN alliance_security.fail(400,'INVALID_INPUT','Solicitud invalida.');END IF;
          request_object:=alliance_pos_store.document(business_value,location_value,'service_requests',entry.get_string('request_id'));duplicate:=request_object IS NOT NULL;
          IF NOT duplicate THEN request_object:=JSON_OBJECT_T();request_object.put('id',alliance_security.text_value(entry,'request_id',80));request_object.put('session_id',id_value);request_object.put('table_id',table_id_value);request_object.put('request_type',entry.get_string('request_type'));request_object.put('message',SUBSTR(entry.get_string('message'),1,600));request_object.put('status','pending');request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'service_requests',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'service','CLIENT_REQUEST','Solicitó atención en '||table_object.get_string('table_name'),request_object.get_string('id'));END IF;
          row_json:=JSON_OBJECT_T();row_json.put('request',request_object);row_json.put('duplicate',duplicate);out_json.append(row_json);
        END LOOP;IF action_value='createServiceRequestsBatch' THEN r.put('results',out_json);ELSE r:=TREAT(out_json.get(0) AS JSON_OBJECT_T);END IF;
      ELSIF action_value='resolveBill' THEN
        request_object:=alliance_pos_store.document(business_value,location_value,'service_requests',payload.get_string('request_id'));
        IF request_object IS NULL OR request_object.get_string('table_id')<>table_id_value OR request_object.get_string('request_type')<>'bill' THEN alliance_security.fail(403,'TABLE_ACCESS','Solicitud no disponible.');END IF;IF request_object.get_string('status')<>'resolved' THEN alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_BILL_RESOLVE','Resolvió una solicitud de cuenta en '||table_object.get_string('table_name'),request_object.get_string('id'));END IF;request_object.put('status','resolved');request_object.put('resolved_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'service_requests',request_object.get_string('id'),request_object);r.put('request',request_object);
      ELSIF action_value IN('sendChatMessage','listChatMessages') THEN
        IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible.');END IF;
        IF action_value='sendChatMessage' THEN request_object:=JSON_OBJECT_T();request_object.put('id',alliance_security.text_value(payload,'p_message_id',80));request_object.put('session_id',id_value);request_object.put('table_id',table_id_value);request_object.put('sender_type','client');request_object.put('sender_name','Cliente');request_object.put('body',alliance_security.text_value(payload,'p_body',600));request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'chat_messages',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'service','CLIENT_CHAT','Envió un mensaje desde '||table_object.get_string('table_name'),request_object.get_string('id'));r.put('message',request_object);
        ELSE arr:=JSON_ARRAY_T();FOR x IN(SELECT data_json FROM alliance_pos_documents WHERE business_id=business_value AND location_id=location_value AND entity='chat_messages' AND JSON_VALUE(data_json,'$.session_id')=id_value ORDER BY created_at,id) LOOP arr.append(JSON_OBJECT_T(x.data_json));END LOOP;r.put('messages',arr);END IF;
      ELSIF action_value='query' AND payload.get_string('table')='session_items' AND payload.get_string('op')='insert' THEN
        entry:=payload.get_object('values');id_value:=entry.get_string('session_id');session_object:=alliance_pos_store.document(business_value,location_value,'table_sessions',id_value);
        IF session_object IS NULL OR session_object.get_string('table_id')<>table_id_value OR session_object.get_string('status')<>'open' THEN alliance_security.fail(403,'TABLE_ACCESS','Cuenta no disponible.');END IF;
        product_object:=alliance_pos_store.document(business_value,location_value,'menu_items',entry.get_string('menu_item_id'));
        IF product_object IS NULL OR NOT product_object.get_boolean('is_available') OR entry.get_number('quantity') IS NULL OR entry.get_number('quantity')<=0 OR entry.get_number('quantity')>100 THEN alliance_security.fail(400,'INVALID_INPUT','Producto no disponible o cantidad invalida.');END IF;
        request_object:=JSON_OBJECT_T();request_object.put('id',NVL(entry.get_string('id'),alliance_security.new_id));request_object.put('session_id',id_value);request_object.put('menu_item_id',product_object.get_string('id'));request_object.put('item_name',product_object.get_string('name'));request_object.put('unit_price',product_object.get_number('price'));request_object.put('quantity',entry.get_number('quantity'));request_object.put('status','pending');request_object.put('created_at',alliance_pos_store.stamp);alliance_pos_store.put_document(business_value,location_value,'session_items',request_object.get_string('id'),request_object);alliance_activity.record_event(NULL,business_value,location_value,'accounts','CLIENT_ITEM_ADD','Agregó un producto a su cuenta: '||product_object.get_string('name'),request_object.get_string('id'));r:=request_object;
      ELSE alliance_security.fail(403,'TABLE_ACCESS','Operacion no autorizada para clientes.');END IF;
    END IF;
    row_json:=JSON_OBJECT_T();row_json.put('value',r);RETURN row_json;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_pos_batch AUTHID DEFINER AS
  FUNCTION dispatch(u VARCHAR2,b VARCHAR2,l VARCHAR2,p JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_pos_batch AS
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
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_administration AUTHID DEFINER AS
  FUNCTION setup(p_body JSON_OBJECT_T,p_token VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION overview(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION profile(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE save_profile(p_user VARCHAR2,p_business VARCHAR2,p_session VARCHAR2,p_body JSON_OBJECT_T);
  PROCEDURE save_location(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T);
  PROCEDURE save_user(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T,p_location VARCHAR2 DEFAULT NULL);
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_administration AS
  PROCEDURE check_location(p_body JSON_OBJECT_T) IS v VARCHAR2(160);n NUMBER;
  BEGIN
    alliance_security.keys_only(p_body,'slug,name,color,active');
    v:=alliance_security.text_value(p_body,'slug',80,'^[a-z0-9-]{3,80}$');v:=alliance_security.text_value(p_body,'name',160);v:=alliance_security.text_value(p_body,'color',7,'^#[0-9a-fA-F]{6}$');n:=alliance_security.flag(p_body,'active');
  END;
  FUNCTION contains_code(pa JSON_ARRAY_T,code VARCHAR2) RETURN BOOLEAN IS
  BEGIN IF pa IS NULL THEN RETURN FALSE;END IF;FOR i IN 0..pa.get_size-1 LOOP IF pa.get_string(i)=code THEN RETURN TRUE;END IF;END LOOP;RETURN FALSE;END;
  FUNCTION manages(perms JSON_OBJECT_T,loc VARCHAR2) RETURN BOOLEAN IS
  BEGIN IF NOT perms.has(loc) THEN RETURN FALSE;END IF;RETURN contains_code(perms.get_array(loc),'administration.manage');END;
  PROCEDURE lock_business(p_user VARCHAR2,p_business VARCHAR2) IS v VARCHAR2(36);
  BEGIN
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','No tienes permiso para gestionar usuarios.');END IF;
    SELECT id INTO v FROM businesses WHERE id=p_business FOR UPDATE;
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Tu acceso cambio.');END IF;
  END;
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_entity VARCHAR2,p_before CLOB,p_after CLOB) IS
  BEGIN INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,p_action,p_entity,p_before,p_after);END;
  FUNCTION location_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();x locations%ROWTYPE;
  BEGIN SELECT * INTO x FROM locations WHERE id=p_id AND business_id=p_business;
    r.put('id',x.id);r.put('business_id',x.business_id);r.put('slug',x.slug);r.put('name',x.name);r.put('color',x.color);r.put('active',x.active=1);RETURN r;
  END;
  FUNCTION user_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;roles_json JSON_ARRAY_T;overrides_json JSON_OBJECT_T;x users%ROWTYPE;
  BEGIN SELECT * INTO x FROM users WHERE id=p_id AND business_id=p_business;
    r.put('id',x.id);r.put('name',x.full_name);r.put('username',x.username);r.put('active',x.active=1);r.put('protected',alliance_security.owner(p_id,p_business));
    FOR l IN (SELECT DISTINCT location_id FROM user_location_roles WHERE business_id=p_business AND user_id=p_id ORDER BY location_id) LOOP
      entry:=JSON_OBJECT_T();roles_json:=JSON_ARRAY_T();overrides_json:=JSON_OBJECT_T();
      FOR g IN (SELECT role_code FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND location_id=l.location_id ORDER BY role_code) LOOP roles_json.append(g.role_code);END LOOP;
      FOR o IN (SELECT permission_code,effect FROM user_location_permissions WHERE business_id=p_business AND user_id=p_id AND location_id=l.location_id ORDER BY permission_code) LOOP overrides_json.put(o.permission_code,o.effect);END LOOP;
      entry.put('location_id',l.location_id);entry.put('roles',roles_json);entry.put('overrides',overrides_json);a.append(entry);
    END LOOP;
    r.put('access',a);
    FOR h IN(SELECT h.actor_user_id,h.before_json,u.full_name,TO_CHAR(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') at_value FROM administration_audit h LEFT JOIN users u ON u.id=h.actor_user_id AND u.business_id=h.business_id WHERE h.business_id=p_business AND h.entity_id=p_id AND h.action='USER_ACCESS_SAVE' ORDER BY h.created_at,h.id)LOOP
     IF h.before_json IS NULL AND NOT r.has('createdBy') THEN r.put('createdBy',h.actor_user_id);r.put('createdByName',h.full_name);r.put('createdAt',h.at_value);END IF;
     r.put('updatedBy',h.actor_user_id);r.put('updatedByName',h.full_name);r.put('updatedAt',h.at_value);
    END LOOP;RETURN r;
  END;
  FUNCTION profile(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM users WHERE id=p_user AND business_id=p_business AND active=1;
    IF n<>1 THEN alliance_security.fail(401,'UNAUTHORIZED','Usuario no disponible.');END IF;
    RETURN user_json(p_user,p_business);
  END;
  PROCEDURE save_profile(p_user VARCHAR2,p_business VARCHAR2,p_session VARCHAR2,p_body JSON_OBJECT_T) IS
    locked_id VARCHAR2(36);name_value VARCHAR2(160);username_value users.username%TYPE;password_value VARCHAR2(128);hash_value VARCHAR2(512);before_value CLOB;safe_body JSON_OBJECT_T;n NUMBER;
  BEGIN
    alliance_security.keys_only(p_body,'name,username,password');
    SELECT id INTO locked_id FROM businesses WHERE id=p_business FOR UPDATE;
    SELECT COUNT(*) INTO n FROM users WHERE id=p_user AND business_id=p_business AND active=1;
    IF n<>1 THEN alliance_security.fail(401,'UNAUTHORIZED','Usuario no disponible.');END IF;
    before_value:=user_json(p_user,p_business).to_clob;
    name_value:=alliance_security.text_value(p_body,'name',160);username_value:=alliance_security.text_value(p_body,'username',320);
    IF p_body.has('password') THEN
      password_value:=alliance_security.text_value(p_body,'password',128);
      IF LENGTH(password_value)<4 OR LENGTH(password_value)>12 THEN alliance_security.fail(400,'INVALID_PASSWORD','Usa una contrasena de 4 a 12 caracteres.');END IF;
      hash_value:=alliance_security.password_hash(password_value);
    END IF;
    UPDATE users SET full_name=name_value,username=username_value,password_hash=NVL(hash_value,password_hash) WHERE id=p_user AND business_id=p_business AND active=1;
    IF hash_value IS NOT NULL THEN
      UPDATE auth_sessions SET revoked=1 WHERE business_id=p_business AND user_id=p_user;
      UPDATE alliance_api_sessions SET revoked=1 WHERE business_id=p_business AND user_id=p_user AND id<>p_session;
    END IF;
    safe_body:=JSON_OBJECT_T(p_body.to_clob);safe_body.remove('password');safe_body.put('password_changed',hash_value IS NOT NULL);
    audit(p_user,p_business,'USER_PROFILE_SAVE',p_user,before_value,safe_body.to_clob);
  END;
  FUNCTION setup(p_body JSON_OBJECT_T,p_token VARCHAR2) RETURN JSON_OBJECT_T IS
    b VARCHAR2(36):=alliance_security.new_id;u VARCHAR2(36):=alliance_security.new_id;l VARCHAR2(36);n NUMBER;dummy NUMBER;secret_hash VARCHAR2(64);hash_value VARCHAR2(512);
    slug_value VARCHAR2(80);business_name VARCHAR2(160);name_value VARCHAR2(160);username_value users.username%TYPE;password_value VARCHAR2(128);arr JSON_ARRAY_T;entry JSON_OBJECT_T;active_count NUMBER:=0;
    location_slug VARCHAR2(80);location_name VARCHAR2(160);location_color VARCHAR2(7);location_active NUMBER;
  BEGIN
    BEGIN SELECT setup_hash INTO secret_hash FROM alliance_api_settings WHERE id=1 AND enabled=1;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(503,'SETUP_UNAVAILABLE','Falta habilitar la instalacion.');END;
    IF p_token IS NULL OR alliance_security.hash_text(p_token)<>secret_hash THEN alliance_security.fail(403,'FORBIDDEN','La configuracion requiere el token de instalacion.');END IF;
    alliance_security.throttle('setup',5);alliance_security.keys_only(p_body,'slug,business_name,name,username,password,locations,location_name');
    slug_value:=alliance_security.text_value(p_body,'slug',80,'^[a-z0-9-]{3,80}$');business_name:=alliance_security.text_value(p_body,'business_name',160);
    name_value:=alliance_security.text_value(p_body,'name',160);username_value:=alliance_security.text_value(p_body,'username',320);password_value:=alliance_security.text_value(p_body,'password',128);
    IF NOT p_body.has('locations') OR p_body.has('location_name') THEN alliance_security.fail(400,'INVALID_INPUT','Define la lista de sucursales.');END IF;
    arr:=p_body.get_array('locations');IF arr.get_size<1 OR arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Define de 1 a 100 sucursales.');END IF;
    FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);check_location(entry);active_count:=active_count+alliance_security.flag(entry,'active');END LOOP;
    IF active_count=0 THEN alliance_security.fail(400,'INVALID_INPUT','Habilita al menos una sucursal.');END IF;
    SELECT id INTO dummy FROM setup_lock WHERE id=1 FOR UPDATE;
    SELECT COUNT(*) INTO n FROM businesses;IF n>0 THEN alliance_security.fail(409,'SETUP_COMPLETE','La configuracion inicial ya fue realizada.');END IF;
    IF LENGTH(password_value)<12 THEN alliance_security.fail(400,'INVALID_PASSWORD','Usa una contrasena de 12 a 128 caracteres.');END IF;hash_value:=alliance_security.password_hash(password_value);
    INSERT INTO businesses(id,slug,name,settings) VALUES(b,slug_value,business_name,'{"currency":"COP","locale":"es-CO","allow_negative_stock":false}');
    INSERT INTO users(id,business_id,username,full_name,password_hash) VALUES(u,b,username_value,name_value,hash_value);
    FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);l:=alliance_security.new_id;
      location_slug:=entry.get_string('slug');location_name:=entry.get_string('name');location_color:=entry.get_string('color');location_active:=alliance_security.flag(entry,'active');
      INSERT INTO locations(id,business_id,slug,name,color,active) VALUES(l,b,location_slug,location_name,location_color,location_active);
      INSERT INTO user_location_roles VALUES(b,u,l,'OWNER');IF location_active=1 THEN alliance_pos.initialize(b,l);END IF;
    END LOOP;
    RETURN alliance_security.context_for(u);
  END;
  FUNCTION overview(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();ls JSON_ARRAY_T:=JSON_ARRAY_T();us JSON_ARRAY_T:=JSON_ARRAY_T();rs JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;pa JSON_ARRAY_T;ctx JSON_OBJECT_T;perms JSON_OBJECT_T;aa JSON_ARRAY_T;visible_access JSON_ARRAY_T;grant_entry JSON_OBJECT_T;
  BEGIN
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','No tienes permiso para gestionar usuarios.');END IF;
    ctx:=alliance_security.context_for(p_user);perms:=ctx.get_object('permissions');
    FOR l IN (SELECT id FROM locations WHERE business_id=p_business ORDER BY name) LOOP IF manages(perms,l.id) THEN ls.append(location_json(l.id,p_business));END IF;END LOOP;
    FOR u IN (SELECT id FROM users WHERE business_id=p_business ORDER BY full_name) LOOP entry:=user_json(u.id,p_business);aa:=entry.get_array('access');visible_access:=JSON_ARRAY_T();FOR i IN 0..aa.get_size-1 LOOP grant_entry:=TREAT(aa.get(i) AS JSON_OBJECT_T);IF manages(perms,grant_entry.get_string('location_id')) THEN visible_access.append(grant_entry);END IF;END LOOP;IF visible_access.get_size>0 OR alliance_security.owner(p_user,p_business) THEN entry.put('access',visible_access);us.append(entry);END IF;END LOOP;
    FOR role_row IN (SELECT code,name FROM roles ORDER BY code) LOOP entry:=JSON_OBJECT_T();pa:=JSON_ARRAY_T();
      FOR p IN (SELECT permission_code FROM role_permissions WHERE role_code=role_row.code ORDER BY permission_code) LOOP pa.append(p.permission_code);END LOOP;
      entry.put('code',role_row.code);entry.put('name',role_row.name);entry.put('permissions',pa);rs.append(entry);
    END LOOP;
    r.put('locations',ls);r.put('users',us);r.put('roles',rs);
    r.put('sections',JSON_ARRAY_T('[{"code":"home.read","name":"Inicio"},{"code":"products.read","name":"Consultar catálogo"},{"code":"products.write","name":"Crear y editar productos"},{"code":"inventory.read","name":"Consultar inventario"},{"code":"locations.read","name":"Ver sucursales"},{"code":"activity.read","name":"Actividad del dispositivo"},{"code":"service.read","name":"Atender mesas"},{"code":"service.write","name":"Registrar consumos y solicitudes"},{"code":"accounts.read","name":"Consultar cuentas"},{"code":"sales.read","name":"Consultar ventas y propinas"},{"code":"sales.write","name":"Cobrar cuentas"},{"code":"inventory.write","name":"Modificar existencias y compras"},{"code":"movements.read","name":"Consultar movimientos"},{"code":"tables.manage","name":"Administrar mesas"},{"code":"brand.manage","name":"Configurar marca"},{"code":"assistant.read","name":"Asistente"},{"code":"supplies.read","name":"Consultar compras y proveedores"},{"code":"supplies.write","name":"Registrar compras y proveedores"},{"code":"kitchen.read","name":"Consultar comandas"},{"code":"kitchen.write","name":"Preparar comandas"},{"code":"customers.read","name":"Consultar clientes y cartera"},{"code":"customers.write","name":"Registrar clientes"},{"code":"cash.read","name":"Consultar caja"},{"code":"cash.write","name":"Abrir, mover y cerrar caja"}]'));RETURN r;
  END;
  PROCEDURE save_location(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T) IS
    entity VARCHAR2(36):=NVL(p_id,alliance_security.new_id);before_value CLOB;n NUMBER;slug_value VARCHAR2(80);name_value VARCHAR2(160);color_value VARCHAR2(7);active_value NUMBER;
  BEGIN
    IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe principal administra sucursales.');END IF;lock_business(p_user,p_business);check_location(p_body);
    IF p_id IS NOT NULL THEN BEGIN before_value:=location_json(p_id,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Sucursal no disponible.');END;END IF;
    slug_value:=p_body.get_string('slug');name_value:=p_body.get_string('name');color_value:=p_body.get_string('color');active_value:=alliance_security.flag(p_body,'active');
    SELECT COUNT(*) INTO n FROM locations WHERE business_id=p_business AND active=1 AND id<>entity;
    IF active_value=0 AND n=0 THEN alliance_security.fail(409,'LAST_LOCATION','Conserva al menos una sucursal habilitada.');END IF;
    IF p_id IS NULL THEN INSERT INTO locations(id,business_id,slug,name,color,active) VALUES(entity,p_business,slug_value,name_value,color_value,active_value);
    ELSE UPDATE locations SET slug=slug_value,name=name_value,color=color_value,active=active_value WHERE id=entity AND business_id=p_business;END IF;
    IF p_id IS NULL AND active_value=1 THEN alliance_pos.initialize(p_business,entity);END IF;
    audit(p_user,p_business,'LOCATION_SAVE',entity,before_value,p_body.to_clob);
  END;
  PROCEDURE save_user(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T,p_location VARCHAR2 DEFAULT NULL) IS
    entity VARCHAR2(36):=NVL(p_id,alliance_security.new_id);before_value CLOB;safe_body JSON_OBJECT_T;hash_value VARCHAR2(512);password_value VARCHAR2(128);n NUMBER;
    arr JSON_ARRAY_T;entry JSON_OBJECT_T;role_array JSON_ARRAY_T;overrides_json JSON_OBJECT_T;override_keys JSON_KEY_LIST;location_value VARCHAR2(36);role_value VARCHAR2(40);effect_value VARCHAR2(5);seen JSON_OBJECT_T:=JSON_OBJECT_T();permissions_json JSON_OBJECT_T;ctx JSON_OBJECT_T;
    name_value VARCHAR2(160);username_value users.username%TYPE;active_value NUMBER;actor_perms JSON_OBJECT_T;actor_array JSON_ARRAY_T;
  BEGIN
    lock_business(p_user,p_business);alliance_security.keys_only(p_body,'name,username,active,password,access');ctx:=alliance_security.context_for(p_user);actor_perms:=ctx.get_object('permissions');
    IF p_location IS NOT NULL THEN
      alliance_security.require_location(p_user,p_business,p_location,'administration.manage');
      IF p_id IS NOT NULL THEN SELECT COUNT(*) INTO n FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND location_id=p_location;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Este usuario no pertenece al negocio abierto.');END IF;END IF;
    END IF;
    IF p_id IS NOT NULL THEN
      BEGIN before_value:=user_json(p_id,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Usuario no disponible.');END;
      IF alliance_security.owner(p_id,p_business) THEN alliance_security.fail(409,'PROTECTED_OWNER','La cuenta del propietario esta protegida.');END IF;
      FOR old_grant IN(SELECT location_id,role_code FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND (p_location IS NULL OR location_id=p_location))LOOP
       IF NOT manages(actor_perms,old_grant.location_id) OR (old_grant.role_code='BOSS' AND NOT alliance_security.location_owner(p_user,p_business,old_grant.location_id)) THEN alliance_security.fail(403,'FORBIDDEN','Este usuario tiene accesos que solo otro jefe puede gestionar.');END IF;
      END LOOP;
    END IF;
    name_value:=alliance_security.text_value(p_body,'name',160);username_value:=alliance_security.text_value(p_body,'username',320);active_value:=alliance_security.flag(p_body,'active');
    IF p_body.has('password') THEN password_value:=alliance_security.text_value(p_body,'password',128);IF LENGTH(password_value)<4 OR LENGTH(password_value)>12 THEN alliance_security.fail(400,'INVALID_PASSWORD','Usa una contrasena de 4 a 12 caracteres.');END IF;hash_value:=alliance_security.password_hash(password_value);END IF;
    IF p_id IS NULL AND hash_value IS NULL THEN alliance_security.fail(400,'PASSWORD_REQUIRED','Define la contrasena del nuevo usuario.');END IF;
    arr:=p_body.get_array('access');IF arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiadas sucursales.');END IF;
    IF p_location IS NOT NULL AND p_id IS NULL AND arr.get_size<>1 THEN alliance_security.fail(403,'FORBIDDEN','El nuevo usuario debe tener acceso al negocio abierto.');END IF;
    IF p_id IS NULL THEN INSERT INTO users(id,business_id,username,full_name,password_hash,active) VALUES(entity,p_business,username_value,name_value,hash_value,active_value);
    ELSE UPDATE users SET full_name=name_value,username=username_value,active=active_value,password_hash=NVL(hash_value,password_hash) WHERE id=entity AND business_id=p_business;END IF;
    DELETE FROM user_location_permissions WHERE business_id=p_business AND user_id=entity AND (p_location IS NULL OR location_id=p_location);
    DELETE FROM user_location_roles WHERE business_id=p_business AND user_id=entity AND (p_location IS NULL OR location_id=p_location);
    FOR i IN 0..arr.get_size-1 LOOP
      entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(entry,'location_id,roles,overrides');location_value:=alliance_security.text_value(entry,'location_id',36);
      IF p_location IS NOT NULL AND location_value<>p_location THEN alliance_security.fail(403,'FORBIDDEN','Solo puedes gestionar usuarios del negocio abierto.');END IF;
       IF seen.has(location_value) THEN alliance_security.fail(400,'INVALID_INPUT','Cada sucursal debe aparecer una sola vez.');END IF;seen.put(location_value,TRUE);
      SELECT COUNT(*) INTO n FROM locations WHERE id=location_value AND business_id=p_business;IF n<>1 THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible en este negocio.');END IF;
      IF NOT manages(actor_perms,location_value) THEN alliance_security.fail(403,'FORBIDDEN','No puedes gestionar usuarios de ese negocio.');END IF;actor_array:=actor_perms.get_array(location_value);
      role_array:=entry.get_array('roles');IF role_array.get_size<1 OR role_array.get_size>7 THEN alliance_security.fail(400,'INVALID_INPUT','Selecciona un rol.');END IF;
      FOR j IN 0..role_array.get_size-1 LOOP role_value:=role_array.get_string(j);
        IF role_value IS NULL OR role_value NOT IN ('BOSS','WORKER','ADMIN','MANAGER','CASHIER','WAITER','KITCHEN','INVENTORY_MANAGER','ACCOUNTING') THEN alliance_security.fail(403,'FORBIDDEN','Rol no permitido.');END IF;
        IF role_value='BOSS' AND NOT alliance_security.location_owner(p_user,p_business,location_value) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede asignar otro jefe.');END IF;
        BEGIN INSERT INTO user_location_roles VALUES(p_business,entity,location_value,role_value);EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;END;
      END LOOP;
      overrides_json:=entry.get_object('overrides');override_keys:=overrides_json.get_keys;
      FOR j IN 1..override_keys.COUNT LOOP
        SELECT COUNT(*) INTO n FROM permissions WHERE code=override_keys(j) AND code<>'sales.manage';IF n<>1 THEN alliance_security.fail(400,'INVALID_INPUT','Permiso no permitido.');END IF;
        effect_value:=overrides_json.get_string(override_keys(j));IF effect_value NOT IN ('ALLOW','DENY') OR effect_value IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Efecto no permitido.');END IF;
        INSERT INTO user_location_permissions VALUES(p_business,entity,location_value,override_keys(j),effect_value);
      END LOOP;
      IF NOT alliance_security.location_owner(p_user,p_business,location_value) THEN
       FOR target_permission IN(SELECT p.code FROM permissions p WHERE p.code<>'sales.manage' AND (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code=p.code) OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code=p.code AND o.effect='ALLOW')) AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code=p.code AND o.effect='DENY')) LOOP
        IF NOT contains_code(actor_array,target_permission.code) THEN alliance_security.fail(403,'FORBIDDEN','Solo puedes asignar los permisos que tienes en este negocio.');END IF;
       END LOOP;
      END IF;
      -- Enforce the read dependency even when this employee is inactive.
      SELECT COUNT(*) INTO n FROM (
        SELECT 'products.write' p FROM dual WHERE
          (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code='products.write')
           OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.write' AND effect='ALLOW'))
          AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.write' AND effect='DENY')
      );
      IF n>0 THEN
        SELECT COUNT(*) INTO n FROM dual WHERE
          (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code='products.read')
           OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.read' AND effect='ALLOW'))
          AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.read' AND effect='DENY');
        IF n=0 THEN alliance_security.fail(400,'INVALID_INPUT','Editar productos requiere consultar el catalogo.');END IF;
      END IF;
    END LOOP;
    UPDATE auth_sessions SET revoked=1 WHERE business_id=p_business AND user_id=entity;
    UPDATE alliance_api_sessions SET revoked=1 WHERE business_id=p_business AND user_id=entity;
    safe_body:=JSON_OBJECT_T(p_body.to_clob);safe_body.remove('password');safe_body.put('password_changed',hash_value IS NOT NULL);
    audit(p_user,p_business,'USER_ACCESS_SAVE',entity,before_value,safe_body.to_clob);
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_catalog AUTHID DEFINER AS
  FUNCTION product_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION bootstrap(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE register_device(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T);
  FUNCTION apply_operation(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_operation JSON_OBJECT_T) RETURN JSON_OBJECT_T;
  FUNCTION changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_cursor NUMBER) RETURN JSON_OBJECT_T;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_catalog AS
  FUNCTION product_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();x products%ROWTYPE;category_value VARCHAR2(80);timestamp_value VARCHAR2(40);
  BEGIN
    SELECT * INTO x FROM products WHERE id=p_id AND business_id=p_business;SELECT name INTO category_value FROM product_categories WHERE id=x.category_id AND business_id=p_business;
    timestamp_value:=TO_CHAR(SYS_EXTRACT_UTC(x.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"');
    r.put('id',x.id);r.put('business_id',x.business_id);r.put('name',x.name);r.put('sku',x.sku);r.put('category',category_value);r.put('price_minor',TO_CHAR(x.price_minor,'FM999999999999999999'));
    r.put('kind',x.kind);r.put('unit_id',x.unit_id);r.put('active',x.active=1);r.put('version',x.version);r.put('updated_at',timestamp_value);RETURN r;
  END;
  FUNCTION bootstrap(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();products_json JSON_ARRAY_T:=JSON_ARRAY_T();ingredients_json JSON_ARRAY_T:=JSON_ARRAY_T();units_json JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;
    ctx JSON_OBJECT_T;ls JSON_ARRAY_T;l JSON_OBJECT_T;loc locations%ROWTYPE;inventory_allowed BOOLEAN:=TRUE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');
    SELECT * INTO loc FROM locations WHERE id=p_location AND business_id=p_business;
    l:=JSON_OBJECT_T();l.put('id',loc.id);l.put('business_id',loc.business_id);l.put('slug',loc.slug);l.put('name',loc.name);l.put('color',loc.color);l.put('active',loc.active=1);
    FOR p IN (SELECT id FROM products WHERE business_id=p_business ORDER BY name) LOOP products_json.append(product_json(p.id,p_business));END LOOP;
    BEGIN alliance_security.require_location(p_user,p_business,p_location,'inventory.read');EXCEPTION WHEN OTHERS THEN IF SQLCODE=-20001 THEN inventory_allowed:=FALSE;ELSE RAISE;END IF;END;
    IF inventory_allowed THEN FOR i IN (SELECT * FROM ingredients WHERE business_id=p_business ORDER BY name) LOOP entry:=JSON_OBJECT_T();entry.put('id',i.id);entry.put('name',i.name);entry.put('unit_id',i.unit_id);entry.put('cost_minor',TO_CHAR(i.cost_minor,'FM999999999999999999'));ingredients_json.append(entry);END LOOP;END IF;
    FOR u IN (SELECT * FROM units_of_measure ORDER BY id) LOOP entry:=JSON_OBJECT_T();entry.put('id',u.id);entry.put('name',u.name);entry.put('dimension',u.dimension);entry.put('factor',TO_CHAR(u.factor,'TM9','NLS_NUMERIC_CHARACTERS=''.,'''));units_json.append(entry);END LOOP;
    r.put('location',l);r.put('products',products_json);r.put('ingredients',ingredients_json);r.put('units',units_json);r.put('cursor',loc.change_cursor);RETURN r;
  END;
  PROCEDURE register_device(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_body JSON_OBJECT_T) IS id_value VARCHAR2(36);name_value VARCHAR2(120);d devices%ROWTYPE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');alliance_security.keys_only(p_body,'id,name');
    id_value:=alliance_security.text_value(p_body,'id',36,'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');name_value:=alliance_security.text_value(p_body,'name',120);
    BEGIN
      SELECT * INTO d FROM devices WHERE id=id_value FOR UPDATE;
      IF d.business_id<>p_business OR d.location_id<>p_location OR d.user_id<>p_user THEN alliance_security.fail(403,'FORBIDDEN','Este dispositivo pertenece a otro usuario o sucursal.');END IF;
      UPDATE devices SET name=name_value,last_seen=SYSTIMESTAMP WHERE id=id_value;
    EXCEPTION WHEN NO_DATA_FOUND THEN INSERT INTO devices(id,business_id,location_id,user_id,name,app_version) VALUES(id_value,p_business,p_location,p_user,name_value,'0.3.0');END;
  END;
  FUNCTION apply_operation(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_operation JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    ack JSON_OBJECT_T:=JSON_OBJECT_T();body JSON_OBJECT_T;operation_value VARCHAR2(36);key_value VARCHAR2(36);device_value VARCHAR2(36);entity_value VARCHAR2(36);hash_value VARCHAR2(64);previous_hash VARCHAR2(64);previous_operation VARCHAR2(36);saved_result CLOB;
    before_json CLOB;product_value JSON_OBJECT_T;product_clob CLOB;operation_clob CLOB;ack_clob CLOB;n NUMBER;version_value NUMBER:=0;base_value NUMBER;status_value VARCHAR2(24):='SYNCED';category_value VARCHAR2(36);name_value VARCHAR2(160);sku_value VARCHAR2(64);category_name VARCHAR2(80);price_value VARCHAR2(18);kind_value VARCHAR2(12);unit_value VARCHAR2(12);active_value NUMBER;created_value VARCHAR2(40);created_time TIMESTAMP WITH TIME ZONE;dummy VARCHAR2(36);
    FUNCTION ident(k VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN alliance_security.text_value(p_operation,k,36,'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');END;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.write');alliance_security.require_location(p_user,p_business,p_location,'products.read');
    alliance_security.keys_only(p_operation,'operation_id,idempotency_key,device_id,business_id,location_id,entity_type,entity_id,operation_type,payload,base_version,client_created_at');
    operation_value:=ident('operation_id');key_value:=ident('idempotency_key');device_value:=ident('device_id');entity_value:=ident('entity_id');
    IF ident('business_id')<>p_business OR ident('location_id')<>p_location THEN alliance_security.fail(403,'FORBIDDEN','La operacion pertenece a otro negocio o sucursal.');END IF;
    IF alliance_security.text_value(p_operation,'entity_type',7)<>'PRODUCT' OR alliance_security.text_value(p_operation,'operation_type',14)<>'PRODUCT_UPSERT' THEN alliance_security.fail(400,'INVALID_INPUT','Operacion no disponible.');END IF;
    base_value:=p_operation.get_number('base_version');IF base_value IS NULL OR base_value<0 OR base_value<>TRUNC(base_value) OR base_value>9999999998 THEN alliance_security.fail(400,'INVALID_INPUT','Version invalida.');END IF;
    body:=p_operation.get_object('payload');alliance_security.keys_only(body,'name,sku,category,price_minor,kind,unit_id,active');
    name_value:=alliance_security.text_value(body,'name',160);sku_value:=alliance_security.text_value(body,'sku',64);category_name:=alliance_security.text_value(body,'category',80);
    price_value:=alliance_security.text_value(body,'price_minor',18,'^(0|[1-9][0-9]{0,17})$');kind_value:=alliance_security.text_value(body,'kind',12,'^(SIMPLE|PREPARED|WEIGHT|VOLUME)$');unit_value:=alliance_security.text_value(body,'unit_id',12);active_value:=alliance_security.flag(body,'active');
    created_value:=alliance_security.text_value(p_operation,'client_created_at',40,'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$');
    IF INSTR(created_value,'.')=0 THEN created_value:=REPLACE(created_value,'Z','.000Z');END IF;
    created_time:=FROM_TZ(TO_TIMESTAMP(REPLACE(created_value,'Z',''),'YYYY-MM-DD"T"HH24:MI:SS.FF'),'UTC');
    SELECT COUNT(*) INTO n FROM devices WHERE id=device_value AND business_id=p_business AND location_id=p_location AND user_id=p_user;IF n<>1 THEN alliance_security.fail(403,'FORBIDDEN','Registra el dispositivo de esta sucursal.');END IF;
    -- Serialize all catalog writes per business, including first creation.
    SELECT id INTO dummy FROM businesses WHERE id=p_business FOR UPDATE;
    alliance_security.require_location(p_user,p_business,p_location,'products.write');
    hash_value:=LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(p_operation.to_clob,DBMS_CRYPTO.HASH_SH256)));
    BEGIN
      SELECT payload_hash,result,operation_id INTO previous_hash,saved_result,previous_operation FROM sync_operations WHERE business_id=p_business AND (operation_id=operation_value OR idempotency_key=key_value);
      IF previous_hash<>hash_value OR previous_operation<>operation_value THEN alliance_security.fail(409,'IDEMPOTENCY_REUSE','La operacion ya existe con otro contenido.');END IF;RETURN JSON_OBJECT_T(saved_result);
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;END;
    BEGIN SELECT version INTO version_value FROM products WHERE id=entity_value AND business_id=p_business;before_json:=product_json(entity_value,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN version_value:=0;END;
    ack.put('operation_id',operation_value);
    IF version_value<>base_value THEN status_value:='CONFLICT';ack.put('code','VERSION_CONFLICT');ack.put('message','El producto cambio en otro dispositivo.');IF version_value>0 THEN ack.put('product',JSON_OBJECT_T(before_json));END IF;
    ELSE
      SELECT COUNT(*) INTO n FROM products WHERE business_id=p_business AND sku=sku_value AND id<>entity_value;
      IF n>0 THEN status_value:='REQUIRES_REVIEW';ack.put('code','SKU_EXISTS');ack.put('message','Ya existe un producto con esa referencia.');
      ELSE
        SELECT COUNT(*) INTO n FROM units_of_measure WHERE id=unit_value;
        IF n=0 THEN status_value:='REQUIRES_REVIEW';ack.put('code','INVALID_UNIT');ack.put('message','La unidad no existe.');
        ELSE
          BEGIN SELECT id INTO category_value FROM product_categories WHERE business_id=p_business AND name=category_name;
          EXCEPTION WHEN NO_DATA_FOUND THEN category_value:=alliance_security.new_id;INSERT INTO product_categories(id,business_id,name) VALUES(category_value,p_business,category_name);END;
          IF version_value=0 THEN INSERT INTO products(id,business_id,name,sku,category_id,price_minor,kind,unit_id,active,version) VALUES(entity_value,p_business,name_value,sku_value,category_value,TO_NUMBER(price_value),kind_value,unit_value,active_value,1);
          ELSE UPDATE products SET name=name_value,sku=sku_value,category_id=category_value,price_minor=TO_NUMBER(price_value),kind=kind_value,unit_id=unit_value,active=active_value,version=base_value+1,updated_at=SYSTIMESTAMP WHERE id=entity_value AND business_id=p_business;END IF;
          product_value:=product_json(entity_value,p_business);ack.put('product',product_value);product_clob:=product_value.to_clob;
          FOR l IN (SELECT id,change_cursor FROM locations WHERE business_id=p_business ORDER BY id FOR UPDATE) LOOP
            UPDATE locations SET change_cursor=change_cursor+1 WHERE id=l.id AND business_id=p_business;
            INSERT INTO change_feed(business_id,location_id,cursor_value,product_json) VALUES(p_business,l.id,l.change_cursor+1,product_clob);
          END LOOP;
        END IF;
      END IF;
    END IF;
    ack.put('status',status_value);
    operation_clob:=p_operation.to_clob;ack_clob:=ack.to_clob;
    INSERT INTO sync_operations(business_id,operation_id,idempotency_key,location_id,device_id,user_id,payload_hash,entity_id,operation_type,client_created_at,status,payload,result)
      VALUES(p_business,operation_value,key_value,p_location,device_value,p_user,hash_value,entity_value,'PRODUCT_UPSERT',created_time,status_value,operation_clob,ack_clob);
    INSERT INTO audit_log(id,business_id,location_id,user_id,device_id,operation_id,action,entity_id,before_json,after_json)
      VALUES(alliance_security.new_id,p_business,p_location,p_user,device_value,operation_value,CASE WHEN status_value='SYNCED' THEN 'PRODUCT_UPSERT' ELSE 'SYNC_REVIEW' END,entity_value,before_json,ack_clob);
    IF status_value='SYNCED' THEN alliance_activity.record_event(p_user,p_business,p_location,'inventory','PRODUCT_UPSERT','Guardó un producto del catálogo',entity_value);END IF;
    UPDATE devices SET last_seen=SYSTIMESTAMP WHERE id=device_value;RETURN ack;
  END;
  FUNCTION changes(p_user VARCHAR2,p_business VARCHAR2,p_location VARCHAR2,p_cursor NUMBER) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();arr JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;n NUMBER:=0;last_cursor NUMBER:=p_cursor;more BOOLEAN:=FALSE;
  BEGIN
    alliance_security.require_location(p_user,p_business,p_location,'products.read');
    IF p_cursor IS NULL OR p_cursor<0 OR p_cursor<>TRUNC(p_cursor) OR p_cursor>9999999999999999 THEN alliance_security.fail(400,'INVALID_INPUT','Cursor invalido.');END IF;
    FOR x IN (SELECT cursor_value,product_json FROM change_feed WHERE business_id=p_business AND location_id=p_location AND cursor_value>p_cursor ORDER BY cursor_value FETCH FIRST 101 ROWS ONLY) LOOP
      n:=n+1;IF n<=100 THEN entry:=JSON_OBJECT_T();entry.put('cursor',x.cursor_value);entry.put('product',JSON_OBJECT_T(x.product_json));arr.append(entry);last_cursor:=x.cursor_value;ELSE more:=TRUE;END IF;
    END LOOP;
    r.put('changes',arr);r.put('cursor',last_cursor);r.put('has_more',more);RETURN r;
  END;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE alliance_api AUTHID DEFINER AS
  FUNCTION dispatch(p_request CLOB) RETURN CLOB;
END;!';
  EXECUTE IMMEDIATE q'!CREATE OR REPLACE PACKAGE BODY alliance_api AS
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
      ELSIF method_value='GET' AND path_value='/account' THEN data:=alliance_administration.profile(s.user_id,s.business_id);
      ELSIF method_value='PUT' AND path_value='/account' THEN
        alliance_administration.save_profile(s.user_id,s.business_id,s.id,body);
        alliance_activity.record_event(s.user_id,s.business_id,NULL,'users','USER_PROFILE_SAVE','Actualizó su cuenta: '||body.get_string('name'),s.user_id);data.put('ok',TRUE);
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
END;!';
  SELECT COUNT(*) INTO invalid_count FROM user_errors WHERE name LIKE 'ALLIANCE_%';
  IF invalid_count>0 THEN RAISE_APPLICATION_ERROR(-20002,'Hay errores de compilacion: consultar USER_ERRORS para ALLIANCE_%');END IF;
  EXECUTE IMMEDIATE q'!BEGIN
  ORDS.DEFINE_MODULE(p_module_name=>'alliance.api',p_base_path=>'alliance/api/v1/',p_status=>'PUBLISHED');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.api',p_pattern=>'rpc');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.api',p_pattern=>'rpc',p_method=>'POST',p_source_type=>ORDS.source_type_plsql,p_mimes_allowed=>'application/json',p_source=>q'~
    DECLARE
      payload CLOB:=:body_text;response_value CLOB;offset_value NUMBER:=1;
    BEGIN
      response_value:=alliance_api.dispatch(payload);
      OWA_UTIL.mime_header('application/json',FALSE);
      HTP.p('Cache-Control: no-store');OWA_UTIL.http_header_close;
      WHILE offset_value<=DBMS_LOB.GETLENGTH(response_value) LOOP
        HTP.prn(DBMS_LOB.SUBSTR(response_value,8000,offset_value));offset_value:=offset_value+8000;
      END LOOP;
    END;~');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.api',p_pattern=>'health');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.api',p_pattern=>'health',p_method=>'GET',p_source_type=>ORDS.source_type_collection_item,p_source=>q'~SELECT 'true' ok,'oracle-ords' provider,'0.3.0' version FROM dual~');
  -- An unprotected module with no origins list permits valid browser origins.
  -- Each private action is protected by our own application token and RBAC.
  -- No database credentials, SQL execution endpoint or browser cookies here.
  ORDS.SET_MODULE_ORIGINS_ALLOWED(p_module_name=>'alliance.api',p_origins_allowed=>NULL);
  -- file:// has the literal Origin null. Keep its CORS policy separate.
  ORDS.DEFINE_MODULE(p_module_name=>'alliance.file',p_base_path=>'alliance/api/v1/file/',p_status=>'PUBLISHED');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.file',p_pattern=>'rpc');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.file',p_pattern=>'rpc',p_method=>'POST',p_source_type=>ORDS.source_type_plsql,p_mimes_allowed=>'application/json',p_source=>q'~
    DECLARE payload CLOB:=:body_text;response_value CLOB;offset_value NUMBER:=1;
    BEGIN
      response_value:=alliance_api.dispatch(payload);OWA_UTIL.mime_header('application/json',FALSE);
      HTP.p('Cache-Control: no-store');OWA_UTIL.http_header_close;
      WHILE offset_value<=DBMS_LOB.GETLENGTH(response_value) LOOP HTP.prn(DBMS_LOB.SUBSTR(response_value,8000,offset_value));offset_value:=offset_value+8000;END LOOP;
    END;~');
  ORDS.SET_MODULE_ORIGINS_ALLOWED(p_module_name=>'alliance.file',p_origins_allowed=>'null');
  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
END;!';
  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
END;
