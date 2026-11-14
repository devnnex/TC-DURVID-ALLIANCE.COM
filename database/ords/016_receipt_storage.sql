-- Lossless internal storage only. Request fingerprints and API replies stay unchanged.
DECLARE n NUMBER;BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='ALLIANCE_POS_RECEIPTS' AND column_name='RESULT_COMPRESSED';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE alliance_pos_receipts ADD (result_compressed BLOB)';END IF;
END;
/
CREATE OR REPLACE PACKAGE alliance_receipt_storage AUTHID DEFINER AS
  FUNCTION compress_result(t CLOB) RETURN BLOB;
  FUNCTION expand_result(t CLOB,z BLOB) RETURN CLOB;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_receipt_storage AS
  FUNCTION compress_result(t CLOB) RETURN BLOB IS
    source_value BLOB;compressed_value BLOB;dest_offset INTEGER:=1;src_offset INTEGER:=1;lang_context INTEGER:=0;warning INTEGER;
  BEGIN
    IF t IS NULL OR DBMS_LOB.GETLENGTH(t)<8192 THEN RETURN NULL;END IF;
    DBMS_LOB.CREATETEMPORARY(source_value,TRUE,DBMS_LOB.CALL);
    DBMS_LOB.CONVERTTOBLOB(source_value,t,DBMS_LOB.LOBMAXSIZE,dest_offset,src_offset,NLS_CHARSET_ID('AL32UTF8'),lang_context,warning);
    IF warning<>0 THEN RAISE_APPLICATION_ERROR(-20003,'No fue posible preservar el texto del comprobante.');END IF;
    compressed_value:=UTL_COMPRESS.LZ_COMPRESS(source_value,1);
    IF DBMS_LOB.GETLENGTH(compressed_value)>=DBMS_LOB.GETLENGTH(source_value)*0.85 THEN DBMS_LOB.FREETEMPORARY(compressed_value);compressed_value:=NULL;END IF;
    DBMS_LOB.FREETEMPORARY(source_value);RETURN compressed_value;
  EXCEPTION WHEN OTHERS THEN
    IF DBMS_LOB.ISTEMPORARY(source_value)=1 THEN DBMS_LOB.FREETEMPORARY(source_value);END IF;
    IF DBMS_LOB.ISTEMPORARY(compressed_value)=1 THEN DBMS_LOB.FREETEMPORARY(compressed_value);END IF;
    RAISE;
  END;
  FUNCTION expand_result(t CLOB,z BLOB) RETURN CLOB IS
    expanded_value BLOB;answer CLOB;dest_offset INTEGER:=1;src_offset INTEGER:=1;lang_context INTEGER:=0;warning INTEGER;
  BEGIN
    IF z IS NULL THEN RETURN t;END IF;
    expanded_value:=UTL_COMPRESS.LZ_UNCOMPRESS(z);DBMS_LOB.CREATETEMPORARY(answer,TRUE,DBMS_LOB.CALL);
    DBMS_LOB.CONVERTTOCLOB(answer,expanded_value,DBMS_LOB.LOBMAXSIZE,dest_offset,src_offset,NLS_CHARSET_ID('AL32UTF8'),lang_context,warning);
    IF warning<>0 THEN RAISE_APPLICATION_ERROR(-20003,'No fue posible leer el comprobante completo.');END IF;
    DBMS_LOB.FREETEMPORARY(expanded_value);RETURN answer;
  EXCEPTION WHEN OTHERS THEN
    IF DBMS_LOB.ISTEMPORARY(expanded_value)=1 THEN DBMS_LOB.FREETEMPORARY(expanded_value);END IF;
    IF DBMS_LOB.ISTEMPORARY(answer)=1 THEN DBMS_LOB.FREETEMPORARY(answer);END IF;
    RAISE;
  END;
END;
/
