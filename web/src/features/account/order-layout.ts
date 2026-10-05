import { flattenTypes } from '@/builder/parts.ts';
import type { ComponentData } from '@/builder/types.ts';
import type { OrderDetail } from '@/types/orders.ts';

export type OrderArea = 'head' | 'main' | 'side';

const AREA: Record<string, OrderArea> = {
  OrderBackLink: 'head', OrderHeading: 'head', OrderBalance: 'main', OrderItems: 'main',
  OrderAddress: 'side', OrderParcels: 'side', OrderPayments: 'side',
};

/**
 * The area a part belongs to for this order. Parcels go beside the address, except when there is no payment card:
 * the main column would then be one short items card next to a much taller side, so they sit under the items.
 */
function areaOf(type: string, silent: ReadonlySet<string>): OrderArea | undefined {
  if (!Object.hasOwn(AREA, type)) return undefined;
  return type === 'OrderParcels' && silent.has('OrderBalance') ? 'main' : AREA[type];
}

/** Which order parts draw nothing for this order. */
export function silentParts(order: OrderDetail): Set<string> {
  const silent = new Set<string>();
  const closed = order.status === 'cancelled' || order.status === 'refunded';
  if (!(order.outstandingBalance > 0) || closed) silent.add('OrderBalance');
  if (!order.shippingAddress) silent.add('OrderAddress');
  if (order.shipments.length === 0) silent.add('OrderParcels');
  if (order.payments.length === 0) silent.add('OrderPayments');
  return silent;
}

/**
 * Sorts a slot's items into the page's areas, keeping their order within each. An order part goes to its own
 * area. Any other block (a Section, a text block) goes by the order parts inside it: `side` when every one of
 * them is a side part, else `main`; with no order parts inside, `main`.
 */
export function partitionOrderItems(items: readonly ComponentData[], silent: ReadonlySet<string> = new Set()): Record<OrderArea, ComponentData[]> {
  const out: Record<OrderArea, ComponentData[]> = { head: [], main: [], side: [] };
  for (const item of items) {
    const own = areaOf(item.type, silent);
    if (own) { out[own].push(item); continue; }
    const inner = flattenTypes([item]).slice(1).map((t) => areaOf(t, silent)).filter(Boolean);
    out[inner.length > 0 && inner.every((a) => a === 'side') ? 'side' : 'main'].push(item);
  }
  return out;
}

/** The side column exists only when something placed in it will draw. */
export function sideDraws(side: readonly ComponentData[], silent: ReadonlySet<string>): boolean {
  return side.some((item) => {
    if (silent.has(item.type)) return false;
    const inner = flattenTypes([item]).slice(1);
    return inner.length === 0 || inner.some((t) => !silent.has(t));
  });
}
