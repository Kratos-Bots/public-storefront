import { BLOCKS } from '@/builder/registry.ts';
import { allowedOn } from '@/builder/rules.ts';
import type { CardKey, DocKey, FixedRouteKey, LayoutKind } from '@/builder/types.ts';

type Entry = { blocks: readonly string[]; exactlyOne: boolean };

/**
 * Spec §5.3's required-block table, from the editor's side: where each route-bound block
 * lives, and whether it is "exactly one" (locked against delete/duplicate on its own route).
 * The catalogue's "≥ 1 of" rule is not locked — the issues list reports its absence instead.
 * The route-bound test cross-checks this table against Plan 2's checkRules() and BLOCKS.
 */
export const ROUTE_BOUND: Record<'shell' | FixedRouteKey | CardKey, Entry> = {
  shell: { blocks: ['PageOutlet'], exactlyOne: true },
  catalog: { blocks: ['ProductGrid', 'ProductList', 'WholesaleTable'], exactlyOne: false },
  product: { blocks: ['ProductDetail'], exactlyOne: true },
  cart: { blocks: ['CartContents', 'CartSummary'], exactlyOne: true },
  checkout: { blocks: ['CheckoutFlow'], exactlyOne: true },
  login: { blocks: ['LoginOptions'], exactlyOne: true },
  'account.orders': { blocks: ['OrdersList'], exactlyOne: true },
  'account.order': { blocks: ['OrderDetail'], exactlyOne: true },
  'account.loyalty': { blocks: ['Loyalty'], exactlyOne: true },
  'account.referrals': { blocks: ['Referrals'], exactlyOne: true },
  'account.profile': { blocks: ['Profile'], exactlyOne: true },
  'order-status': { blocks: ['OrderStatus'], exactlyOne: true },
  'payment-success': { blocks: ['PaymentSuccess'], exactlyOne: true },
  'payment-cancel': { blocks: ['PaymentCancel'], exactlyOne: true },
  'order-placed': { blocks: ['OrderPlaced'], exactlyOne: true },
  verify: { blocks: ['VerifyForm'], exactlyOne: true },
  tracking: { blocks: ['TrackingLookup'], exactlyOne: true },
  // A card design's frame (product-parts §5.3): the root of its document, locked.
  'card:tile': { blocks: ['CardTile'], exactlyOne: true },
  'card:row': { blocks: ['CardRow'], exactlyOne: true },
};

export function homeDocKeys(name: string): DocKey[] {
  return (Object.entries(ROUTE_BOUND) as Array<[DocKey, Entry]>)
    .filter(([, e]) => e.blocks.includes(name))
    .map(([key]) => key);
}

export function isLockedOn(name: string, docKey: DocKey): boolean {
  const entry = Object.hasOwn(ROUTE_BOUND, docKey) ? ROUTE_BOUND[docKey as keyof typeof ROUTE_BOUND] : undefined;
  return !!entry && entry.exactlyOne && entry.blocks.includes(name);
}

/**
 * Blocks the "Add block" menu and drawer offer on this doc: in this layout, and allowed here by
 * Plan 2's placement predicate (route blocks on their home route, shell chrome in the shell,
 * AccountNav on account pages) — so inserting one never raises a placement or layout issue.
 */
export function insertableBlocks(docKey: DocKey, layout: LayoutKind): string[] {
  return Object.values(BLOCKS)
    .filter((d) => d.layouts === 'all' || d.layouts.includes(layout))
    .filter((d) => allowedOn(d.name, docKey))
    .map((d) => d.name);
}
