-- Retain actor IDs required by sales/audit, while hiding retired accounts.
DECLARE n NUMBER;BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='USERS' AND column_name='DELETED_AT';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE users ADD (deleted_at TIMESTAMP WITH TIME ZONE)';END IF;
  SELECT COUNT(*) INTO n FROM user_indexes WHERE index_name='USERS_LOGIN_SCOPE_IX';
  IF n=0 THEN EXECUTE IMMEDIATE 'CREATE INDEX users_login_scope_ix ON users(business_id,username,active)';END IF;
  SELECT COUNT(*) INTO n FROM user_indexes WHERE index_name='USER_AUDIT_ENTITY_IX';
  IF n=0 THEN EXECUTE IMMEDIATE 'CREATE INDEX user_audit_entity_ix ON administration_audit(business_id,entity_id,action,created_at)';END IF;
END;
/
