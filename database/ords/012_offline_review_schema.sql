DECLARE
  PROCEDURE column_flag(t VARCHAR2) IS BEGIN EXECUTE IMMEDIATE 'ALTER TABLE '||t||' ADD (allow_negative NUMBER(1) DEFAULT 0 NOT NULL CHECK(allow_negative IN(0,1)))';EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-1430 THEN RAISE;END IF;END;
  PROCEDURE guarded_check(t VARCHAR2,c VARCHAR2,field VARCHAR2) IS n NUMBER;BEGIN
    FOR x IN(SELECT constraint_name FROM user_constraints WHERE table_name=t AND constraint_type='C' AND REGEXP_LIKE(REPLACE(search_condition_vc,'"',''),'^[[:space:]]*'||field||'[[:space:]]*>=[[:space:]]*0[[:space:]]*$','i')) LOOP EXECUTE IMMEDIATE 'ALTER TABLE '||t||' DROP CONSTRAINT '||DBMS_ASSERT.SIMPLE_SQL_NAME(x.constraint_name);END LOOP;
    SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name=c;IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE '||t||' ADD CONSTRAINT '||c||' CHECK ('||field||'>=0 OR allow_negative=1)';END IF;
  END;
BEGIN
  column_flag('ALLIANCE_RAW_STOCK');column_flag('ALLIANCE_RAW_MOVEMENTS');column_flag('ALLIANCE_POS_STOCK');column_flag('ALLIANCE_POS_MOVEMENTS');
  guarded_check('ALLIANCE_RAW_STOCK','RAW_STOCK_NEGATIVE_POLICY','quantity');guarded_check('ALLIANCE_RAW_MOVEMENTS','RAW_MOVE_NEGATIVE_POLICY','stock_after');guarded_check('ALLIANCE_POS_STOCK','POS_STOCK_NEGATIVE_POLICY','stock');guarded_check('ALLIANCE_POS_MOVEMENTS','POS_MOVE_NEGATIVE_POLICY','stock_after');
END;
/
