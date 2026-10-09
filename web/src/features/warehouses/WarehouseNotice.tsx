import { useLocation } from 'react-router';
import { OrderingPausedNotice, useCartNoticeShowing } from '@/features/warehouses/OrderingPausedNotice.tsx';
import { warehousePickerHidden } from '@/features/warehouses/WarehouseStrip.tsx';

/**
 * The paused-ordering notice as the shared header bar mounts it: under the "Shipping from" strip, on every
 * page the strip shows on. It stands down only while a cart-side notice is actually on screen (the cart
 * says it in place of its checkout button, and two copies would be noise); otherwise it is always there.
 */
export function WarehouseNotice() {
  const { pathname } = useLocation();
  const cartSaysIt = useCartNoticeShowing();
  if (warehousePickerHidden(pathname) || cartSaysIt) return null;
  return <OrderingPausedNotice />;
}
