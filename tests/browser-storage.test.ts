import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
function fixture(blocked=false){
  const values=new Map<string,string>(),tab=new Map<string,string>();
  const local={get length(){return values.size;},key:(i:number)=>[...values.keys()][i],getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(blocked)throw Error('QuotaExceededError');values.set(k,v);},removeItem:(k:string)=>values.delete(k)};
  const session={getItem:(k:string)=>tab.get(k)??null,setItem:(k:string,v:string)=>tab.set(k,v),removeItem:(k:string)=>tab.delete(k)};
  const start=()=>{const context:any={localStorage:local,sessionStorage:session};runInNewContext(readFileSync('operational/browser-storage.js','utf8'),context);return context.AllianceBrowserStorage;};
  return {values,tab,start};
}
describe('Caché local opcional con cuota agotada',()=>{
  it('conserva la sesión en la pestaña y permite retirarla al salir',()=>{
    const f=fixture(true),storage=f.start();expect(storage.setItem('session-view','context')).toBe(false);
    expect(f.start().getItem('session-view')).toBe('context');storage.removeItem('session-view');expect(f.start().getItem('session-view')).toBeNull();
  });
  it('retira únicamente QR regenerables; conserva borradores, colas e historial',()=>{
    const f=fixture(true);const prefix='alliance-pos:business:branch:user:';
    const protectedNames=['form-draft:v1:form','costing-draft','tienda_napoles_appscript_outbox_v1','tienda_napoles_walk_in_drafts_v1','tienda_napoles_invoices_v1','tienda_napoles_inventory_movements_v1'];
    for(const name of ['qr-thumbnails-v2','la_licorera_17_supabase_bootstrap_v2_admin_staff',...protectedNames])f.values.set(prefix+name,'keep');
    const storage=f.start();expect(f.values.has(prefix+'qr-thumbnails-v2')).toBe(false);
    storage.setItem('session-view','context');expect(f.values.size).toBe(protectedNames.length);
    for(const name of protectedNames)expect(f.values.get(prefix+name)).toBe('keep');
  });
  it('un borrador nuevo puede guardarse después de retirar el anterior',()=>{
    const storage=fixture().start();storage.setRequiredItem('draft','first');storage.removeItem('draft');storage.setRequiredItem('draft','next');expect(storage.getItem('draft')).toBe('next');
  });
});
