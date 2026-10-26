-- 002_locations.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 0a318969e52a8a908097b262da52abef0e45bf2492e9849acfbbdf77f4ac1a80
-- Payload SHA256: 0a318969e52a8a908097b262da52abef0e45bf2492e9849acfbbdf77f4ac1a80
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE locations (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL,
  slug VARCHAR2(80) NOT NULL, name VARCHAR2(160) NOT NULL, color VARCHAR2(7) DEFAULT '#a47a47' NOT NULL,
  active NUMBER(1) DEFAULT 1 NOT NULL CHECK (active IN (0,1)),
  settings CLOB CHECK (settings IS JSON), change_cursor NUMBER(16) DEFAULT 0 NOT NULL,
  CONSTRAINT locations_business_fk FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT locations_scope_uq UNIQUE (business_id,id), CONSTRAINT locations_slug_uq UNIQUE(business_id,slug)
)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
