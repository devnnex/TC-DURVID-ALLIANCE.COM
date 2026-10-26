-- 004_units_catalog.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 27f4c18521036562c4b8d11b069435caa9fd50130efaaa768e41ac4ed16d567e
-- Payload SHA256: 27f4c18521036562c4b8d11b069435caa9fd50130efaaa768e41ac4ed16d567e
BEGIN
  EXECUTE IMMEDIATE q'~CREATE TABLE units_of_measure (
  id VARCHAR2(12) PRIMARY KEY, name VARCHAR2(80) NOT NULL,
  dimension VARCHAR2(12) NOT NULL CHECK(dimension IN ('MASS','VOLUME','COUNT')),
  factor NUMBER(24,9) NOT NULL CHECK(factor > 0)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE product_categories (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL REFERENCES businesses(id),
  name VARCHAR2(80) NOT NULL,
  CONSTRAINT categories_scope_uq UNIQUE(business_id,id), CONSTRAINT categories_name_uq UNIQUE(business_id,name)
)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE products (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL REFERENCES businesses(id),
  sku VARCHAR2(64) NOT NULL, name VARCHAR2(160) NOT NULL, category_id VARCHAR2(36) NOT NULL,
  price_minor NUMBER(18,0) NOT NULL CHECK(price_minor >= 0),
  kind VARCHAR2(12) NOT NULL CHECK(kind IN ('SIMPLE','PREPARED','WEIGHT','VOLUME')),
  unit_id VARCHAR2(12) NOT NULL REFERENCES units_of_measure(id),
  active NUMBER(1) DEFAULT 1 NOT NULL CHECK(active IN (0,1)), version NUMBER(10) DEFAULT 1 NOT NULL CHECK(version >= 1),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT products_scope_uq UNIQUE(business_id,id), CONSTRAINT products_sku_uq UNIQUE(business_id,sku),
  CONSTRAINT products_category_fk FOREIGN KEY(business_id,category_id) REFERENCES product_categories(business_id,id)
)~';
  EXECUTE IMMEDIATE q'~CREATE INDEX products_name_idx ON products(business_id,name)~';
  EXECUTE IMMEDIATE q'~CREATE TABLE ingredients (
  id VARCHAR2(36) PRIMARY KEY, business_id VARCHAR2(36) NOT NULL REFERENCES businesses(id),
  name VARCHAR2(160) NOT NULL, unit_id VARCHAR2(12) NOT NULL REFERENCES units_of_measure(id),
  cost_minor NUMBER(18,0) DEFAULT 0 NOT NULL CHECK(cost_minor >= 0),
  CONSTRAINT ingredients_scope_uq UNIQUE(business_id,id)
)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
