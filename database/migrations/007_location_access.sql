-- 007_location_access.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: f4130b18bfb106f4e394acbc1c44700db2c1c50059f0c0b7f2d27e667cd3fb1b
-- Payload SHA256: f4130b18bfb106f4e394acbc1c44700db2c1c50059f0c0b7f2d27e667cd3fb1b
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE user_location_permissions (
  business_id VARCHAR2(36) NOT NULL, user_id VARCHAR2(36) NOT NULL,
  location_id VARCHAR2(36) NOT NULL, permission_code VARCHAR2(80) NOT NULL REFERENCES permissions(code),
  effect VARCHAR2(5) NOT NULL CHECK (effect IN ('ALLOW','DENY')),
  PRIMARY KEY(business_id,user_id,location_id,permission_code),
  CONSTRAINT override_user_fk FOREIGN KEY(business_id,user_id) REFERENCES users(business_id,id),
  CONSTRAINT override_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE administration_audit (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,
  actor_user_id VARCHAR2(36) NOT NULL, action VARCHAR2(80) NOT NULL, entity_id VARCHAR2(36) NOT NULL,
  before_json CLOB CHECK(before_json IS JSON), after_json CLOB CHECK(after_json IS JSON),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT admin_audit_actor_fk FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX admin_audit_business_idx ON administration_audit(business_id,created_at)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'home.read' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'products.read' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'products.write' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'inventory.read' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'locations.read' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'activity.read' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO permissions p USING (SELECT 'administration.manage' code FROM dual) s ON (p.code=s.code) WHEN NOT MATCHED THEN INSERT (code) VALUES (s.code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'products.write' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'inventory.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'OWNER' role_code,'administration.manage' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'products.write' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'inventory.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ADMIN' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'products.write' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'inventory.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'MANAGER' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'CASHIER' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'CASHIER' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'CASHIER' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'CASHIER' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'WAITER' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'WAITER' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'WAITER' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'KITCHEN' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'KITCHEN' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'KITCHEN' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'products.write' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'inventory.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'INVENTORY_MANAGER' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ACCOUNTING' role_code,'home.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ACCOUNTING' role_code,'products.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ACCOUNTING' role_code,'locations.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  EXECUTE IMMEDIATE q'~MERGE INTO role_permissions p USING (SELECT 'ACCOUNTING' role_code,'activity.read' permission_code FROM dual) s ON (p.role_code=s.role_code AND p.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT (role_code,permission_code) VALUES (s.role_code,s.permission_code)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
