import { defaultText, type StringKey } from '@/text/registry.ts';
import { textKey, textSnapshot } from '@/text/snapshot.ts';
import type { PublicOrder, PublicOrderStatus, ShipmentStatus } from '@/types/public-order.ts';

// Ported from `ecommerce-menu/web/src/features/order-status/status.ts` (plus
// `orderStatusLabel` from that app's tracking/status.ts). The only change is the
// palette: the menu carried Tailwind class strings, this app carries tone names
// and each surface maps them to its own `--sf-*` tokens.

/** Accent role, resolved to a theme token by whatever renders it. */
export type Tone = 'default' | 'success' | 'danger' | 'muted';

// The customer-facing milestones the timeline renders. Distinct from the many
// internal order statuses — several statuses collapse onto the same milestone.
export const ROUTE_STEP_KEYS = [
  textKey('order.steps.received'),
  textKey('order.steps.confirmed'),
  textKey('order.steps.shipped'),
  textKey('order.steps.delivered'),
] as const;
/** The milestones' built-in English (read by tests); the timeline renders ROUTE_STEP_KEYS. */
export const ROUTE_STEPS = ROUTE_STEP_KEYS.map(defaultText);

export interface StatusView {
  /** Small mono eyebrow above the headline. */
  eyebrow: string;
  /** Large display headline. */
  headline: string;
  /** One plain sentence under the headline. */
  detail: string;
  /** Index into ROUTE_STEPS for the current milestone, or null for terminal states. */
  activeStep: number | null;
  /** Delivered — every milestone renders complete. */
  done: boolean;
  /** Shipped, but only some items — shows a "Partial" marker on the current step. */
  partial: boolean;
  /** Cancelled/refunded orders replace the timeline with a notice. */
  terminal: 'cancelled' | 'refunded' | null;
  /** Accent role for the eyebrow, mapped to a theme token by the hero. */
  tone: Tone;
}

type Shape = Omit<StatusView, 'eyebrow' | 'headline' | 'detail'>;
const PROGRESS: Shape = { activeStep: 0, done: false, partial: false, terminal: null, tone: 'default' };

/** Wording resolves at call time, so a mounted provider's published text applies. */
type HeroKey = Extract<StringKey, `order.hero.${string}`>;

function view(eyebrow: HeroKey, headline: HeroKey, detail: HeroKey, shape: Shape): StatusView {
  const { t } = textSnapshot();
  return { eyebrow: t(eyebrow), headline: t(headline), detail: t(detail), ...shape };
}

export function statusView(order: PublicOrder): StatusView {
  const status: PublicOrderStatus = order.status;
  const eyebrow = textKey('order.hero.eyebrow');

  switch (status) {
    case 'pending':
      return view(eyebrow, 'order.hero.pendingHeadline', 'order.hero.pendingDetail', PROGRESS);
    case 'confirmed':
      return view(eyebrow, 'order.hero.confirmedHeadline', 'order.hero.confirmedDetail', { ...PROGRESS, activeStep: 1 });
    case 'processing':
      // No dedicated "Preparing" step — packing shows as progress toward Shipped.
      return view(eyebrow, 'order.hero.processingHeadline', 'order.hero.processingDetail', { ...PROGRESS, activeStep: 2 });
    case 'partially_shipped':
      return view(eyebrow, 'order.hero.partiallyShippedHeadline', 'order.hero.partiallyShippedDetail', {
        ...PROGRESS,
        activeStep: 2,
        partial: true,
      });
    case 'shipped':
      return view(eyebrow, 'order.hero.shippedHeadline', 'order.hero.shippedDetail', { ...PROGRESS, activeStep: 2 });
    case 'delivered':
      return view('order.hero.deliveredEyebrow', 'order.hero.deliveredHeadline', 'order.hero.deliveredDetail', {
        ...PROGRESS,
        activeStep: 3,
        done: true,
        tone: 'success',
      });
    case 'cancelled':
      return view(eyebrow, 'order.hero.cancelledHeadline', 'order.hero.cancelledDetail', {
        ...PROGRESS,
        activeStep: null,
        terminal: 'cancelled',
        tone: 'danger',
      });
    case 'refunded':
      return view(eyebrow, 'order.hero.refundedHeadline', 'order.hero.refundedDetail', {
        ...PROGRESS,
        activeStep: null,
        terminal: 'refunded',
        tone: 'muted',
      });
    default:
      return view(eyebrow, 'order.hero.pendingHeadline', 'order.hero.pendingDetail', PROGRESS);
  }
}

export const SHIPMENT_LABEL_KEYS: Record<ShipmentStatus, Extract<StringKey, `order.shipment.status.${string}`>> = {
  shipped: textKey('order.shipment.status.shipped'),
  in_transit: textKey('order.shipment.status.inTransit'),
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

/** Default case is mandatory: new statuses ship without a client release. Resolved at call time. */
export function orderStatusLabel(status: string): string {
  const key = Object.hasOwn(ORDER_STATUS_LABEL, status) ? ORDER_STATUS_LABEL[status]! : textKey('order.status.pending');
  return textSnapshot().t(key);
}

/**
 * The same tones `statusView` assigns, reachable from a bare status string —
 * an order list row and an order-history detail carry a status without the rest
 * of the public order payload `statusView` reads.
 */
export const ORDER_STATUS_TONE: Record<string, Tone> = {
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'muted',
};

export function orderStatusTone(status: string): Tone {
  return ORDER_STATUS_TONE[status] ?? 'default';
}
