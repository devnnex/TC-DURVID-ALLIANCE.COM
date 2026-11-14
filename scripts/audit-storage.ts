import {executeSql} from './ords-sql.js';
// Aggregate metadata only: never print customers, credentials, invoices or logos.
const queries=[
  "SELECT SUM(bytes) schema_allocated_bytes FROM user_segments",
  "SELECT COUNT(*) receipts,SUM(DBMS_LOB.GETLENGTH(result_json)) json_characters,SUM(NVL(DBMS_LOB.GETLENGTH(result_compressed),0)) compressed_bytes,SUM(CASE WHEN result_compressed IS NOT NULL THEN 1 ELSE 0 END) compressed_receipts FROM alliance_pos_receipts",
  "SELECT entity,COUNT(*) records,SUM(DBMS_LOB.GETLENGTH(data_json)) json_characters FROM alliance_pos_documents GROUP BY entity ORDER BY json_characters DESC FETCH FIRST 12 ROWS ONLY"
];
for(const query of queries){const results=await executeSql(query);console.log(JSON.stringify(results.flatMap(r=>r.resultSet?.items||[])));}
