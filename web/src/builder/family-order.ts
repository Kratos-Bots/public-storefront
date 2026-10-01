import { createFamily } from '@/builder/parts.ts';
import type { OrderDetail } from '@/types/orders.ts';

/** One loaded order; the container owns pending / error / not-found (spec §5.4). */
export interface OrderData { order: OrderDetail }
export const OrderFamily = createFamily<OrderData>('order');
