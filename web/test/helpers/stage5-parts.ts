import type { PartFamily } from '@/builder/parts.ts';
import { BOX, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';

const T = (target: StyleTarget, ...groups: ReadonlyArray<readonly StyleKey[]>) => ({ target, keys: groups.flat() });

/** Stage-5 spec §9, exactly. Keys may be added later, never removed. */
export const STAGE5_PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }> = {
  CheckoutHeading: { family: 'checkout', style: T('root', BOX, TEXT) },
  CheckoutProgress: { family: 'checkout', style: T('root', BOX, VIS) },
  CheckoutContact: { family: 'checkout', style: T('root', BOX) },
  CheckoutAddress: { family: 'checkout', style: T('root', BOX) },
  CheckoutShipping: { family: 'checkout', style: T('root', BOX) },
  CheckoutPayment: { family: 'checkout', style: T('root', BOX) },
  CheckoutReview: { family: 'checkout', style: T('root', BOX) },
  CheckoutCoupon: { family: 'checkout', style: T('root', BOX) },
  CheckoutNotes: { family: 'checkout', style: T('root', BOX) },
  CheckoutSummary: { family: 'checkout', style: T('root', BOX) },
  OrderStatusHero: { family: 'order-status', style: T('root', BOX, TEXT) },
  OrderStatusPayment: { family: 'order-status', style: T('wrap', BOX) },
  OrderStatusShipments: { family: 'order-status', style: T('wrap', BOX) },
  OrderStatusItems: { family: 'order-status', style: T('root', BOX, TEXT) },
  OrderStatusAddress: { family: 'order-status', style: T('root', BOX, TEXT, VIS) },
  OrderStatusFooter: { family: 'order-status', style: T('root', BOX, TEXT) },
};

export const STAGE5_CONTAINERS: Record<string, PartFamily> = { CheckoutFlow: 'checkout', OrderStatus: 'order-status' };
