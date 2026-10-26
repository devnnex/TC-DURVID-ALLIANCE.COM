import { describe,expect,it,vi,afterEach } from 'vitest';
import { mkdir,mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import type oracledb from 'oracledb';
import dotenv from 'dotenv';
import { initializeEnv,saveOracleEnv } from '../scripts/local-env';
import { oracleSettings,oracleErrorMessage } from '../apps/api/src/oracle-settings';
import { checkOracle,requiredColumns } from '../apps/api/src/oracle-check';
import { roleTemplates } from '../packages/shared/administration';
import { units } from '../packages/shared/domain';
import { createApp } from '../apps/api/src/app';
import { MemoryRepository } from '../apps/api/src/memory';
import { api,HttpError,setAccess } from '../apps/web/src/api';

const base={ORACLE_USER:'ADMIN',ORACLE_PASSWORD:'test-password',ORACLE_CONNECTION_MODE:'TLS',ORACLE_CONNECT_STRING:'(description=(address=(protocol=tcps)(host=example.invalid)(port=1521))(connect_data=(service_name=test)))'};
const project=resolve('.'),temporaryBase=join(project,'.tools');
async function temporary<T>(fn:(root:string)=>Promise<T>){await mkdir(temporaryBase,{recursive:true});const root=await mkdtemp(join(temporaryBase,'oracle-test-'));try{return await fn(root);}finally{if(!resolve(root).startsWith(temporaryBase+sep))throw new Error('Unexpected cleanup path');await rm(root,{recursive:true,force:true});}}
afterEach(()=>{vi.unstubAllGlobals();setAccess('');});
describe('Configuración local Oracle',()=>{
  it('genera secretos distintos y no reemplaza un .env existente',async()=>temporary(async root=>{
    await writeFile(join(root,'.env.example'),'JWT_SECRET=\nSETUP_TOKEN=\nWEB_ORIGIN=http://localhost:5173\n');
    expect(await initializeEnv(root)).toBe(true);const initial=await readFile(join(root,'.env'),'utf8'),env=dotenv.parse(initial);
    expect(env.JWT_SECRET).toHaveLength(64);expect(env.SETUP_TOKEN).toHaveLength(64);expect(env.JWT_SECRET).not.toBe(env.SETUP_TOKEN);
    expect(await initializeEnv(root)).toBe(false);expect(await readFile(join(root,'.env'),'utf8')).toBe(initial);
    const password="special-'\"`#\\password";await saveOracleEnv(root,{...base,ORACLE_PASSWORD:password});
    const saved=dotenv.parse(await readFile(join(root,'.env'),'utf8'));expect(saved.JWT_SECRET).toBe(env.JWT_SECRET);expect(saved.SETUP_TOKEN).toBe(env.SETUP_TOKEN);expect(saved.ORACLE_PASSWORD).toBe('');expect(oracleSettings(saved).password).toBe(password);
    expect(saved.DATA_PROVIDER).toBe('oracle');expect(saved.WEB_ORIGIN).toBe('http://127.0.0.1:4173');
  }));
  it('acepta TLS seguro y rechaza URL de editor, configuración incompleta y wallet incompleto',()=>{
    expect(oracleSettings(base).sslServerDNMatch).toBe(true);
    expect(()=>oracleSettings({...base,ORACLE_CONNECT_STRING:'https://example.invalid/ords/sql-developer'})).toThrow('URL de Database Actions');
    expect(()=>oracleSettings({...base,ORACLE_PASSWORD:''})).toThrow('Faltan los datos');
    expect(()=>oracleSettings({...base,ORACLE_CONNECTION_MODE:'MTLS'})).toThrow('ewallet.pem');
  });
  it('acepta los archivos de wallet sin requerir cambios de frontend',async()=>temporary(async root=>{
    await writeFile(join(root,'ewallet.pem'),'fixture');await writeFile(join(root,'tnsnames.ora'),'fixture');
    const cfg=oracleSettings({...base,ORACLE_CONNECTION_MODE:'MTLS',ORACLE_CONNECT_STRING:'test_tp',ORACLE_CONFIG_DIR:root,ORACLE_WALLET_LOCATION:root,ORACLE_WALLET_PASSWORD:'wallet-test'});
    expect(cfg.walletLocation).toBe(root);expect(cfg.walletPassword).toBe('wallet-test');
  }));
  it('traduce errores de conexión sin exponer contraseñas ni descriptores',()=>{
    expect(oracleErrorMessage(new Error('ORA-01017: secret-password bad'))).not.toContain('secret-password');
    expect(oracleErrorMessage(new Error('NJS-518: (host=private-host)'))).not.toContain('private-host');
    expect(oracleErrorMessage(new Error('ORA-12506: ACL'))).toContain('política de red');
  });
});
describe('Comprobación del esquema antes del arranque',()=>{
  const fixture=(missing?:string)=>{
    const c={execute:vi.fn(async(sql:string):Promise<any>=>{
      if(sql.includes('SYS_CONTEXT'))return {rows:[{SCHEMA_NAME:'ADMIN'}]};
      if(sql.includes('user_tab_columns'))return {rows:Object.entries(requiredColumns).filter(([t])=>t!==missing).flatMap(([TABLE_NAME,cols])=>cols.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))};
      if(sql.includes('user_constraints'))return {rows:[{TABLE_NAME:'USERS',STATUS:'ENABLED',VALIDATED:'VALIDATED'}]};
      if(sql.includes('FROM setup_lock'))return {rows:[{ID:1}]};
      if(sql.includes('FROM role_permissions'))return {rows:roleTemplates.flatMap(r=>r.permissions.map(PERMISSION_CODE=>({ROLE_CODE:r.code,PERMISSION_CODE})))};
      if(sql.includes('FROM units_of_measure'))return {rows:units.map(u=>({ID:u.id,DIMENSION:u.dimension,FACTOR:Number(u.factor)}))};
      if(sql.includes('COUNT(*)'))return {rows:[{N:0}]};return {rows:[]};
    }),close:vi.fn(async()=>{})};
    return {c,pool:{getConnection:async()=>c} as unknown as oracledb.Pool};
  };
  it('comprueba 19 tablas y referencia sin repetir migraciones ni crear usuarios',async()=>{
    const {c,pool}=fixture();expect(await checkOracle(pool)).toEqual({schema:'ADMIN',tables:19,setup_required:true});expect(c.close).toHaveBeenCalledOnce();
    expect(c.execute.mock.calls.every(([sql])=>/^(SELECT|SET TRANSACTION READ ONLY)/.test(sql))).toBe(true);
  });
  it('rechaza una migración pendiente y cierra la conexión',async()=>{
    const {c,pool}=fixture('USER_LOCATION_PERMISSIONS');await expect(checkOracle(pool)).rejects.toMatchObject({issues:['Falta USER_LOCATION_PERMISSIONS']});expect(c.close).toHaveBeenCalledOnce();
  });
  it('rechaza permisos o unidades incompletos',async()=>{
    const {c,pool}=fixture(),execute=c.execute.getMockImplementation()!;c.execute.mockImplementation(async sql=>sql.includes('FROM role_permissions')||sql.includes('FROM units_of_measure')?{rows:[]}:execute(sql));
    await expect(checkOracle(pool)).rejects.toThrow('Falta permiso OWNER');expect(c.close).toHaveBeenCalledOnce();
  });
});
describe('Estado real para el frontend',()=>{
  it('responde 503 si la base no responde y reconoce instalación ya realizada',async()=>{
    const repo=new MemoryRepository(),app=await createApp(repo,{secret:'s'.repeat(64),setupToken:'t'.repeat(64),provider:'memory',origin:'http://localhost:5173',production:false});app.log.level='silent';
    try{
      expect((await app.inject({url:'/api/v1/installation'})).json().setup_required).toBe(true);
      await repo.setup({slug:'test',business_name:'Test',location_name:'Principal',name:'Owner',username:'owner',password_hash:'test-hash'});
      expect((await app.inject({url:'/api/v1/installation'})).json().setup_required).toBe(false);
      repo.health=async()=>false;expect((await app.inject({url:'/api/v1/health'})).statusCode).toBe(503);expect((await app.inject({url:'/api/v1/installation'})).statusCode).toBe(503);
    }finally{await app.close();}
  });
  it('convierte fallo de red y respuesta HTML en mensajes comprensibles',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('Failed to fetch');}));await expect(api('/installation',{},undefined,false)).rejects.toMatchObject({status:503,message:expect.stringContaining('Comprueba tu conexión')});
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>proxy unavailable</html>',{status:502})));await expect(api('/installation',{},undefined,false)).rejects.toBeInstanceOf(HttpError);await expect(api('/installation',{},undefined,false)).rejects.toThrow('El servidor no está disponible');
  });
});
