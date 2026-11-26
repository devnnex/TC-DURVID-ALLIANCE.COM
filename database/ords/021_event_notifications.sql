-- Private dispatch configuration is never returned through the public API.
BEGIN
 FOR x IN(SELECT 'CREATE TABLE alliance_notice_config(id NUMBER PRIMARY KEY,dispatch_url VARCHAR2(400),dispatch_token VARCHAR2(1000),enabled NUMBER(1) DEFAULT 0 NOT NULL,next_dispatch TIMESTAMP WITH TIME ZONE,last_status NUMBER)' ddl FROM dual UNION ALL
 SELECT 'CREATE TABLE alliance_notice_scopes(business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,version NUMBER DEFAULT 1 NOT NULL,processed_version NUMBER DEFAULT 0 NOT NULL,updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,PRIMARY KEY(business_id,location_id))' FROM dual UNION ALL
 SELECT 'CREATE TABLE alliance_notice_events(id VARCHAR2(64) PRIMARY KEY,business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,actor_user_id VARCHAR2(36) NOT NULL,kind VARCHAR2(30) NOT NULL,payload CLOB CHECK(payload IS JSON),created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL)' FROM dual UNION ALL
 SELECT 'CREATE INDEX alliance_notice_events_scope ON alliance_notice_events(business_id,location_id,created_at)' FROM dual) LOOP
  BEGIN EXECUTE IMMEDIATE x.ddl;EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
 END LOOP;
 EXECUTE IMMEDIATE 'MERGE INTO alliance_notice_config c USING(SELECT 1 id FROM dual)s ON(c.id=s.id) WHEN NOT MATCHED THEN INSERT(id)VALUES(1)';
 COMMIT;
END;
/
