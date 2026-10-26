-- 003_identity.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 607c1ce61aa09140b42f7e04099fc6115205e21f7ebd030cb8f41aa2ca5bb055
-- Payload SHA256: 607c1ce61aa09140b42f7e04099fc6115205e21f7ebd030cb8f41aa2ca5bb055
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE users (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,
  username VARCHAR2(80) NOT NULL, full_name VARCHAR2(160) NOT NULL, password_hash VARCHAR2(512) NOT NULL,
  active NUMBER(1) DEFAULT 1 NOT NULL CHECK(active IN (0,1)),
  CONSTRAINT users_business_fk FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT users_scope_uq UNIQUE(business_id,id), CONSTRAINT users_username_uq UNIQUE(business_id,username)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE roles (code VARCHAR2(40) PRIMARY KEY, name VARCHAR2(80) NOT NULL)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE permissions (code VARCHAR2(80) PRIMARY KEY)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE role_permissions (
  role_code VARCHAR2(40) NOT NULL REFERENCES roles(code), permission_code VARCHAR2(80) NOT NULL REFERENCES permissions(code),
  PRIMARY KEY(role_code,permission_code)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE user_location_roles (
  business_id VARCHAR2(36) NOT NULL, user_id VARCHAR2(36) NOT NULL,
  location_id VARCHAR2(36) NOT NULL, role_code VARCHAR2(40) NOT NULL REFERENCES roles(code),
  PRIMARY KEY(business_id,user_id,location_id,role_code),
  CONSTRAINT grants_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id),
  CONSTRAINT grants_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE auth_sessions (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL, user_id VARCHAR2(36) NOT NULL,
  refresh_hash VARCHAR2(64) NOT NULL UNIQUE, expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  revoked NUMBER(1) DEFAULT 0 NOT NULL CHECK(revoked IN (0,1)),
  CONSTRAINT sessions_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE devices (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL, location_id VARCHAR2(36) NOT NULL,
  user_id VARCHAR2(36) NOT NULL, name VARCHAR2(120) NOT NULL, app_version VARCHAR2(40) NOT NULL,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT devices_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
  CONSTRAINT devices_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id),
  CONSTRAINT devices_scope_uq UNIQUE(business_id,location_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX grants_location_idx ON user_location_roles(business_id,location_id)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX sessions_user_idx ON auth_sessions(business_id,user_id)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
