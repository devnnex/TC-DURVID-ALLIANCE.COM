-- Additive branch-scoped team roles. Existing users and grants are preserved.
BEGIN
 MERGE INTO roles t USING(SELECT 'BOSS' code,'Jefe' name FROM dual UNION ALL SELECT 'WORKER','Trabajador' FROM dual)s ON(t.code=s.code) WHEN NOT MATCHED THEN INSERT(code,name)VALUES(s.code,s.name);
 MERGE INTO permissions t USING(SELECT 'sales.manage' code FROM dual)s ON(t.code=s.code) WHEN NOT MATCHED THEN INSERT(code)VALUES(s.code);
 MERGE INTO role_permissions t USING(SELECT r.code role_code,p.code permission_code FROM roles r CROSS JOIN permissions p WHERE r.code IN('OWNER','BOSS'))s ON(t.role_code=s.role_code AND t.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code)VALUES(s.role_code,s.permission_code);
 MERGE INTO role_permissions t USING(SELECT 'WORKER' role_code,code permission_code FROM permissions WHERE code IN('home.read','products.read','locations.read'))s ON(t.role_code=s.role_code AND t.permission_code=s.permission_code) WHEN NOT MATCHED THEN INSERT(role_code,permission_code)VALUES(s.role_code,s.permission_code);
 DELETE FROM role_permissions WHERE role_code='WAITER' AND permission_code NOT IN('home.read','products.read','locations.read','service.read','service.write');
 COMMIT;
END;
/
