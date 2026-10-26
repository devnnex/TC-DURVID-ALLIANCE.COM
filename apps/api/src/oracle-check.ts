import type oracledb from 'oracledb';
import { rows } from './oracle.js';
import { roleTemplates } from '../../../packages/shared/administration.js';
import { units } from '../../../packages/shared/domain.js';

export const requiredColumns:Record<string,string[]>={
  BUSINESSES:['ID','SLUG','NAME','CURRENCY','LOCALE','SETTINGS','CREATED_AT'], SETUP_LOCK:['ID'],
  LOCATIONS:['ID','BUSINESS_ID','SLUG','NAME','COLOR','ACTIVE','SETTINGS','CHANGE_CURSOR'],
  USERS:['ID','BUSINESS_ID','USERNAME','FULL_NAME','PASSWORD_HASH','ACTIVE'], ROLES:['CODE','NAME'],PERMISSIONS:['CODE'],ROLE_PERMISSIONS:['ROLE_CODE','PERMISSION_CODE'],
  USER_LOCATION_ROLES:['BUSINESS_ID','USER_ID','LOCATION_ID','ROLE_CODE'],
  AUTH_SESSIONS:['ID','BUSINESS_ID','USER_ID','REFRESH_HASH','EXPIRES_AT','CREATED_AT','REVOKED'],
  DEVICES:['ID','BUSINESS_ID','LOCATION_ID','USER_ID','NAME','APP_VERSION','LAST_SEEN'],
  UNITS_OF_MEASURE:['ID','NAME','DIMENSION','FACTOR'],PRODUCT_CATEGORIES:['ID','BUSINESS_ID','NAME'],
  PRODUCTS:['ID','BUSINESS_ID','SKU','NAME','CATEGORY_ID','PRICE_MINOR','KIND','UNIT_ID','ACTIVE','VERSION','UPDATED_AT'],INGREDIENTS:['ID','BUSINESS_ID','NAME','UNIT_ID','COST_MINOR'],
  SYNC_OPERATIONS:['BUSINESS_ID','OPERATION_ID','IDEMPOTENCY_KEY','LOCATION_ID','DEVICE_ID','USER_ID','PAYLOAD_HASH','ENTITY_ID','OPERATION_TYPE','CLIENT_CREATED_AT','SERVER_RECEIVED_AT','STATUS','PAYLOAD','RESULT'],
  AUDIT_LOG:['ID','BUSINESS_ID','LOCATION_ID','USER_ID','DEVICE_ID','OPERATION_ID','ACTION','ENTITY_ID','BEFORE_JSON','AFTER_JSON','CREATED_AT'],CHANGE_FEED:['BUSINESS_ID','LOCATION_ID','CURSOR_VALUE','PRODUCT_JSON'],
  USER_LOCATION_PERMISSIONS:['BUSINESS_ID','USER_ID','LOCATION_ID','PERMISSION_CODE','EFFECT'],ADMINISTRATION_AUDIT:['ID','BUSINESS_ID','ACTOR_USER_ID','ACTION','ENTITY_ID','BEFORE_JSON','AFTER_JSON','CREATED_AT']
};
export class SchemaNotReady extends Error {constructor(public issues:string[]){super('El esquema Oracle aún no está listo: '+issues.join('; '));}}
export async function checkOracle(pool:oracledb.Pool){
  const c=await pool.getConnection();try{
    await c.execute('SET TRANSACTION READ ONLY');
    const [identity]=await rows(c,"SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') schema_name FROM dual");
    const columns=await rows(c,'SELECT table_name,column_name FROM user_tab_columns');
    const issues:string[]=[];
    for(const [table,names] of Object.entries(requiredColumns)){
      const found=columns.filter(r=>r.TABLE_NAME===table).map(r=>r.COLUMN_NAME);
      if(!found.length)issues.push(`Falta ${table}`);else for(const name of names)if(!found.includes(name))issues.push(`Falta ${table}.${name}`);
    }
    if(issues.length)throw new SchemaNotReady(issues);
    const constraints=await rows(c,'SELECT table_name,status,validated FROM user_constraints');
    for(const r of constraints)if(requiredColumns[r.TABLE_NAME]&&(r.STATUS!=='ENABLED'||r.VALIDATED!=='VALIDATED'))issues.push(`Restricción pendiente en ${r.TABLE_NAME}`);
    const locks=await rows(c,'SELECT id FROM setup_lock WHERE id=1');if(locks.length!==1)issues.push('Falta setup_lock(1) de la migración 001');
    const grants=await rows(c,'SELECT role_code,permission_code FROM role_permissions');
    for(const role of roleTemplates)for(const permission of role.permissions)if(!grants.some(g=>g.ROLE_CODE===role.code&&g.PERMISSION_CODE===permission))issues.push(`Falta permiso ${role.code}/${permission}`);
    const measures=await rows(c,'SELECT id,dimension,factor FROM units_of_measure');
    for(const u of units)if(!measures.some(m=>m.ID===u.id&&m.DIMENSION===u.dimension&&Number(m.FACTOR)===Number(u.factor)))issues.push(`Unidad ${u.id} incompleta`);
    if(issues.length)throw new SchemaNotReady(issues);
    const [state]=await rows(c,'SELECT COUNT(*) n FROM businesses');
    return {schema:identity.SCHEMA_NAME,tables:Object.keys(requiredColumns).length,setup_required:state.N===0};
  }finally{await c.close();}
}
