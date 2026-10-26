CREATE OR REPLACE PACKAGE alliance_administration AUTHID DEFINER AS
  FUNCTION setup(p_body JSON_OBJECT_T,p_token VARCHAR2) RETURN JSON_OBJECT_T;
  FUNCTION overview(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T;
  PROCEDURE save_location(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T);
  PROCEDURE save_user(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T,p_location VARCHAR2 DEFAULT NULL);
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_administration AS
  PROCEDURE check_location(p_body JSON_OBJECT_T) IS v VARCHAR2(160);n NUMBER;
  BEGIN
    alliance_security.keys_only(p_body,'slug,name,color,active');
    v:=alliance_security.text_value(p_body,'slug',80,'^[a-z0-9-]{3,80}$');v:=alliance_security.text_value(p_body,'name',160);v:=alliance_security.text_value(p_body,'color',7,'^#[0-9a-fA-F]{6}$');n:=alliance_security.flag(p_body,'active');
  END;
  FUNCTION contains_code(pa JSON_ARRAY_T,code VARCHAR2) RETURN BOOLEAN IS
  BEGIN IF pa IS NULL THEN RETURN FALSE;END IF;FOR i IN 0..pa.get_size-1 LOOP IF pa.get_string(i)=code THEN RETURN TRUE;END IF;END LOOP;RETURN FALSE;END;
  FUNCTION manages(perms JSON_OBJECT_T,loc VARCHAR2) RETURN BOOLEAN IS
  BEGIN IF NOT perms.has(loc) THEN RETURN FALSE;END IF;RETURN contains_code(perms.get_array(loc),'administration.manage');END;
  PROCEDURE lock_business(p_user VARCHAR2,p_business VARCHAR2) IS v VARCHAR2(36);
  BEGIN
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','No tienes permiso para gestionar usuarios.');END IF;
    SELECT id INTO v FROM businesses WHERE id=p_business FOR UPDATE;
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Tu acceso cambio.');END IF;
  END;
  PROCEDURE audit(p_user VARCHAR2,p_business VARCHAR2,p_action VARCHAR2,p_entity VARCHAR2,p_before CLOB,p_after CLOB) IS
  BEGIN INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,before_json,after_json) VALUES(alliance_security.new_id,p_business,p_user,p_action,p_entity,p_before,p_after);END;
  FUNCTION location_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();x locations%ROWTYPE;
  BEGIN SELECT * INTO x FROM locations WHERE id=p_id AND business_id=p_business;
    r.put('id',x.id);r.put('business_id',x.business_id);r.put('slug',x.slug);r.put('name',x.name);r.put('color',x.color);r.put('active',x.active=1);RETURN r;
  END;
  FUNCTION user_json(p_id VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS r JSON_OBJECT_T:=JSON_OBJECT_T();a JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;roles_json JSON_ARRAY_T;overrides_json JSON_OBJECT_T;x users%ROWTYPE;
  BEGIN SELECT * INTO x FROM users WHERE id=p_id AND business_id=p_business;
    r.put('id',x.id);r.put('name',x.full_name);r.put('username',x.username);r.put('active',x.active=1);r.put('protected',alliance_security.owner(p_id,p_business));
    FOR l IN (SELECT DISTINCT location_id FROM user_location_roles WHERE business_id=p_business AND user_id=p_id ORDER BY location_id) LOOP
      entry:=JSON_OBJECT_T();roles_json:=JSON_ARRAY_T();overrides_json:=JSON_OBJECT_T();
      FOR g IN (SELECT role_code FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND location_id=l.location_id ORDER BY role_code) LOOP roles_json.append(g.role_code);END LOOP;
      FOR o IN (SELECT permission_code,effect FROM user_location_permissions WHERE business_id=p_business AND user_id=p_id AND location_id=l.location_id ORDER BY permission_code) LOOP overrides_json.put(o.permission_code,o.effect);END LOOP;
      entry.put('location_id',l.location_id);entry.put('roles',roles_json);entry.put('overrides',overrides_json);a.append(entry);
    END LOOP;
    r.put('access',a);
    FOR h IN(SELECT h.actor_user_id,h.before_json,u.full_name,TO_CHAR(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') at_value FROM administration_audit h LEFT JOIN users u ON u.id=h.actor_user_id AND u.business_id=h.business_id WHERE h.business_id=p_business AND h.entity_id=p_id AND h.action='USER_ACCESS_SAVE' ORDER BY h.created_at,h.id)LOOP
     IF h.before_json IS NULL AND NOT r.has('createdBy') THEN r.put('createdBy',h.actor_user_id);r.put('createdByName',h.full_name);r.put('createdAt',h.at_value);END IF;
     r.put('updatedBy',h.actor_user_id);r.put('updatedByName',h.full_name);r.put('updatedAt',h.at_value);
    END LOOP;RETURN r;
  END;
  FUNCTION setup(p_body JSON_OBJECT_T,p_token VARCHAR2) RETURN JSON_OBJECT_T IS
    b VARCHAR2(36):=alliance_security.new_id;u VARCHAR2(36):=alliance_security.new_id;l VARCHAR2(36);n NUMBER;dummy NUMBER;secret_hash VARCHAR2(64);hash_value VARCHAR2(512);
    slug_value VARCHAR2(80);business_name VARCHAR2(160);name_value VARCHAR2(160);username_value users.username%TYPE;password_value VARCHAR2(128);arr JSON_ARRAY_T;entry JSON_OBJECT_T;active_count NUMBER:=0;
    location_slug VARCHAR2(80);location_name VARCHAR2(160);location_color VARCHAR2(7);location_active NUMBER;
  BEGIN
    BEGIN SELECT setup_hash INTO secret_hash FROM alliance_api_settings WHERE id=1 AND enabled=1;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(503,'SETUP_UNAVAILABLE','Falta habilitar la instalacion.');END;
    IF p_token IS NULL OR alliance_security.hash_text(p_token)<>secret_hash THEN alliance_security.fail(403,'FORBIDDEN','La configuracion requiere el token de instalacion.');END IF;
    alliance_security.throttle('setup',5);alliance_security.keys_only(p_body,'slug,business_name,name,username,password,locations,location_name');
    slug_value:=alliance_security.text_value(p_body,'slug',80,'^[a-z0-9-]{3,80}$');business_name:=alliance_security.text_value(p_body,'business_name',160);
    name_value:=alliance_security.text_value(p_body,'name',160);username_value:=alliance_security.text_value(p_body,'username',320);password_value:=alliance_security.text_value(p_body,'password',128);
    IF NOT p_body.has('locations') OR p_body.has('location_name') THEN alliance_security.fail(400,'INVALID_INPUT','Define la lista de sucursales.');END IF;
    arr:=p_body.get_array('locations');IF arr.get_size<1 OR arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Define de 1 a 100 sucursales.');END IF;
    FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);check_location(entry);active_count:=active_count+alliance_security.flag(entry,'active');END LOOP;
    IF active_count=0 THEN alliance_security.fail(400,'INVALID_INPUT','Habilita al menos una sucursal.');END IF;
    SELECT id INTO dummy FROM setup_lock WHERE id=1 FOR UPDATE;
    SELECT COUNT(*) INTO n FROM businesses;IF n>0 THEN alliance_security.fail(409,'SETUP_COMPLETE','La configuracion inicial ya fue realizada.');END IF;
    IF LENGTH(password_value)<12 THEN alliance_security.fail(400,'INVALID_PASSWORD','Usa una contrasena de 12 a 128 caracteres.');END IF;hash_value:=alliance_security.password_hash(password_value);
    INSERT INTO businesses(id,slug,name,settings) VALUES(b,slug_value,business_name,'{"currency":"COP","locale":"es-CO","allow_negative_stock":false}');
    INSERT INTO users(id,business_id,username,full_name,password_hash) VALUES(u,b,username_value,name_value,hash_value);
    FOR i IN 0..arr.get_size-1 LOOP entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);l:=alliance_security.new_id;
      location_slug:=entry.get_string('slug');location_name:=entry.get_string('name');location_color:=entry.get_string('color');location_active:=alliance_security.flag(entry,'active');
      INSERT INTO locations(id,business_id,slug,name,color,active) VALUES(l,b,location_slug,location_name,location_color,location_active);
      INSERT INTO user_location_roles VALUES(b,u,l,'OWNER');IF location_active=1 THEN alliance_pos.initialize(b,l);END IF;
    END LOOP;
    RETURN alliance_security.context_for(u);
  END;
  FUNCTION overview(p_user VARCHAR2,p_business VARCHAR2) RETURN JSON_OBJECT_T IS
    r JSON_OBJECT_T:=JSON_OBJECT_T();ls JSON_ARRAY_T:=JSON_ARRAY_T();us JSON_ARRAY_T:=JSON_ARRAY_T();rs JSON_ARRAY_T:=JSON_ARRAY_T();entry JSON_OBJECT_T;pa JSON_ARRAY_T;ctx JSON_OBJECT_T;perms JSON_OBJECT_T;aa JSON_ARRAY_T;visible_access JSON_ARRAY_T;grant_entry JSON_OBJECT_T;
  BEGIN
    IF NOT alliance_security.can_manage(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','No tienes permiso para gestionar usuarios.');END IF;
    ctx:=alliance_security.context_for(p_user);perms:=ctx.get_object('permissions');
    FOR l IN (SELECT id FROM locations WHERE business_id=p_business ORDER BY name) LOOP IF manages(perms,l.id) THEN ls.append(location_json(l.id,p_business));END IF;END LOOP;
    FOR u IN (SELECT id FROM users WHERE business_id=p_business ORDER BY full_name) LOOP entry:=user_json(u.id,p_business);aa:=entry.get_array('access');visible_access:=JSON_ARRAY_T();FOR i IN 0..aa.get_size-1 LOOP grant_entry:=TREAT(aa.get(i) AS JSON_OBJECT_T);IF manages(perms,grant_entry.get_string('location_id')) THEN visible_access.append(grant_entry);END IF;END LOOP;IF visible_access.get_size>0 OR alliance_security.owner(p_user,p_business) THEN entry.put('access',visible_access);us.append(entry);END IF;END LOOP;
    FOR role_row IN (SELECT code,name FROM roles ORDER BY code) LOOP entry:=JSON_OBJECT_T();pa:=JSON_ARRAY_T();
      FOR p IN (SELECT permission_code FROM role_permissions WHERE role_code=role_row.code ORDER BY permission_code) LOOP pa.append(p.permission_code);END LOOP;
      entry.put('code',role_row.code);entry.put('name',role_row.name);entry.put('permissions',pa);rs.append(entry);
    END LOOP;
    r.put('locations',ls);r.put('users',us);r.put('roles',rs);
    r.put('sections',JSON_ARRAY_T('[{"code":"home.read","name":"Inicio"},{"code":"products.read","name":"Consultar catálogo"},{"code":"products.write","name":"Crear y editar productos"},{"code":"inventory.read","name":"Consultar inventario"},{"code":"locations.read","name":"Ver sucursales"},{"code":"activity.read","name":"Actividad del dispositivo"},{"code":"service.read","name":"Atender mesas"},{"code":"service.write","name":"Registrar consumos y solicitudes"},{"code":"accounts.read","name":"Consultar cuentas"},{"code":"sales.read","name":"Consultar ventas y propinas"},{"code":"sales.write","name":"Cobrar cuentas"},{"code":"inventory.write","name":"Modificar existencias y compras"},{"code":"movements.read","name":"Consultar movimientos"},{"code":"tables.manage","name":"Administrar mesas"},{"code":"brand.manage","name":"Configurar marca"},{"code":"assistant.read","name":"Asistente"},{"code":"supplies.read","name":"Consultar compras y proveedores"},{"code":"supplies.write","name":"Registrar compras y proveedores"},{"code":"kitchen.read","name":"Consultar comandas"},{"code":"kitchen.write","name":"Preparar comandas"},{"code":"customers.read","name":"Consultar clientes y cartera"},{"code":"customers.write","name":"Registrar clientes"},{"code":"cash.read","name":"Consultar caja"},{"code":"cash.write","name":"Abrir, mover y cerrar caja"}]'));RETURN r;
  END;
  PROCEDURE save_location(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T) IS
    entity VARCHAR2(36):=NVL(p_id,alliance_security.new_id);before_value CLOB;n NUMBER;slug_value VARCHAR2(80);name_value VARCHAR2(160);color_value VARCHAR2(7);active_value NUMBER;
  BEGIN
    IF NOT alliance_security.owner(p_user,p_business) THEN alliance_security.fail(403,'FORBIDDEN','Solo el jefe principal administra sucursales.');END IF;lock_business(p_user,p_business);check_location(p_body);
    IF p_id IS NOT NULL THEN BEGIN before_value:=location_json(p_id,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Sucursal no disponible.');END;END IF;
    slug_value:=p_body.get_string('slug');name_value:=p_body.get_string('name');color_value:=p_body.get_string('color');active_value:=alliance_security.flag(p_body,'active');
    SELECT COUNT(*) INTO n FROM locations WHERE business_id=p_business AND active=1 AND id<>entity;
    IF active_value=0 AND n=0 THEN alliance_security.fail(409,'LAST_LOCATION','Conserva al menos una sucursal habilitada.');END IF;
    IF p_id IS NULL THEN INSERT INTO locations(id,business_id,slug,name,color,active) VALUES(entity,p_business,slug_value,name_value,color_value,active_value);
    ELSE UPDATE locations SET slug=slug_value,name=name_value,color=color_value,active=active_value WHERE id=entity AND business_id=p_business;END IF;
    IF p_id IS NULL AND active_value=1 THEN alliance_pos.initialize(p_business,entity);END IF;
    audit(p_user,p_business,'LOCATION_SAVE',entity,before_value,p_body.to_clob);
  END;
  PROCEDURE save_user(p_user VARCHAR2,p_business VARCHAR2,p_id VARCHAR2,p_body JSON_OBJECT_T,p_location VARCHAR2 DEFAULT NULL) IS
    entity VARCHAR2(36):=NVL(p_id,alliance_security.new_id);before_value CLOB;safe_body JSON_OBJECT_T;hash_value VARCHAR2(512);password_value VARCHAR2(128);n NUMBER;
    arr JSON_ARRAY_T;entry JSON_OBJECT_T;role_array JSON_ARRAY_T;overrides_json JSON_OBJECT_T;override_keys JSON_KEY_LIST;location_value VARCHAR2(36);role_value VARCHAR2(40);effect_value VARCHAR2(5);seen JSON_OBJECT_T:=JSON_OBJECT_T();permissions_json JSON_OBJECT_T;ctx JSON_OBJECT_T;
    name_value VARCHAR2(160);username_value users.username%TYPE;active_value NUMBER;actor_perms JSON_OBJECT_T;actor_array JSON_ARRAY_T;
  BEGIN
    lock_business(p_user,p_business);alliance_security.keys_only(p_body,'name,username,active,password,access');ctx:=alliance_security.context_for(p_user);actor_perms:=ctx.get_object('permissions');
    IF p_location IS NOT NULL THEN
      alliance_security.require_location(p_user,p_business,p_location,'administration.manage');
      IF p_id IS NOT NULL THEN SELECT COUNT(*) INTO n FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND location_id=p_location;IF n=0 THEN alliance_security.fail(403,'FORBIDDEN','Este usuario no pertenece al negocio abierto.');END IF;END IF;
    END IF;
    IF p_id IS NOT NULL THEN
      BEGIN before_value:=user_json(p_id,p_business).to_clob;EXCEPTION WHEN NO_DATA_FOUND THEN alliance_security.fail(404,'NOT_FOUND','Usuario no disponible.');END;
      IF alliance_security.owner(p_id,p_business) THEN alliance_security.fail(409,'PROTECTED_OWNER','La cuenta del propietario esta protegida.');END IF;
      FOR old_grant IN(SELECT location_id,role_code FROM user_location_roles WHERE business_id=p_business AND user_id=p_id AND (p_location IS NULL OR location_id=p_location))LOOP
       IF NOT manages(actor_perms,old_grant.location_id) OR (old_grant.role_code='BOSS' AND NOT alliance_security.location_owner(p_user,p_business,old_grant.location_id)) THEN alliance_security.fail(403,'FORBIDDEN','Este usuario tiene accesos que solo otro jefe puede gestionar.');END IF;
      END LOOP;
    END IF;
    name_value:=alliance_security.text_value(p_body,'name',160);username_value:=alliance_security.text_value(p_body,'username',320);active_value:=alliance_security.flag(p_body,'active');
    IF p_body.has('password') THEN password_value:=alliance_security.text_value(p_body,'password',128);IF LENGTH(password_value)<4 OR LENGTH(password_value)>12 THEN alliance_security.fail(400,'INVALID_PASSWORD','Usa una contrasena de 4 a 12 caracteres.');END IF;hash_value:=alliance_security.password_hash(password_value);END IF;
    IF p_id IS NULL AND hash_value IS NULL THEN alliance_security.fail(400,'PASSWORD_REQUIRED','Define la contrasena del nuevo usuario.');END IF;
    arr:=p_body.get_array('access');IF arr.get_size>100 THEN alliance_security.fail(400,'INVALID_INPUT','Demasiadas sucursales.');END IF;
    IF p_location IS NOT NULL AND p_id IS NULL AND arr.get_size<>1 THEN alliance_security.fail(403,'FORBIDDEN','El nuevo usuario debe tener acceso al negocio abierto.');END IF;
    IF p_id IS NULL THEN INSERT INTO users(id,business_id,username,full_name,password_hash,active) VALUES(entity,p_business,username_value,name_value,hash_value,active_value);
    ELSE UPDATE users SET full_name=name_value,username=username_value,active=active_value,password_hash=NVL(hash_value,password_hash) WHERE id=entity AND business_id=p_business;END IF;
    DELETE FROM user_location_permissions WHERE business_id=p_business AND user_id=entity AND (p_location IS NULL OR location_id=p_location);
    DELETE FROM user_location_roles WHERE business_id=p_business AND user_id=entity AND (p_location IS NULL OR location_id=p_location);
    FOR i IN 0..arr.get_size-1 LOOP
      entry:=TREAT(arr.get(i) AS JSON_OBJECT_T);alliance_security.keys_only(entry,'location_id,roles,overrides');location_value:=alliance_security.text_value(entry,'location_id',36);
      IF p_location IS NOT NULL AND location_value<>p_location THEN alliance_security.fail(403,'FORBIDDEN','Solo puedes gestionar usuarios del negocio abierto.');END IF;
       IF seen.has(location_value) THEN alliance_security.fail(400,'INVALID_INPUT','Cada sucursal debe aparecer una sola vez.');END IF;seen.put(location_value,TRUE);
      SELECT COUNT(*) INTO n FROM locations WHERE id=location_value AND business_id=p_business;IF n<>1 THEN alliance_security.fail(403,'FORBIDDEN','Sucursal no disponible en este negocio.');END IF;
      IF NOT manages(actor_perms,location_value) THEN alliance_security.fail(403,'FORBIDDEN','No puedes gestionar usuarios de ese negocio.');END IF;actor_array:=actor_perms.get_array(location_value);
      role_array:=entry.get_array('roles');IF role_array.get_size<1 OR role_array.get_size>7 THEN alliance_security.fail(400,'INVALID_INPUT','Selecciona un rol.');END IF;
      FOR j IN 0..role_array.get_size-1 LOOP role_value:=role_array.get_string(j);
        IF role_value IS NULL OR role_value NOT IN ('BOSS','WORKER','ADMIN','MANAGER','CASHIER','WAITER','KITCHEN','INVENTORY_MANAGER','ACCOUNTING') THEN alliance_security.fail(403,'FORBIDDEN','Rol no permitido.');END IF;
        IF role_value='BOSS' AND NOT alliance_security.location_owner(p_user,p_business,location_value) THEN alliance_security.fail(403,'FORBIDDEN','Solo un jefe puede asignar otro jefe.');END IF;
        BEGIN INSERT INTO user_location_roles VALUES(p_business,entity,location_value,role_value);EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;END;
      END LOOP;
      overrides_json:=entry.get_object('overrides');override_keys:=overrides_json.get_keys;
      FOR j IN 1..override_keys.COUNT LOOP
        SELECT COUNT(*) INTO n FROM permissions WHERE code=override_keys(j) AND code<>'sales.manage';IF n<>1 THEN alliance_security.fail(400,'INVALID_INPUT','Permiso no permitido.');END IF;
        effect_value:=overrides_json.get_string(override_keys(j));IF effect_value NOT IN ('ALLOW','DENY') OR effect_value IS NULL THEN alliance_security.fail(400,'INVALID_INPUT','Efecto no permitido.');END IF;
        INSERT INTO user_location_permissions VALUES(p_business,entity,location_value,override_keys(j),effect_value);
      END LOOP;
      IF NOT alliance_security.location_owner(p_user,p_business,location_value) THEN
       FOR target_permission IN(SELECT p.code FROM permissions p WHERE p.code<>'sales.manage' AND (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code=p.code) OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code=p.code AND o.effect='ALLOW')) AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code=p.code AND o.effect='DENY')) LOOP
        IF NOT contains_code(actor_array,target_permission.code) THEN alliance_security.fail(403,'FORBIDDEN','Solo puedes asignar los permisos que tienes en este negocio.');END IF;
       END LOOP;
      END IF;
      -- Enforce the read dependency even when this employee is inactive.
      SELECT COUNT(*) INTO n FROM (
        SELECT 'products.write' p FROM dual WHERE
          (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code='products.write')
           OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.write' AND effect='ALLOW'))
          AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.write' AND effect='DENY')
      );
      IF n>0 THEN
        SELECT COUNT(*) INTO n FROM dual WHERE
          (EXISTS(SELECT 1 FROM role_permissions rp JOIN user_location_roles g ON g.role_code=rp.role_code WHERE g.business_id=p_business AND g.user_id=entity AND g.location_id=location_value AND rp.permission_code='products.read')
           OR EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.read' AND effect='ALLOW'))
          AND NOT EXISTS(SELECT 1 FROM user_location_permissions o WHERE o.business_id=p_business AND o.user_id=entity AND o.location_id=location_value AND o.permission_code='products.read' AND effect='DENY');
        IF n=0 THEN alliance_security.fail(400,'INVALID_INPUT','Editar productos requiere consultar el catalogo.');END IF;
      END IF;
    END LOOP;
    UPDATE auth_sessions SET revoked=1 WHERE business_id=p_business AND user_id=entity;
    UPDATE alliance_api_sessions SET revoked=1 WHERE business_id=p_business AND user_id=entity;
    safe_body:=JSON_OBJECT_T(p_body.to_clob);safe_body.remove('password');safe_body.put('password_changed',hash_value IS NOT NULL);
    audit(p_user,p_business,'USER_ACCESS_SAVE',entity,before_value,safe_body.to_clob);
  END;
END;
/
