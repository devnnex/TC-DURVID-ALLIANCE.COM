DECLARE
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
END;
/
