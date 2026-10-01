import { createFamily } from '@/builder/parts.ts';
import type { OrderSummary } from '@/types/orders.ts';

/** The order history's list state, owned by `OrdersPage` (spec §5.4). */
export interface OrdersData {
  rows: OrderSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore(): void;
  /** The server's total (the heading's count). */
  count: number;
}
export const OrdersFamily = createFamily<OrdersData>('orders');

/** The editor's fixture for the order history's preview states (spec §11.3). */
export interface OrdersPreview { rows: OrderSummary[]; hasNextPage: boolean }
