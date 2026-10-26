import '../apps/api/src/config.js';
import { createOraclePool, rows } from '../apps/api/src/oracle.js';
import { readFile, readdir } from 'node:fs/promises';
import { executeMigration, prepareMigration } from './sql-migration.js';
const pool=await createOraclePool();const c=await pool.getConnection();
try {
  const [exists]=await rows(c,"SELECT table_name FROM user_tables WHERE table_name='SCHEMA_MIGRATIONS'");
  if(!exists)await c.execute('CREATE TABLE schema_migrations (filename VARCHAR2(160) PRIMARY KEY, checksum VARCHAR2(64) NOT NULL, applied_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL)');
  const dir=new URL('../database/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) {
    const source=await readFile(new URL(file,dir),'utf8');const migration=prepareMigration(source);
    const [done]=await rows(c,'SELECT checksum FROM schema_migrations WHERE filename=:f',{f:file});
    if(done){if(done.CHECKSUM!==migration.checksum && done.CHECKSUM!==migration.previousChecksum)throw new Error(`Checksum cambió: ${file}`);continue;}
    console.log(`Aplicando ${file}`);
    await executeMigration(c,source);
    await c.execute('INSERT INTO schema_migrations(filename,checksum) VALUES (:f,:h)',{f:file,h:migration.checksum});await c.commit();
  }
  console.log('Migraciones Oracle aplicadas.');
}catch(e){await c.rollback();throw e;}finally{await c.close();await pool.close(0);}
