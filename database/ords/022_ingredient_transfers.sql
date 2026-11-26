-- Independent surplus declarations: never debit the sender's inventory.
BEGIN
 EXECUTE IMMEDIATE 'CREATE TABLE alliance_ingredient_transfers (
 id VARCHAR2(64) PRIMARY KEY,business_id VARCHAR2(36) NOT NULL,
 source_location_id VARCHAR2(36) NOT NULL,destination_location_id VARCHAR2(36) NOT NULL,
 sender_user_id VARCHAR2(36) NOT NULL,recipient_user_id VARCHAR2(36) NOT NULL,
 status VARCHAR2(12) DEFAULT ''pending'' NOT NULL,
 payload CLOB NOT NULL CHECK(payload IS JSON),
 created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
 CONSTRAINT alliance_transfer_status CHECK(status IN(''pending'',''accepted'',''rejected'')))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
/
BEGIN
 EXECUTE IMMEDIATE 'CREATE INDEX alliance_transfer_inbox ON alliance_ingredient_transfers(business_id,destination_location_id,recipient_user_id,created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
/
BEGIN
 EXECUTE IMMEDIATE 'CREATE INDEX alliance_transfer_outbox ON alliance_ingredient_transfers(business_id,source_location_id,created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
/
BEGIN
 EXECUTE IMMEDIATE 'CREATE INDEX alliance_transfer_expiry ON alliance_ingredient_transfers(created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;END;
/
BEGIN
 DBMS_SCHEDULER.CREATE_JOB(job_name=>'ALLIANCE_TRANSFER_RETENTION',job_type=>'PLSQL_BLOCK',
 job_action=>'BEGIN DELETE FROM alliance_ingredient_transfers WHERE created_at<=SYSTIMESTAMP-INTERVAL ''7'' DAY; DELETE FROM alliance_notice_events WHERE kind=''ingredient-transfer'' AND created_at<=SYSTIMESTAMP-INTERVAL ''7'' DAY; COMMIT; END;',
 start_date=>SYSTIMESTAMP,repeat_interval=>'FREQ=HOURLY;INTERVAL=1',enabled=>TRUE,
 comments=>'Expire surplus declarations after seven days. Received ingredients and accounting movements remain.');
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-27477 THEN RAISE;END IF;END;
/
