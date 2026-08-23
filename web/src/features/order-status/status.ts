import type { PublicOrder, PublicOrderStatus, ShipmentStatus } from '@/types/public-order.ts';

// Ported from `ecommerce-menu/web/src/features/order-status/status.ts` (plus
// `orderStatusLabel` from that app's tracking/status.ts). The only change is the
// palette: the menu carried Tailwind class strings, this app carries tone names
// and each surface maps them to its own `--sf-*` tokens.

/** Accent role, resolved to a theme token by whatever renders it. */
export type Tone = 'default' | 'success' | 'danger' | 'muted';

// The customer-facing milestones the timeline renders. Distinct from the many
// internal order statuses — several statuses collapse onto the same milestone.
export const ROUTE_STEPS = ['Received', 'Confirmed', 'Shipped', 'Delivered'] as const;

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

export function statusView(order: PublicOrder): StatusView {
  const status: PublicOrderStatus = order.status;

  switch (status) {
    case 'pending':
      return {
        eyebrow: 'Order status',
        headline: 'Order received',
        detail: "We've got your order and we're getting it ready.",
        activeStep: 0,
        done: false,
        partial: false,
        terminal: null,
        tone: 'default',
      };
    case 'confirmed':
      return {
        eyebrow: 'Order status',
        headline: 'Order confirmed',
        detail: 'Your order is confirmed and moving into preparation.',
        activeStep: 1,
        done: false,
        partial: false,
        terminal: null,
        tone: 'default',
      };
    case 'processing':
      return {
        eyebrow: 'Order status',
        headline: 'Being prepared',
        detail: "We're packing your order now.",
        // No dedicated "Preparing" step — packing shows as progress toward Shipped.
        activeStep: 2,
        done: false,
        partial: false,
        terminal: null,
        tone: 'default',
      };
    case 'partially_shipped':
      return {
        eyebrow: 'Order status',
        headline: 'Partially shipped',
        detail: 'Some items are on their way. The rest will follow shortly.',
        activeStep: 2,
        done: false,
        partial: true,
        terminal: null,
        tone: 'default',
      };
    case 'shipped':
      return {
        eyebrow: 'Order status',
        headline: 'On its way',
        detail: 'Your order has shipped. Track it below.',
        activeStep: 2,
        done: false,
        partial: false,
        terminal: null,
        tone: 'default',
      };
    case 'delivered':
      return {
        eyebrow: 'Delivered',
        headline: 'Delivered',
        detail: 'Your order has arrived. Thanks for shopping with us.',
        activeStep: 3,
        done: true,
        partial: false,
        terminal: null,
        tone: 'success',
      };
    case 'cancelled':
      return {
        eyebrow: 'Order status',
        headline: 'Order cancelled',
        detail: "This order has been cancelled and won't be dispatched.",
        activeStep: null,
        done: false,
        partial: false,
        terminal: 'cancelled',
        tone: 'danger',
      };
    case 'refunded':
      return {
        eyebrow: 'Order status',
        headline: 'Order refunded',
        detail: 'This order has been refunded.',
        activeStep: null,
        done: false,
        partial: false,
        terminal: 'refunded',
        tone: 'muted',
      };
    default:
      return {
        eyebrow: 'Order status',
        headline: 'Order received',
        detail: "We've got your order and we're getting it ready.",
        activeStep: 0,
        done: false,
        partial: false,
        terminal: null,
        tone: 'default',
      };
  }
}

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  returned: 'Returned',
};

/** Pill tone per shipment status. */
export const SHIPMENT_TONE: Record<ShipmentStatus, Tone> = {
  shipped: 'default',
  in_transit: 'default',
  delivered: 'success',
  returned: 'danger',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Order received',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  partially_shipped: 'Partially shipped',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/** Default case is mandatory: new statuses ship without a client release. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? 'Order received';
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
