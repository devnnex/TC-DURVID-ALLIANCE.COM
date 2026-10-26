import { z } from 'zod';

export const uuid = z.string().uuid();
export const minorMoney = z.string().regex(/^(0|[1-9]\d{0,17})$/);
export const productInput = z.object({
  name: z.string().trim().min(1).max(160), sku: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(80), price_minor: minorMoney,
  kind: z.enum(['SIMPLE', 'PREPARED', 'WEIGHT', 'VOLUME']), unit_id: z.string().max(12),
  active: z.boolean()
}).strict();
export type ProductInput = z.infer<typeof productInput>;
export type Product = ProductInput & { id: string; business_id: string; version: number; updated_at: string };
export type Location = { id: string; business_id: string; name: string; slug: string; color: string; active: boolean };
export type Unit = { id: string; name: string; dimension: string; factor: string };
export type Ingredient = { id: string; name: string; unit_id: string; cost_minor: string };
export type Identity = { id: string; business_id: string; business_slug: string; name: string; username: string; last_login_at?: string };
export type Context = { user: Identity; locations: Location[]; permissions: Record<string, string[]>; is_owner?: boolean; roles?:Record<string,string[]> };
export type Bootstrap = { location: Location; products: Product[]; ingredients: Ingredient[]; units: Unit[]; cursor: number };

export const operationSchema = z.object({
  operation_id: uuid, idempotency_key: uuid, device_id: uuid, business_id: uuid, location_id: uuid,
  entity_type: z.literal('PRODUCT'), entity_id: uuid, operation_type: z.literal('PRODUCT_UPSERT'),
  payload: productInput, base_version: z.number().int().min(0), client_created_at: z.string().datetime()
}).strict();
export type Operation = z.infer<typeof operationSchema>;
export type QueueStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT' | 'REQUIRES_REVIEW';
export type Ack = { operation_id: string; status: 'SYNCED' | 'CONFLICT' | 'REQUIRES_REVIEW'; product?: Product; code?: string; message?: string };
export type Change = { cursor: number; product: Product };
export type Changes = { changes: Change[]; cursor: number; has_more: boolean };
export type Principal = { user_id: string; business_id: string; location_id: string; permissions: string[] };

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const requirePermission = (principal: Principal, permission: string) => {
  if (!principal.permissions.includes(permission)) throw new DomainError('FORBIDDEN', 'No tienes permiso para esta operación.', 403);
};
export const assertScope = (principal: Principal, op: Operation) => {
  if (op.business_id !== principal.business_id || op.location_id !== principal.location_id)
    throw new DomainError('FORBIDDEN', 'La operación pertenece a otro negocio o sucursal.', 403);
};

export const units: Unit[] = [
  { id: 'g', name: 'Gramos', dimension: 'MASS', factor: '1' },
  { id: 'kg', name: 'Kilogramos', dimension: 'MASS', factor: '1000' },
  { id: 'lb', name: 'Libras', dimension: 'MASS', factor: '453.59237' },
  { id: 'oz', name: 'Onzas', dimension: 'MASS', factor: '28.349523125' },
  { id: 'ml', name: 'Mililitros', dimension: 'VOLUME', factor: '1' },
  { id: 'l', name: 'Litros', dimension: 'VOLUME', factor: '1000' },
  { id: 'u', name: 'Unidades', dimension: 'COUNT', factor: '1' }
];
// COP presentation has no cents; arithmetic remains integer centavos.
export function money(minor: string): string {
  const value = BigInt(minor); const rounded = (value + 50n) / 100n;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(rounded);
}
export function pesosToMinor(pesos: string): string {
  if (!/^\d{1,16}$/.test(pesos)) throw new DomainError('INVALID_MONEY', 'Escribe un valor entero en pesos.');
  return (BigInt(pesos) * 100n).toString();
}
export function recommendedPrice(costMinor: string, basisPoints: number, model: 'MARKUP' | 'MARGIN'): string {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || (model === 'MARGIN' && basisPoints >= 10000)) throw new DomainError('INVALID_RATE', 'Porcentaje inválido.');
  const c = BigInt(costMinor); const n = model === 'MARKUP' ? c * BigInt(10000 + basisPoints) : c * 10000n;
  const d = model === 'MARKUP' ? 10000n : BigInt(10000 - basisPoints);
  return ((n + d / 2n) / d).toString();
}
