import type { Bootstrap, Context, Product } from './domain.js';
import { permissionCodes } from './administration.js';
import { units } from './domain.js';
export const DEMO_BUSINESS = '11111111-1111-4111-8111-111111111111';
export const DEMO_USER = '22222222-2222-4222-8222-222222222222';
const names = ["GCOBARF Nutripet’s", 'Jespresso Olivia · Coctelería', 'Jespresso Olivia · Cafetería', 'Cuarto espacio'];
const slugs = ['gcobarf', 'cocteleria', 'cafeteria', 'reservado'];
export const demoContext: Context = {
  user: { id: DEMO_USER, business_id: DEMO_BUSINESS, business_slug: 'alliance-demo', name: 'Equipo Alliance', username: 'owner' },
  locations: names.map((name, i) => ({ id: `33333333-3333-4333-8333-33333333333${i}`, business_id: DEMO_BUSINESS, name, slug: slugs[i], color: ['#407dd6','#a47a47','#9b613e','#767680'][i], active: i < 3 })),
  is_owner:true,
  permissions: Object.fromEntries(names.map((_, i) => [`33333333-3333-4333-8333-33333333333${i}`, [...permissionCodes,'administration.manage']]))
};
export function demoBootstrap(locationId: string): Bootstrap {
  const location = demoContext.locations.find(l => l.id === locationId)!;
  const menu: Record<string, [string,string,string,string][]> = {
    gcobarf: [['Porción natural · Pollo','PT-001','Alimento natural','1800000'],['Porción natural · Res','PT-002','Alimento natural','2200000'],['Snack deshidratado','SN-001','Snacks','1200000']],
    cocteleria: [['Mojito clásico','CT-001','Clásicos','2800000'],['Margarita','CT-002','Clásicos','3200000'],['Gin tonic','CT-003','Clásicos','3400000'],['Limonada de coco','BB-001','Sin alcohol','1400000'],['Agua mineral','BB-002','Sin alcohol','700000'],['Negroni','CT-004','Clásicos','3600000']],
    cafeteria: [['Café americano','CF-001','Café','650000'],['Cappuccino','CF-002','Café','950000'],['Latte','CF-003','Café','1050000'],['Croissant','PN-001','Panadería','850000']]
  };
  const products: Product[] = (menu[location.slug] || []).map(([name,sku,category,price_minor],i) => ({ id: `44444444-4444-4444-8444-${String((slugs.indexOf(location.slug)+1)*100+i).padStart(12,'0')}`, business_id: DEMO_BUSINESS, name,sku,category,price_minor,kind:'SIMPLE',unit_id:'u',active:true,version:1,updated_at:'2026-10-08T12:00:00.000Z' }));
  return { location, products, units, ingredients: [], cursor: 0 };
}
