BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE alliance_activity_events (
    id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,
    location_id VARCHAR2(36), actor_user_id VARCHAR2(36), actor_name VARCHAR2(160) NOT NULL,
    section_code VARCHAR2(40) NOT NULL, action_code VARCHAR2(80) NOT NULL,
    summary VARCHAR2(240) NOT NULL, entity_id VARCHAR2(160),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT activity_business_fk FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    CONSTRAINT activity_location_fk FOREIGN KEY(business_id,location_id) REFERENCES locations(business_id,id),
    CONSTRAINT activity_actor_fk FOREIGN KEY(business_id,actor_user_id) REFERENCES users(business_id,id))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;
/
BEGIN
  BEGIN EXECUTE IMMEDIATE 'ALTER TABLE alliance_activity_events ADD (device_id VARCHAR2(80),client_created_at TIMESTAMP WITH TIME ZONE)';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-1430 THEN RAISE;END IF;END;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_recent_idx ON alliance_activity_events(business_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_actor_idx ON alliance_activity_events(business_id,actor_user_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX alliance_activity_scope_idx ON alliance_activity_events(business_id,location_id,created_at,id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE;END IF;
END;
/
