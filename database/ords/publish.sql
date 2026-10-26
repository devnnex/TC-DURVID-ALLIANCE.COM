BEGIN
  ORDS.DEFINE_MODULE(p_module_name=>'alliance.api',p_base_path=>'alliance/api/v1/',p_status=>'PUBLISHED');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.api',p_pattern=>'rpc');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.api',p_pattern=>'rpc',p_method=>'POST',p_source_type=>ORDS.source_type_plsql,p_mimes_allowed=>'application/json',p_source=>q'~
    DECLARE
      payload CLOB:=:body_text;response_value CLOB;offset_value NUMBER:=1;
    BEGIN
      response_value:=alliance_api.dispatch(payload);
      OWA_UTIL.mime_header('application/json',FALSE);
      HTP.p('Cache-Control: no-store');OWA_UTIL.http_header_close;
      WHILE offset_value<=DBMS_LOB.GETLENGTH(response_value) LOOP
        HTP.prn(DBMS_LOB.SUBSTR(response_value,8000,offset_value));offset_value:=offset_value+8000;
      END LOOP;
    END;~');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.api',p_pattern=>'health');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.api',p_pattern=>'health',p_method=>'GET',p_source_type=>ORDS.source_type_collection_item,p_source=>q'~SELECT 'true' ok,'oracle-ords' provider,'0.3.0' version FROM dual~');
  -- An unprotected module with no origins list permits valid browser origins.
  -- Each private action is protected by our own application token and RBAC.
  -- No database credentials, SQL execution endpoint or browser cookies here.
  ORDS.SET_MODULE_ORIGINS_ALLOWED(p_module_name=>'alliance.api',p_origins_allowed=>NULL);
  -- file:// has the literal Origin null. Keep its CORS policy separate.
  ORDS.DEFINE_MODULE(p_module_name=>'alliance.file',p_base_path=>'alliance/api/v1/file/',p_status=>'PUBLISHED');
  ORDS.DEFINE_TEMPLATE(p_module_name=>'alliance.file',p_pattern=>'rpc');
  ORDS.DEFINE_HANDLER(p_module_name=>'alliance.file',p_pattern=>'rpc',p_method=>'POST',p_source_type=>ORDS.source_type_plsql,p_mimes_allowed=>'application/json',p_source=>q'~
    DECLARE payload CLOB:=:body_text;response_value CLOB;offset_value NUMBER:=1;
    BEGIN
      response_value:=alliance_api.dispatch(payload);OWA_UTIL.mime_header('application/json',FALSE);
      HTP.p('Cache-Control: no-store');OWA_UTIL.http_header_close;
      WHILE offset_value<=DBMS_LOB.GETLENGTH(response_value) LOOP HTP.prn(DBMS_LOB.SUBSTR(response_value,8000,offset_value));offset_value:=offset_value+8000;END LOOP;
    END;~');
  ORDS.SET_MODULE_ORIGINS_ALLOWED(p_module_name=>'alliance.file',p_origins_allowed=>'null');
  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
END;
