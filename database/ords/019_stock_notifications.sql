-- Additive, re-runnable. Public VAPID key only; the private key stays in the sender.
BEGIN
 FOR entry IN(SELECT 'CREATE TABLE alliance_push_config (id NUMBER PRIMARY KEY, public_key VARCHAR2(180), enabled NUMBER(1) DEFAULT 0 NOT NULL)' ddl FROM dual UNION ALL
 SELECT 'CREATE TABLE alliance_push_subscriptions (id VARCHAR2(64) PRIMARY KEY,business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,user_id VARCHAR2(36) NOT NULL,endpoint VARCHAR2(2048) NOT NULL,p256dh VARCHAR2(180) NOT NULL,auth_key VARCHAR2(100) NOT NULL,active NUMBER(1) DEFAULT 1 NOT NULL,updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL)' FROM dual UNION ALL
 SELECT 'CREATE INDEX alliance_push_scope_idx ON alliance_push_subscriptions(business_id,location_id,user_id,active)' FROM dual UNION ALL
 SELECT 'CREATE TABLE alliance_stock_alerts (business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(160) NOT NULL,payload CLOB CHECK(payload IS JSON),active NUMBER(1) DEFAULT 1 NOT NULL,generation NUMBER DEFAULT 1 NOT NULL,level_value VARCHAR2(12),opened_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,scan_id VARCHAR2(64),stock_revision VARCHAR2(80),PRIMARY KEY(business_id,location_id,id))' FROM dual UNION ALL
 SELECT 'CREATE TABLE alliance_push_deliveries (id VARCHAR2(64) PRIMARY KEY,subscription_id VARCHAR2(64) NOT NULL,status VARCHAR2(12) NOT NULL,lease_until TIMESTAMP WITH TIME ZONE,attempts NUMBER DEFAULT 1 NOT NULL,updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL)' FROM dual) LOOP
  BEGIN EXECUTE IMMEDIATE entry.ddl;EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
 END LOOP;
  EXECUTE IMMEDIATE 'MERGE INTO alliance_push_config c USING(SELECT 1 id FROM dual)s ON(c.id=s.id) WHEN NOT MATCHED THEN INSERT(id,enabled)VALUES(1,0)';
 COMMIT;
END;
/
