import {readFile,writeFile} from 'node:fs/promises';
import dotenv from 'dotenv';
import * as webpush from 'web-push';
import {executeSql} from './ords-sql.js';
const root=new URL('../',import.meta.url),file=new URL('.env',root);
let text='';try{text=await readFile(file,'utf8');}catch{}
const values={...dotenv.parse(text),...process.env};
if(!!values.VAPID_PUBLIC_KEY!==!!values.VAPID_PRIVATE_KEY)throw Error('La configuración VAPID está incompleta. Conserva el par de claves original antes de continuar.');
if(!values.VAPID_PUBLIC_KEY||!values.VAPID_PRIVATE_KEY){
 const keys=webpush.generateVAPIDKeys();
 text=text.replace(/^VAPID_(?:PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=.*\r?\n?/gm,'');
 text+='\n# Privado: remitente de avisos de inventario.\nVAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey+'\nVAPID_SUBJECT=https://github.com/devnnex/TC-DURVID-ALLIANCE.COM\n';
 await writeFile(file,text,{mode:0o600});values.VAPID_PUBLIC_KEY=keys.publicKey;
 console.log('Claves de envío creadas en .env privado; no se muestran ni se incluyen en Git.');
}
if(process.argv.includes('--apply')){
 if(!values.ORACLE_PASSWORD&&!values.ORACLE_PASSWORD_BASE64)throw Error('Falta el acceso privado de mantenimiento de Oracle. El frontend y las claves permanecen preparados.');
 for(const name of ['019_stock_notifications.sql','stock_notifications.sql','pos_api.sql'])for(const statement of (await readFile(new URL('database/ords/'+name,root),'utf8')).split(/^\/\s*$/m).filter(s=>s.trim()))await executeSql(statement.trim());
 const errors=(await executeSql("SELECT name,line,text FROM user_errors WHERE name IN('ALLIANCE_STOCK_NOTIFICATIONS','ALLIANCE_POS')")).flatMap(r=>r.resultSet?.items||[]);if(errors.length)throw Error('Revisa la compilación del paquete de avisos antes de habilitar el remitente.');
 const key=String(values.VAPID_PUBLIC_KEY);if(!/^[A-Za-z0-9_-]{80,180}$/.test(key))throw Error('La clave pública no es válida.');
 await executeSql(`BEGIN UPDATE alliance_push_config SET public_key='${key}',enabled=1 WHERE id=1;COMMIT;END;`);
 console.log('API de avisos instalada y activada. Inicia el remitente privado con npm run notifications:worker.');
}else console.log('Instalación preparada. Para activar Oracle: npm run notifications:configure -- --apply.');
