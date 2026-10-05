import { createFamily } from '@/builder/parts.ts';
import type { OrderDetail } from '@/types/orders.ts';
import type { PublicOrder } from '@/types/public-order.ts';

/**
 * One loaded order; the container owns pending / error / not-found (spec §5.4). `payment` is set only
 * while the editor previews a state: it stands in for the payment query, which a preview never fires.
 */
export interface OrderData { order: OrderDetail; payment?: PublicOrder }
/** What the editor's "Preview state" hands the OrderDetail container: the order and its payment view. */
export interface OrderPreview { detail: OrderDetail; payment: PublicOrder }
export const OrderFamily = createFamily<OrderData>('order');
