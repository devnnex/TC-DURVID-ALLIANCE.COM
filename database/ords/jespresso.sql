CREATE OR REPLACE PACKAGE alliance_jespresso AUTHID DEFINER AS
  PROCEDURE validate_sheet(s JSON_OBJECT_T);
  PROCEDURE validate_line(l JSON_OBJECT_T);
  FUNCTION approved_product(m JSON_OBJECT_T,r JSON_OBJECT_T) RETURN JSON_OBJECT_T;
END;
/
CREATE OR REPLACE PACKAGE BODY alliance_jespresso AS
  PROCEDURE num(o JSON_OBJECT_T,k VARCHAR2,lo NUMBER,hi NUMBER,optional BOOLEAN DEFAULT FALSE) IS n NUMBER;
  BEGIN
    IF NOT o.has(k) THEN alliance_security.fail(400,'COSTING_INPUT','Falta el campo '||k);END IF;
    IF o.get(k).is_null AND optional THEN RETURN;END IF;
    IF NOT o.get(k).is_number THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el valor de '||k);END IF;
    n:=o.get_number(k);IF n<lo OR n>hi THEN alliance_security.fail(400,'COSTING_INPUT','Valor fuera del rango: '||k);END IF;
  END;
  PROCEDURE short_text(o JSON_OBJECT_T,k VARCHAR2,max_length NUMBER) IS
  BEGIN IF NOT o.has(k) OR NOT o.get(k).is_string OR LENGTH(o.get_string(k))>max_length THEN alliance_security.fail(400,'COSTING_INPUT','Revisa el campo '||k);END IF;END;
  PROCEDURE validate_sheet(s JSON_OBJECT_T) IS a JSON_ARRAY_T;v JSON_OBJECT_T;
  BEGIN
    IF s IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Hoja de receta invalida.');END IF;
    alliance_security.keys_only(s,'version,responsible,date,code,quantity,workingDays,closingDays,monthlySales,operating,management,unforeseenPercent,factorPercent,capitalMode,capitalPercent,consumptionPercent,ivaPercent,source');
    num(s,'version',1,1);short_text(s,'responsible',160);short_text(s,'date',10);short_text(s,'code',80);short_text(s,'source',160);
    IF s.get_string('date') IS NOT NULL AND (NOT REGEXP_LIKE(s.get_string('date'),'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR VALIDATE_CONVERSION(s.get_string('date') AS DATE,'FXYYYY-MM-DD')=0) THEN alliance_security.fail(400,'COSTING_INPUT','Fecha de preparacion invalida.');END IF;
    num(s,'quantity',0.000001,1e12,TRUE);num(s,'workingDays',1,366);num(s,'closingDays',1,366);num(s,'monthlySales',0,1e12,TRUE);
    num(s,'unforeseenPercent',0,100);num(s,'factorPercent',0,10000);num(s,'capitalPercent',0,100);num(s,'consumptionPercent',0,100);num(s,'ivaPercent',0,100);
    IF s.get_string('capitalMode') IS NULL OR s.get_string('capitalMode') NOT IN('daily','manual') THEN alliance_security.fail(400,'COSTING_INPUT','Recuperacion de capital invalida.');END IF;
    FOR section IN 1..2 LOOP
      a:=s.get_array(CASE WHEN section=1 THEN 'operating' ELSE 'management' END);
      IF a IS NULL OR a.get_size>20 THEN alliance_security.fail(400,'COSTING_INPUT','Conceptos de la hoja invalidos.');END IF;
      FOR i IN 0..a.get_size-1 LOOP
        v:=TREAT(a.get(i) AS JSON_OBJECT_T);
        IF section=1 THEN alliance_security.keys_only(v,'name,detail,amount');num(v,'amount',0,1e12);short_text(v,'detail',160);
        ELSE alliance_security.keys_only(v,'name,percent');num(v,'percent',0,100);END IF;
        IF alliance_security.text_value(v,'name',160) IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Escribe el nombre del concepto.');END IF;
      END LOOP;
    END LOOP;
  END;
  PROCEDURE validate_line(l JSON_OBJECT_T) IS
  BEGIN
    IF l.has('stage') AND (l.get_string('stage') IS NULL OR l.get_string('stage') NOT IN('batch','portion')) THEN alliance_security.fail(400,'COSTING_INPUT','Aplicacion de ingrediente invalida.');END IF;
    IF l.has('manualCost') THEN num(l,'manualCost',0,1e12,TRUE);END IF;
  END;
  FUNCTION approved_product(m JSON_OBJECT_T,r JSON_OBJECT_T) RETURN JSON_OBJECT_T IS
    s JSON_OBJECT_T:=r.get_object('sheet');ingredients JSON_ARRAY_T:=m.get_array('ingredients');lines JSON_ARRAY_T:=r.get_array('lines');a JSON_ARRAY_T;row_json JSON_OBJECT_T;l JSON_OBJECT_T;i JSON_OBJECT_T;result JSON_OBJECT_T:=JSON_OBJECT_T();w JSON_OBJECT_T:=JSON_OBJECT_T();
    batch NUMBER:=0;extras NUMBER:=0;line_cost NUMBER;unit_price NUMBER;management_percent NUMBER:=0;unforeseen NUMBER;management NUMBER;preparation NUMBER;cost NUMBER;sale_base NUMBER;capital_percent NUMBER;capital NUMBER;consumption NUMBER;iva NUMBER;final_price NUMBER;price NUMBER;monthly_fixed NUMBER:=0;daily_value NUMBER;estimate NUMBER;tax_rate NUMBER;tax_amount NUMBER;net NUMBER;profit NUMBER;
    FUNCTION factor(u VARCHAR2) RETURN NUMBER IS BEGIN RETURN CASE WHEN u IN('kg','l') THEN 1000 WHEN u='lb' THEN 453.59237 ELSE 1 END;END;
  BEGIN
    validate_sheet(s);
    IF lines.get_size=0 THEN alliance_security.fail(400,'COSTING_GOAL','Agrega los ingredientes de la receta.');END IF;
    FOR k IN 0..lines.get_size-1 LOOP
      l:=TREAT(lines.get(k) AS JSON_OBJECT_T);validate_line(l);i:=NULL;
      FOR j IN 0..ingredients.get_size-1 LOOP row_json:=TREAT(ingredients.get(j) AS JSON_OBJECT_T);IF row_json.get_string('id')=l.get_string('ingredientId') THEN i:=row_json;EXIT;END IF;END LOOP;
      IF i IS NULL THEN alliance_security.fail(400,'COSTING_INPUT','Ingrediente no disponible.');END IF;
      IF l.has('manualCost') AND NOT l.get('manualCost').is_null THEN line_cost:=l.get_number('manualCost')/alliance_yield.factor(l);
      ELSE
        unit_price:=i.get_number('purchasePrice');IF i.get_boolean('recoverableTax') THEN unit_price:=unit_price/(1+i.get_number('purchaseTaxRate')/100);END IF;
        unit_price:=unit_price/i.get_number('quantity');
        line_cost:=l.get_number('quantity')/alliance_yield.factor(l)*factor(l.get_string('unit'))/factor(i.get_string('unit'))*unit_price;
      END IF;
      IF l.get_string('stage')='portion' THEN extras:=extras+line_cost;ELSE batch:=batch+line_cost;END IF;
    END LOOP;
    a:=s.get_array('management');FOR k IN 0..a.get_size-1 LOOP row_json:=TREAT(a.get(k) AS JSON_OBJECT_T);management_percent:=management_percent+row_json.get_number('percent');END LOOP;
    a:=s.get_array('operating');FOR k IN 0..a.get_size-1 LOOP row_json:=TREAT(a.get(k) AS JSON_OBJECT_T);monthly_fixed:=monthly_fixed+row_json.get_number('amount');END LOOP;
    unforeseen:=batch*s.get_number('unforeseenPercent')/100;management:=batch*management_percent/100;preparation:=batch+unforeseen+management;cost:=preparation/r.get_number('output')+extras;
    daily_value:=monthly_fixed/s.get_number('workingDays');estimate:=daily_value*s.get_number('closingDays');
    IF s.get_string('capitalMode')='daily' THEN capital_percent:=CASE WHEN estimate>0 THEN daily_value/estimate*100 ELSE 0 END;ELSE capital_percent:=s.get_number('capitalPercent');END IF;
    sale_base:=cost*s.get_number('factorPercent')/100;capital:=sale_base*capital_percent/100;consumption:=sale_base*s.get_number('consumptionPercent')/100;iva:=sale_base*s.get_number('ivaPercent')/100;final_price:=sale_base+capital+consumption+iva;
    price:=NVL(r.get_number('currentPrice'),final_price);
    IF price<=0 OR cost<=0 THEN alliance_security.fail(400,'COSTING_GOAL','Completa los costos y el factor de venta.');END IF;
    tax_rate:=(s.get_number('consumptionPercent')+s.get_number('ivaPercent'))/100;tax_amount:=price*tax_rate/(1+capital_percent/100+tax_rate);net:=price-tax_amount;profit:=net-cost;
    IF profit<0 THEN alliance_security.fail(400,'COSTING_GOAL','El precio no cubre el costo por porcion.');END IF;
    w.put('batchIngredients',batch);w.put('portionExtras',extras);w.put('managementPercent',management_percent);w.put('unforeseen',unforeseen);w.put('management',management);w.put('preparation',preparation);w.put('cost',cost);w.put('saleBase',sale_base);w.put('capitalPercent',capital_percent);w.put('capital',capital);w.put('consumption',consumption);w.put('iva',iva);w.put('final',final_price);w.put('monthlyFixed',monthly_fixed);w.put('dailyBreakEven',daily_value);w.put('monthlyEstimate',estimate);
    IF s.get('monthlySales').is_null THEN w.put_null('monthlyProfit');ELSE w.put('monthlyProfit',s.get_number('monthlySales')-monthly_fixed);END IF;
    result.put('worksheet',w);result.put('pricingBasis','production');result.put('recipeId',r.get_string('id'));result.put('name',r.get_string('name'));result.put('size',r.get_string('size'));result.put('channelName','Venta directa');result.put('cost',cost);result.put('price',price);result.put('profit',profit);result.put('actualPercent',profit/net*100);result.put('targetPercent',0);result.put('marginMode','margin');result.put('model',m);RETURN result;
  END;
END;
/
