-- 001_businesses.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 44ed70ef1642f349c239574afbfe713aee36960a53dfa597db6d4f85723e9db8
-- Payload SHA256: 44ed70ef1642f349c239574afbfe713aee36960a53dfa597db6d4f85723e9db8
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE businesses (
  id VARCHAR2(36) PRIMARY KEY, slug VARCHAR2(80) NOT NULL UNIQUE,
  name VARCHAR2(160) NOT NULL, currency CHAR(3) DEFAULT 'COP' NOT NULL CHECK (currency = 'COP'),
  locale VARCHAR2(12) DEFAULT 'es-CO' NOT NULL, settings CLOB CHECK (settings IS JSON),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE setup_lock (id NUMBER(1) PRIMARY KEY CHECK (id = 1))~';
  EXECUTE IMMEDIATE q'~INSERT INTO setup_lock(id) VALUES (1)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
