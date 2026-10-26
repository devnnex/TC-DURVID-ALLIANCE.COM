-- Copia TODO y ejecuta como una sentencia PL/SQL. No repetir 001-007.
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
END;
