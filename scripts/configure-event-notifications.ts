/* Run on the private administration workstation. Never copy the dispatch token to the frontend. */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {executeSql} from './ords-sql.js';
const quote=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const portable=join(process.env.TEMP||'','alliance-publish-tools/gh/bin/gh.exe');
let token=process.env.GITHUB_TOKEN||'';
try{
 if(!token)token=execFileSync(existsSync(portable)?portable:'gh',['auth','token','--hostname','github.com'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 if(token.length<30||token.length>1000)throw Error('Missing private credential');
 const response=await fetch('https://api.github.com/repos/devnnex/TC-DURVID-ALLIANCE.COM/actions/workflows/stock-notifications.yml',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Workflow access unavailable');
 await executeSql(`BEGIN UPDATE alliance_notice_config SET dispatch_url='https://api.github.com/repos/devnnex/TC-DURVID-ALLIANCE.COM/actions/workflows/stock-notifications.yml/dispatches',dispatch_token=${quote(token)},enabled=0,next_dispatch=NULL WHERE id=1;COMMIT;END;`);
 await executeSql("BEGIN DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(host=>'api.github.com',lower_port=>443,upper_port=>443,ace=>xs$ace_type(privilege_list=>xs$name_list('http'),principal_name=>SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),principal_type=>xs_acl.ptype_db));END;");
 await executeSql(`DECLARE n NUMBER;BEGIN SELECT COUNT(*) INTO n FROM user_scheduler_jobs WHERE job_name='ALLIANCE_NOTICE_DISPATCH';IF n=0 THEN DBMS_SCHEDULER.CREATE_JOB(job_name=>'ALLIANCE_NOTICE_DISPATCH',job_type=>'PLSQL_BLOCK',job_action=>'BEGIN alliance_notices.dispatch_pending; END;',start_date=>SYSTIMESTAMP,repeat_interval=>'FREQ=SECONDLY;INTERVAL=15',enabled=>FALSE,auto_drop=>FALSE,comments=>'Dispatch pending business notices; no browser request waits for HTTP.');END IF;END;`);
 if(process.argv.includes('--enable')){await executeSql("DECLARE n NUMBER;BEGIN UPDATE alliance_notice_config SET enabled=1 WHERE id=1;COMMIT;SELECT COUNT(*) INTO n FROM user_scheduler_jobs WHERE job_name='ALLIANCE_NOTICE_DISPATCH' AND enabled='FALSE';IF n>0 THEN DBMS_SCHEDULER.ENABLE('ALLIANCE_NOTICE_DISPATCH');END IF;END;");console.log('Activación por eventos habilitada.');}else console.log('Configuración privada preparada; activar con --enable tras publicar el remitente.');
}catch{console.error('No se pudo configurar la activación privada de avisos. Las credenciales no se muestran.');process.exitCode=1;}
finally{token='';}
