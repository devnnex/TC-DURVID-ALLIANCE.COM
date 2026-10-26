import '../apps/api/src/config.js';
import { createOraclePool, OracleRepository } from '../apps/api/src/oracle.js';
import { demoContext, demoBootstrap } from '../packages/shared/demo.js';
import { hashPassword } from '../apps/api/src/password.js';
import { randomUUID } from 'node:crypto';
const password=process.env.SEED_OWNER_PASSWORD||'';
if(password.length<12)throw new Error('Configura SEED_OWNER_PASSWORD de al menos 12 caracteres. Seed solo en esquema de prueba.');
if(process.env.NODE_ENV==='production')throw new Error('Seed de demostración prohibido en producción.');
const repo=new OracleRepository(await createOraclePool());
try{
  const context=await repo.setup({slug:'alliance-demo',business_name:'TC-DURVID Alliance · Prueba',location_name:demoContext.locations[0].name,name:'Owner de prueba',username:'owner',password_hash:await hashPassword(password)});
  await repo.using(async c=>{try{
    await c.execute('UPDATE locations SET slug=:slug,color=:color WHERE id=:id',{slug:'gcobarf',color:demoContext.locations[0].color,id:context.locations[0].id});
    for(const l of demoContext.locations.slice(1)){
      await c.execute('INSERT INTO locations(id,business_id,slug,name,color,active) VALUES (:id,:b,:slug,:name,:color,:active)',{id:l.id,b:context.user.business_id,slug:l.slug,name:l.name,color:l.color,active:l.active?1:0});
      await c.execute("INSERT INTO user_location_roles VALUES (:b,:u,:l,'OWNER')",{b:context.user.business_id,u:context.user.id,l:l.id});
    }
    const categories=new Map<string,string>();
    for(const l of demoContext.locations)for(const p of demoBootstrap(l.id).products){
      let categoryId=categories.get(p.category);
      if(!categoryId){categoryId=randomUUID();categories.set(p.category,categoryId);await c.execute('INSERT INTO product_categories(id,business_id,name) VALUES (:id,:b,:name)',{id:categoryId,b:context.user.business_id,name:p.category});}
      await c.execute('INSERT INTO products(id,business_id,name,sku,category_id,price_minor,kind,unit_id) VALUES (:id,:b,:name,:sku,:category,TO_NUMBER(:price),:kind,:unit)',{id:p.id,b:context.user.business_id,name:p.name,sku:p.sku,category:categoryId,price:p.price_minor,kind:p.kind,unit:p.unit_id});
    }
    await c.commit();
  }catch(e){await c.rollback();throw e;}});
  console.log('Seed de catálogo: 1 business, 4 locations (cuarta inactiva), OWNER, unidades y productos. No contiene ventas ni stock inventado.');
}finally{await repo.close();}
