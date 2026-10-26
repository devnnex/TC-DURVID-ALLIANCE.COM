CREATE OR REPLACE PACKAGE alliance_auth_proof AUTHID DEFINER AS
  FUNCTION challenge(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION finish(p JSON_OBJECT_T,branch_value VARCHAR2) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_auth_proof AS
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
END;
/
