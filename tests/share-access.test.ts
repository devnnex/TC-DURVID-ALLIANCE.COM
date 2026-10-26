import {describe,it,expect} from 'vitest';
import {accessPortalUrl} from '../apps/web/src/share-access';

describe('Enlaces de acceso por sucursal y rol',()=>{
  for(const embedded of [false,true])for(const slug of ['gcobarf','cocteleria','cafeteria','sucursal','nueva-sede'])for(const role of ['WAITER','ADMIN','WORKER','BOSS'])it(`${embedded?'panel del negocio':'centro operativo'}: ${slug}, ${role}`,()=>{
    const base='https://devnnex.github.io/TC-DURVID-ALLIANCE.COM/';
    const currentUrl=base+(embedded?'negocios/cocteleria/admin.html?branch=otra&demo=1#users':'admin/index.html?branch=otra');
    const url=new URL(accessPortalUrl({currentUrl,embedded,branch:{slug,name:'Sede & café'},roles:[role]}));
    expect(url.origin+url.pathname).toBe(base+'index.html');
    expect(url.searchParams.get('branch')).toBe(slug);
    expect(url.searchParams.get('mode')).toBe(role==='WAITER'?'waiter':'panel');
    expect(url.searchParams.has('demo')).toBe(false);expect(url.hash).toBe('');
    if(['sucursal','nueva-sede'].includes(slug))expect(url.searchParams.get('name')).toBe('Sede & café');
  });
  it('sin una sucursal conserva el acceso general',()=>{
    expect(accessPortalUrl({currentUrl:'https://example.com/site/admin/',embedded:false})).toBe('https://example.com/site/index.html');
  });
});
