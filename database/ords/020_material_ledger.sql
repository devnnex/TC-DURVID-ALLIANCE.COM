-- Immutable scoped receipt facts. Existing inventory and GCOBARF figures are not rewritten.
DECLARE
 PROCEDURE create_once(ddl VARCHAR2) IS BEGIN EXECUTE IMMEDIATE ddl;EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN(-955,-2264,-2275) THEN RAISE;END IF;END;
BEGIN
 create_once('CREATE TABLE alliance_material_entries (business_id VARCHAR2(36) NOT NULL,location_id VARCHAR2(36) NOT NULL,id VARCHAR2(64) NOT NULL,movement_id VARCHAR2(160),ingredient_id VARCHAR2(80) NOT NULL,name VARCHAR2(160) NOT NULL,unit_id VARCHAR2(12) NOT NULL,quantity_delta NUMBER NOT NULL,stock_before NUMBER NOT NULL,stock_after NUMBER NOT NULL,cost_before NUMBER NOT NULL,cost_after NUMBER NOT NULL,unit_cost NUMBER NOT NULL,total_cost NUMBER NOT NULL,source VARCHAR2(24) NOT NULL,kind VARCHAR2(24),estimated NUMBER(1) NOT NULL,reference VARCHAR2(300),actor_id VARCHAR2(36),actor_name VARCHAR2(160),occurred_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,PRIMARY KEY(business_id,location_id,id))');
 create_once('CREATE INDEX alliance_material_period_idx ON alliance_material_entries(business_id,location_id,occurred_at,id)');
 create_once('CREATE INDEX alliance_material_item_idx ON alliance_material_entries(business_id,location_id,ingredient_id,occurred_at,id)');
 create_once('ALTER TABLE alliance_material_entries ADD CONSTRAINT alliance_material_business_fk FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE');
 EXECUTE IMMEDIATE 'ALTER TABLE alliance_material_entries MODIFY (reference VARCHAR2(300 CHAR))';
END;
/
-- Older movement prices are valuation references, not reconstructed invoices.
MERGE INTO alliance_material_entries e USING(
 SELECT m.*,s.name,s.unit_id,u.full_name,LOWER(RAWTOHEX(STANDARD_HASH('movement:'||m.id,'SHA256'))) entry_id
 FROM alliance_raw_movements m JOIN locations l ON l.business_id=m.business_id AND l.id=m.location_id
 JOIN alliance_raw_stock s ON s.business_id=m.business_id AND s.location_id=m.location_id AND s.id=m.ingredient_id
 LEFT JOIN users u ON u.business_id=m.business_id AND u.id=m.actor_user_id
 WHERE l.slug IN('cafeteria','cocteleria') AND (m.delta>0 OR m.kind IN('out','adjustment'))
) v ON(e.business_id=v.business_id AND e.location_id=v.location_id AND e.id=v.entry_id)
WHEN NOT MATCHED THEN INSERT(business_id,location_id,id,movement_id,ingredient_id,name,unit_id,quantity_delta,stock_before,stock_after,cost_before,cost_after,unit_cost,total_cost,source,kind,estimated,reference,actor_id,actor_name,occurred_at)
VALUES(v.business_id,v.location_id,v.entry_id,v.id,v.ingredient_id,v.name,v.unit_id,v.delta,v.stock_before,v.stock_after,v.unit_cost,v.unit_cost,v.unit_cost,ABS(v.delta)*v.unit_cost,'legacy',v.kind,1,v.reference,v.actor_user_id,NVL(v.full_name,'Usuario anterior'),v.created_at);
/
