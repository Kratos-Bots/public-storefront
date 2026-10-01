import { createFamily } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { PublicOrder } from '@/types/public-order.ts';

// Type-only imports: this module is in the shopper's entry bundle.

/** One loaded order and the link credentials that opened it (stage 5 spec §5.2). */
export interface OrderStatusData { order: PublicOrder; reference: string; accessKey: string }
export const OrderStatusFamily = createFamily<OrderStatusData>('order-status');

/** The OrderStatus container's four slots, as the page renders them. */
export interface OrderStatusSlots { top: SlotRender; action: SlotRender; summary: SlotRender; bottom: SlotRender }
