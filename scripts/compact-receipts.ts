import {executeSql} from './ords-sql.js';
// Optional maintenance, never part of login or normal transaction processing.
// No history, fingerprints or rows are deleted. Old and new encodings can coexist.
if(!process.argv.includes('--apply')){
  console.log('Solo lectura. Para comprimir comprobantes existentes sin perder datos: tsx scripts/compact-receipts.ts --apply');
  const rows=await executeSql("SELECT COUNT(*) eligible_receipts,SUM(DBMS_LOB.GETLENGTH(result_json)) json_characters FROM alliance_pos_receipts WHERE result_compressed IS NULL AND DBMS_LOB.GETLENGTH(result_json)>=8192");
  console.log(JSON.stringify(rows.flatMap(r=>r.resultSet?.items||[])));
}else{
  const results=await executeSql(`DECLARE compressed_value BLOB;expanded_value CLOB;n INTEGER:=0;BEGIN
    FOR x IN(SELECT ROWID rid,result_json FROM alliance_pos_receipts WHERE result_compressed IS NULL AND DBMS_LOB.GETLENGTH(result_json)>=8192) LOOP
      compressed_value:=alliance_receipt_storage.compress_result(x.result_json);
      IF compressed_value IS NOT NULL THEN
        expanded_value:=alliance_receipt_storage.expand_result(NULL,compressed_value);
        IF DBMS_LOB.COMPARE(expanded_value,x.result_json)<>0 THEN RAISE_APPLICATION_ERROR(-20003,'La verificación de integridad no coincidió. Se conserva el original.');END IF;
        UPDATE alliance_pos_receipts SET result_json='{"codec":"gzip-v1"}',result_compressed=compressed_value WHERE ROWID=x.rid AND result_compressed IS NULL;
        DBMS_LOB.FREETEMPORARY(expanded_value);DBMS_LOB.FREETEMPORARY(compressed_value);n:=n+1;
        IF MOD(n,50)=0 THEN COMMIT;END IF;
      END IF;
    END LOOP;COMMIT;
  EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    IF DBMS_LOB.ISTEMPORARY(expanded_value)=1 THEN DBMS_LOB.FREETEMPORARY(expanded_value);END IF;
    IF DBMS_LOB.ISTEMPORARY(compressed_value)=1 THEN DBMS_LOB.FREETEMPORARY(compressed_value);END IF;
    RAISE;
  END;`);
  console.log('Compresión verificada, sin retirar registros.',JSON.stringify(results.flatMap(r=>r.response||[])));
}
