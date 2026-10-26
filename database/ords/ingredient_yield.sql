CREATE OR REPLACE PACKAGE alliance_yield AUTHID DEFINER AS
  FUNCTION factor(line JSON_OBJECT_T) RETURN NUMBER;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_yield AS
  FUNCTION mask(state_value VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE state_value WHEN 'stored' THEN 0 WHEN 'thawed' THEN 1 WHEN 'cleaned' THEN 3 WHEN 'cooked' THEN 7 WHEN 'frozen-cleaned' THEN 2 WHEN 'frozen-cooked' THEN 6 ELSE -1 END;
  END;
  FUNCTION factor(line JSON_OBJECT_T) RETURN NUMBER IS
    p JSON_OBJECT_T;from_value NUMBER;to_value NUMBER;value NUMBER;result_value NUMBER:=1;key_value VARCHAR2(12);bit_value NUMBER;
  BEGIN
    IF NOT line.has('processing') THEN RETURN 1;END IF;p:=line.get_object('processing');IF p IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Configuracion de merma invalida.');END IF;
    alliance_security.keys_only(p,'version,stockState,recipeState,thaw,clean,cook');IF NOT p.has('version') OR NOT p.get('version').is_number OR p.get_number('version')<>1 THEN alliance_security.fail(400,'COSTING_INPUT','Configuracion de merma invalida.');END IF;
    from_value:=mask(p.get_string('stockState'));to_value:=CASE WHEN p.get_string('recipeState') IN('same','auto') THEN from_value ELSE mask(p.get_string('recipeState')) END;
    IF from_value<0 OR to_value<0 OR BITAND(from_value,to_value)<>from_value THEN alliance_security.fail(400,'COSTING_INPUT','El estado de la receta no puede deshacer la preparacion del inventario.');END IF;
    FOR i IN 1..3 LOOP key_value:=CASE i WHEN 1 THEN 'thaw' WHEN 2 THEN 'clean' ELSE 'cook' END;bit_value:=POWER(2,i-1);
      IF NOT p.has(key_value) OR NOT p.get(key_value).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el porcentaje de merma.');END IF;
      value:=p.get_number(key_value);IF value<0 OR value>99.999999 THEN alliance_security.fail(400,'COSTING_INPUT','El porcentaje de merma debe ser menor que 100.');END IF;
      IF p.get_string('recipeState')='auto' AND value>0 THEN to_value:=to_value+POWER(2,i)-1-BITAND(to_value,POWER(2,i)-1);END IF;
    END LOOP;
    FOR i IN 1..3 LOOP key_value:=CASE i WHEN 1 THEN 'thaw' WHEN 2 THEN 'clean' ELSE 'cook' END;bit_value:=POWER(2,i-1);IF BITAND(from_value,bit_value)=0 AND BITAND(to_value,bit_value)<>0 THEN result_value:=result_value*(1-p.get_number(key_value)/100);END IF;END LOOP;RETURN result_value;
  END;
END;
/
