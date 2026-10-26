import { z } from 'zod';
import { DomainError, uuid, type Location } from './domain.js';

export const sections = [
  { code:'home.read', name:'Inicio' },
  { code:'products.read', name:'Consultar catálogo' },
  { code:'products.write', name:'Crear y editar productos' },
  { code:'inventory.read', name:'Consultar inventario' },
  { code:'locations.read', name:'Ver sucursales asignadas' },
  { code:'activity.read', name:'Actividad del dispositivo' },
  {code:'service.read',name:'Atender mesas'},
  {code:'service.write',name:'Registrar consumos y solicitudes'},
  {code:'accounts.read',name:'Consultar cuentas'},
  {code:'sales.read',name:'Consultar ventas y propinas'},
  {code:'sales.write',name:'Cobrar cuentas'},
  {code:'inventory.write',name:'Modificar existencias y compras'},
  {code:'movements.read',name:'Consultar movimientos'},
  {code:'tables.manage',name:'Administrar mesas'},
  {code:'brand.manage',name:'Configurar marca'},
  {code:'assistant.read',name:'Asistente'},
  {code:'supplies.read',name:'Consultar compras y proveedores'},
  {code:'supplies.write',name:'Registrar compras y proveedores'},
  {code:'kitchen.read',name:'Consultar comandas'},
  {code:'kitchen.write',name:'Preparar comandas'},
  {code:'customers.read',name:'Consultar clientes y cartera'},
  {code:'customers.write',name:'Registrar clientes'},
  {code:'cash.read',name:'Consultar turno en Ventas'},
  {code:'cash.write',name:'Registrar turno, base y cierre en Ventas'}
] as const;
export const permissionCodes: string[] = [...sections.map(s=>s.code),'administration.manage','sales.manage'];
export const roleTemplates = [
  {code:'OWNER',name:'Jefe principal',permissions:[...permissionCodes]},
  {code:'BOSS',name:'Jefe',permissions:[...permissionCodes]},
  {code:'WORKER',name:'Trabajador',permissions:['home.read','products.read','locations.read']},
  {code:'ADMIN',name:'Administrador',permissions:permissionCodes.filter(p=>!['administration.manage','sales.manage','activity.read'].includes(p))},
  {code:'MANAGER',name:'Encargado',permissions:permissionCodes.filter(p=>!['brand.manage','administration.manage','sales.manage'].includes(p))},
  {code:'CASHIER',name:'Cajero',permissions:['home.read','products.read','locations.read','activity.read','service.read','service.write','accounts.read','sales.read','sales.write','assistant.read','kitchen.read','customers.read','customers.write','cash.read','cash.write']},
  {code:'WAITER',name:'Mesero',permissions:['home.read','products.read','locations.read','service.read','service.write']},
  {code:'KITCHEN',name:'Cocina',permissions:['home.read','products.read','locations.read','kitchen.read','kitchen.write']},
  {code:'INVENTORY_MANAGER',name:'Inventario',permissions:['home.read','products.read','products.write','inventory.read','inventory.write','movements.read','locations.read','activity.read','supplies.read','supplies.write']},
  {code:'ACCOUNTING',name:'Contabilidad',permissions:['home.read','products.read','locations.read','activity.read','accounts.read','sales.read','supplies.read','customers.read','cash.read']}
];
export const defaultLocations = [
  {slug:'gcobarf',name:'GCOBARF Nutripet’s',color:'#407dd6',active:true},
  {slug:'cocteleria',name:'Jespresso Olivia · Coctelería',color:'#a47a47',active:true},
  {slug:'cafeteria',name:'Jespresso Olivia · Cafetería',color:'#9b613e',active:true},
  {slug:'reservado',name:'Cuarto espacio',color:'#767680',active:false}
];
export const locationInput = z.object({slug:z.string().regex(/^[a-z0-9-]{3,80}$/),name:z.string().trim().min(1).max(160),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),active:z.boolean()}).strict();
export type LocationInput = z.infer<typeof locationInput>;
export const editableRole = z.enum(['BOSS','WORKER','ADMIN','MANAGER','CASHIER','WAITER','KITCHEN','INVENTORY_MANAGER','ACCOUNTING']);
export const accessInput = z.object({location_id:uuid,roles:z.array(editableRole).min(1).max(7),overrides:z.record(z.enum(['ALLOW','DENY'])).refine(v=>Object.keys(v).every(k=>permissionCodes.includes(k as any)), 'Permiso desconocido.')}).strict();
export const userInput = z.object({name:z.string().trim().min(1).max(160),username:z.string().trim().min(1).max(320),active:z.boolean(),password:z.string().min(4).max(12).optional(),access:z.array(accessInput).max(100)}).strict().superRefine((v,c)=>{
  if(new Set(v.access.map(a=>a.location_id)).size!==v.access.length)c.addIssue({code:'custom',path:['access'],message:'Cada sucursal debe aparecer una sola vez.'});
  for(const a of v.access){const p=effectivePermissions(a.roles,a.overrides);if(p.includes('products.write')&&!p.includes('products.read'))c.addIssue({code:'custom',path:['access'],message:'Editar productos requiere consultar el catálogo.'});}
});
export type Access = {location_id:string;roles:string[];overrides:Record<string,'ALLOW'|'DENY'>};
export type ManagedUser = {id:string;name:string;username:string;active:boolean;protected:boolean;access:Access[];createdBy?:string;createdByName?:string;createdAt?:string;updatedBy?:string;updatedByName?:string;updatedAt?:string};
export type UserWrite = Omit<z.infer<typeof userInput>,'password'> & {password_hash?:string};
export type Administration = {locations:Location[];users:ManagedUser[];roles:typeof roleTemplates;sections:typeof sections};
export function effectivePermissions(roles:string[],overrides:Record<string,'ALLOW'|'DENY'>,templates=roleTemplates):string[]{
  if(roles.some(r=>r==='OWNER'||r==='BOSS'))return [...permissionCodes];
  if(roles.length===1&&roles[0]==='WAITER')return ['home.read','products.read','locations.read','service.read','service.write'];
  const permissions=new Set(templates.filter(t=>roles.includes(t.code)).flatMap(t=>t.permissions).filter(p=>!['administration.manage','sales.manage'].includes(p)));
  for(const [code,effect] of Object.entries(overrides))if(permissionCodes.includes(code)&&code!=='sales.manage'){if(effect==='ALLOW')permissions.add(code);else permissions.delete(code);}
  return [...permissions];
}
export const sectionGroups=[
 {name:'Inicio',codes:['home.read','products.read','locations.read']},
 {name:'Atender mesas o personas',codes:['service.read','service.write','products.read','locations.read']},
 {name:'Cuentas',codes:['accounts.read','products.read']},
 {name:'Ventas, propinas y turnos',codes:['sales.read','sales.write','cash.read','cash.write','products.read']},
 {name:'Inventario y costeo',codes:['inventory.read','inventory.write','products.read','products.write']},
 {name:'Movimientos',codes:['movements.read','products.read']},
 {name:'Mesas y QR',codes:['tables.manage','products.read']},
 {name:'Marca',codes:['brand.manage']},
 {name:'Compras y proveedores',codes:['supplies.read','supplies.write']},
 {name:'Clientes y cartera',codes:['customers.read','customers.write']},
 {name:'Comandas',codes:['kitchen.read','kitchen.write']},
 {name:'Usuarios',codes:['administration.manage']}
];
export function sectionOverrides(selected:string[]):Record<string,'ALLOW'|'DENY'>{const codes=new Set(sectionGroups.filter(g=>selected.includes(g.name)).flatMap(g=>g.codes));codes.add('locations.read');codes.add('products.read');return Object.fromEntries(permissionCodes.filter(p=>p!=='sales.manage').map(p=>[p,codes.has(p)?'ALLOW':'DENY']));}
export function assertUserGrant(context:import('./domain.js').Context,previous:ManagedUser|undefined,input:UserWrite,locationId?:string){
 if(locationId){
  if(!context.permissions[locationId]?.includes('administration.manage')||input.access.some(a=>a.location_id!==locationId))throw new DomainError('FORBIDDEN','Solo puedes gestionar usuarios del negocio abierto.',403);
  if(previous&&!previous.access.some(a=>a.location_id===locationId))throw new DomainError('FORBIDDEN','Este usuario no pertenece al negocio abierto.',403);
  if(!previous&&input.access.length!==1)throw new DomainError('FORBIDDEN','El nuevo usuario debe tener acceso al negocio abierto.',403);
  if(previous)previous={...previous,access:previous.access.filter(a=>a.location_id===locationId)};
 }
 if(context.is_owner)return;
 const managed=Object.entries(context.permissions).filter(([,p])=>p.includes('administration.manage')).map(([id])=>id);
 if(!managed.length)throw new DomainError('FORBIDDEN','No tienes permiso para gestionar usuarios.',403);
 if(previous?.protected||previous?.access.some(a=>!managed.includes(a.location_id)))throw new DomainError('FORBIDDEN','Este usuario tiene accesos que solo otro jefe puede gestionar.',403);
 for(const a of [...(previous?.access||[]),...input.access]){
  const own=context.permissions[a.location_id]||[];
  if(!managed.includes(a.location_id)||a.roles.includes('OWNER')||a.roles.includes('BOSS')&&!own.includes('sales.manage'))throw new DomainError('FORBIDDEN','No puedes asignar ni modificar ese rol o negocio.',403);
  if(!own.includes('sales.manage')&&effectivePermissions(a.roles,a.overrides).some(p=>!own.includes(p)))throw new DomainError('FORBIDDEN','Solo puedes asignar los permisos que tienes en este negocio.',403);
 }
}
export function requireOwner(isOwner:boolean){if(!isOwner)throw new DomainError('FORBIDDEN','Solo el propietario puede administrar sucursales y accesos.',403);}
