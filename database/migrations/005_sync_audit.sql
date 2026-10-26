-- 005_sync_audit.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 8e38a13f302ec946338b8c171a54aedc6a5bb3ec1e588f63bf8405924dab236f
-- Payload SHA256: 8e38a13f302ec946338b8c171a54aedc6a5bb3ec1e588f63bf8405924dab236f
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE sync_operations (
  business_id VARCHAR2(36) NOT NULL, operation_id VARCHAR2(36) NOT NULL,
  idempotency_key VARCHAR2(36) NOT NULL, location_id VARCHAR2(36) NOT NULL, device_id VARCHAR2(36) NOT NULL,
  user_id VARCHAR2(36) NOT NULL, payload_hash VARCHAR2(64) NOT NULL,
  entity_id VARCHAR2(36) NOT NULL, operation_type VARCHAR2(40) NOT NULL,
  client_created_at TIMESTAMP WITH TIME ZONE NOT NULL, server_received_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  status VARCHAR2(24) NOT NULL CHECK(status IN ('SYNCED','CONFLICT','REQUIRES_REVIEW')),
  payload CLOB NOT NULL CHECK(payload IS JSON), result CLOB NOT NULL CHECK(result IS JSON),
  PRIMARY KEY(business_id,operation_id), CONSTRAINT sync_idempotency_uq UNIQUE(business_id,idempotency_key),
  CONSTRAINT sync_device_fk FOREIGN KEY(business_id,location_id,device_id) REFERENCES devices(business_id,location_id,id),
  CONSTRAINT sync_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE audit_log (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL, location_id VARCHAR2(36) NOT NULL,
  user_id VARCHAR2(36) NOT NULL, device_id VARCHAR2(36) NOT NULL, operation_id VARCHAR2(36) NOT NULL,
  action VARCHAR2(40) NOT NULL, entity_id VARCHAR2(36) NOT NULL,
  before_json CLOB CHECK(before_json IS JSON), after_json CLOB CHECK(after_json IS JSON),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT audit_operation_fk FOREIGN KEY(business_id,operation_id) REFERENCES sync_operations(business_id,operation_id)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE change_feed (
  business_id VARCHAR2(36) NOT NULL, location_id VARCHAR2(36) NOT NULL, cursor_value NUMBER(16) NOT NULL,
  product_json CLOB NOT NULL CHECK(product_json IS JSON), PRIMARY KEY(business_id,location_id,cursor_value),
  CONSTRAINT feed_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX sync_device_idx ON sync_operations(business_id,location_id,device_id)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX audit_scope_idx ON audit_log(business_id,location_id,created_at)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
