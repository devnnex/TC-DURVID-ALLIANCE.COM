-- Release the former organization-wide namespace only after every API compiled.
-- All profile/access writes serialize on BUSINESSES before checking overlapping grants.
DECLARE n NUMBER;BEGIN
  SELECT COUNT(*) INTO n FROM user_errors WHERE name LIKE 'ALLIANCE_%';
  IF n>0 THEN RAISE_APPLICATION_ERROR(-20002,'La API debe compilar antes de habilitar usuarios por negocio.');END IF;
  SELECT COUNT(*) INTO n FROM user_constraints WHERE table_name='USERS' AND constraint_name='USERS_USERNAME_UQ';
  IF n>0 THEN EXECUTE IMMEDIATE 'ALTER TABLE users DROP CONSTRAINT users_username_uq DROP INDEX';END IF;
END;
/
