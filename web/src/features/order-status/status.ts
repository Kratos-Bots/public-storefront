import type { StringKey } from '@/text/registry.ts';
import { textKey, textSnapshot, type TextApi } from '@/text/snapshot.ts';
import type { ShipmentStatus } from '@/types/public-order.ts';

// Ported from `ecommerce-menu/web/src/features/order-status/status.ts` (plus
// `orderStatusLabel` from that app's tracking/status.ts). The only change is the
// palette: the menu carried Tailwind class strings, this app carries tone names
// and each surface maps them to its own `--sf-*` tokens.

/** Accent role, resolved to a theme token by whatever renders it. */
export type Tone = 'default' | 'success' | 'danger' | 'muted';

export const SHIPMENT_LABEL_KEYS: Record<ShipmentStatus, Extract<StringKey, `order.shipment.status.${string}` | 'common.shipment.inTransit'>> = {
  shipped: textKey('order.shipment.status.shipped'),
  in_transit: textKey('common.shipment.inTransit'),
  delivered: textKey('order.shipment.status.delivered'),
  returned: textKey('order.shipment.status.returned'),
};

/** The label key of a parcel status, or null for a status this release doesn't know (the wire value is a plain string). */
export function shipmentLabelKey(status: string): (typeof SHIPMENT_LABEL_KEYS)[ShipmentStatus] | null {
  return Object.hasOwn(SHIPMENT_LABEL_KEYS, status) ? SHIPMENT_LABEL_KEYS[status as ShipmentStatus] : null;
}

/**
 * Parcel status names, resolved on every read (each property is a getter over
 * SHIPMENT_LABEL_KEYS), so callers outside React still see published text.
 */
export const SHIPMENT_LABEL = Object.defineProperties(
  {} as Record<ShipmentStatus, string>,
  Object.fromEntries(
    Object.entries(SHIPMENT_LABEL_KEYS).map(([status, key]) => [
      status,
      { enumerable: true, get: () => textSnapshot().t(key) },
    ]),
  ),
);

/** Pill tone per shipment status. */
export const SHIPMENT_TONE: Record<ShipmentStatus, Tone> = {
  shipped: 'default',
  in_transit: 'default',
  delivered: 'success',
  returned: 'danger',
};

export const ORDER_STATUS_LABEL: Record<string, Extract<StringKey, `order.status.${string}`>> = {
  pending: textKey('order.status.pending'),
  confirmed: textKey('order.status.confirmed'),
  processing: textKey('order.status.processing'),
  partially_shipped: textKey('order.status.partiallyShipped'),
  shipped: textKey('order.status.shipped'),
  delivered: textKey('order.status.delivered'),
  cancelled: textKey('order.status.cancelled'),
  refunded: textKey('order.status.refunded'),
};

/**
 * Default case is mandatory: new statuses ship without a client release. Components pass `useText().t`;
 * non-React callers may omit it (the mounted text at call time).
 */
export function orderStatusLabel(status: string, t: TextApi['t'] = textSnapshot().t): string {
  const key = Object.hasOwn(ORDER_STATUS_LABEL, status) ? ORDER_STATUS_LABEL[status]! : textKey('order.status.pending');
  return t(key);
}

/** The tone of an order status, for the pill on an order list row and an order detail. */
export const ORDER_STATUS_TONE: Record<string, Tone> = {
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'muted',
};

export function orderStatusTone(status: string): Tone {
  return ORDER_STATUS_TONE[status] ?? 'default';
}
