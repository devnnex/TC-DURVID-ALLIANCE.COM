-- 006_reference_data.sql
-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.
-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.
-- Previous SQL SHA256: 87dfb37b3fc2ceaba553cc06f506f4251c274d7f828f9ce429d823e78f97bbf9
-- Payload SHA256: 87dfb37b3fc2ceaba553cc06f506f4251c274d7f828f9ce429d823e78f97bbf9
BEGIN
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('OWNER','Propietario')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('ADMIN','Administrador')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('MANAGER','Encargado')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('CASHIER','Cajero')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('WAITER','Mesero')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('KITCHEN','Cocina')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('INVENTORY_MANAGER','Inventario')~';
  EXECUTE IMMEDIATE q'~INSERT INTO roles VALUES ('ACCOUNTING','Contabilidad')~';
  EXECUTE IMMEDIATE q'~INSERT INTO permissions VALUES ('products.read')~';
  EXECUTE IMMEDIATE q'~INSERT INTO permissions VALUES ('products.write')~';
  EXECUTE IMMEDIATE q'~INSERT INTO permissions VALUES ('inventory.read')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions SELECT code,'products.read' FROM roles~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('OWNER','products.write')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('ADMIN','products.write')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('INVENTORY_MANAGER','products.write')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('OWNER','inventory.read')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('ADMIN','inventory.read')~';
  EXECUTE IMMEDIATE q'~INSERT INTO role_permissions VALUES ('INVENTORY_MANAGER','inventory.read')~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('g','Gramos','MASS',1)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('kg','Kilogramos','MASS',1000)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('lb','Libras','MASS',453.59237)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('oz','Onzas','MASS',28.349523125)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('ml','Mililitros','VOLUME',1)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('l','Litros','VOLUME',1000)~';
  EXECUTE IMMEDIATE q'~INSERT INTO units_of_measure VALUES ('u','Unidades','COUNT',1)~';
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
