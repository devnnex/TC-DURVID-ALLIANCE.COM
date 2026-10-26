import { config } from './config.js';
import { createApp } from './app.js';
import { MemoryRepository } from './memory.js';
import { createOraclePool, OracleRepository } from './oracle.js';
import { checkOracle, SchemaNotReady } from './oracle-check.js';
import { oracleErrorMessage } from './oracle-settings.js';
import type { Repository } from './repository.js';
let repo:Repository|undefined;
try{
  const cfg=config();
  if(cfg.provider==='memory')repo=new MemoryRepository();
  else {
    const pool=await createOraclePool();repo=new OracleRepository(pool);
    const status=await checkOracle(pool);console.log(`Oracle listo: esquema ${status.schema}, ${status.tables} tablas. Frontend: ${cfg.origin}/admin/`);
  }
  const app=await createApp(repo,cfg);await app.listen({host:cfg.host,port:cfg.port});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,async()=>{await app.close();process.exit(0);});
}catch(e){
  console.error(e instanceof SchemaNotReady?e.message:e instanceof Error&&e.message.startsWith('Configura JWT_SECRET')?e.message:oracleErrorMessage(e));
  if(repo)await repo.close();process.exitCode=1;
}
