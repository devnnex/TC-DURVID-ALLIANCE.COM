// Explicitly requested review account. Retained until the user requests removal.
// The normal registration/password policy stays unchanged.
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {executeSql} from './ords-sql.js';
import {defaultLocations} from '../packages/shared/administration.js';
const password=process.env.TEMPORARY_REVIEW_PASSWORD;
if(!password)throw new Error('Falta TEMPORARY_REVIEW_PASSWORD en .env privado.');
const salt=randomBytes(16).toString('hex');
const hash='pbkdf2-sha256$600000$'+salt+'$'+pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'";
await executeSql(`DECLARE b VARCHAR2(36);u VARCHAR2(36);l VARCHAR2(36);n NUMBER;existing_name VARCHAR2(160);BEGIN
  SELECT COUNT(*) INTO n FROM businesses WHERE slug='tc-alliance';
  IF n=0 THEN b:=alliance_security.new_id;INSERT INTO businesses(id,slug,name,settings)VALUES(b,'tc-alliance','TC-DURVID Alliance','{"currency":"COP","locale":"es-CO","allow_negative_stock":false}');ELSE SELECT id INTO b FROM businesses WHERE slug='tc-alliance';END IF;
  SELECT id INTO l FROM businesses WHERE id=b FOR UPDATE;
  SELECT COUNT(*) INTO n FROM users WHERE business_id=b AND username='admin';
  IF n>0 THEN SELECT id,full_name INTO u,existing_name FROM users WHERE business_id=b AND username='admin';IF existing_name<>'Administrador temporal' THEN RAISE_APPLICATION_ERROR(-20002,'Ya existe otra cuenta admin. No se modifico.');END IF;
  ELSE u:=alliance_security.new_id;INSERT INTO users(id,business_id,username,full_name,password_hash)VALUES(u,b,'admin','Administrador temporal',${literal(hash)});END IF;
  ${defaultLocations.map(v=>`SELECT COUNT(*) INTO n FROM locations WHERE business_id=b AND slug=${literal(v.slug)};IF n=0 THEN l:=alliance_security.new_id;INSERT INTO locations(id,business_id,slug,name,color,active)VALUES(l,b,${literal(v.slug)},${literal(v.name)},${literal(v.color)},${v.active?1:0});ELSE SELECT id INTO l FROM locations WHERE business_id=b AND slug=${literal(v.slug)};END IF;MERGE INTO user_location_roles g USING(SELECT b business_id,u user_id,l location_id,'OWNER' role_code FROM dual)s ON(g.business_id=s.business_id AND g.user_id=s.user_id AND g.location_id=s.location_id AND g.role_code=s.role_code) WHEN NOT MATCHED THEN INSERT(business_id,user_id,location_id,role_code)VALUES(s.business_id,s.user_id,s.location_id,s.role_code);${v.active?'alliance_pos.initialize(b,l);':''}`).join('\n')}
  INSERT INTO administration_audit(id,business_id,actor_user_id,action,entity_id,after_json)VALUES(alliance_security.new_id,b,u,'TEMPORARY_ADMIN_REVIEW',u,'{"username":"admin","temporary":true,"retention":"until_user_requests_removal"}');
  COMMIT;EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;END;`);
console.log('Cuenta temporal de revisión disponible en tc-alliance y sus tres sucursales. No se eliminará automáticamente.');
