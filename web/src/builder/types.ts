/** Shared page-set types (spec §13 A4). The backend mirrors these in zod; Plan 3/4 import them. */
export type LayoutKind = 'storefront' | 'menu' | 'webapp';

export const FIXED_ROUTE_KEYS = ['catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order',
  'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success', 'payment-cancel',
  'order-placed', 'verify', 'tracking'] as const;
export type FixedRouteKey = typeof FIXED_ROUTE_KEYS[number];
export type RouteKey = FixedRouteKey | `page:${string}`; // slug /^[a-z0-9-]{1,60}$/
export type DocKey = RouteKey | 'shell';

export interface ComponentData { type: string; props: { id: string; [k: string]: unknown } }
export interface PageRootProps { title: string; description: string; chrome: 'shell' | 'none' }
export interface PuckDoc { root: { props: PageRootProps }; content: ComponentData[]; zones?: Record<string, ComponentData[]> }
export interface PageSet { schemaVersion: 1; shell: PuckDoc; pages: Partial<Record<RouteKey, PuckDoc>> }
export interface Issue { docKey: DocKey; rule: string; message: string; blockId?: string }

export const CUSTOM_SLUG_RE = /^[a-z0-9-]{1,60}$/;
export const BLOCK_TYPE_RE = /^[A-Z][A-Za-z0-9]{0,40}$/;
export const MAX_DEPTH = 12;
export const MAX_COMPONENTS = 2000;
export const EMPTY_ROOT: PageRootProps = { title: '', description: '', chrome: 'shell' };

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `{ type, props: { id } }` with a string type and a string id of at most 64 chars. */
export function isComponentLike(v: unknown): v is ComponentData {
  return isRecord(v) && typeof v.type === 'string' && isRecord(v.props)
    && typeof v.props.id === 'string' && v.props.id.length > 0 && v.props.id.length <= 64;
}

export function isFixedRouteKey(k: string): k is FixedRouteKey {
  return (FIXED_ROUTE_KEYS as readonly string[]).includes(k);
}

export function customPageKey(slug: string | undefined): RouteKey | null {
  return slug !== undefined && CUSTOM_SLUG_RE.test(slug) ? `page:${slug}` : null;
}
