DECLARE
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
END;
/
DECLARE
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
END;
/
