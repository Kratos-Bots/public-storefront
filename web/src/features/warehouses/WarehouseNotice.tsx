import { useLocation } from 'react-router';
import { selectCount, useCartStore } from '@/stores/cart.ts';
import { OrderingPausedNotice } from '@/features/warehouses/OrderingPausedNotice.tsx';
import { warehousePickerHidden } from '@/features/warehouses/WarehouseStrip.tsx';

/**
 * The paused-ordering notice as the shared header bar mounts it: under the "Shipping from" strip, on every
 * page the strip shows on. Not on `/cart` while the basket has lines, because the cart then carries the same
 * notice in place of its checkout button and a second copy a screen away would be noise; an empty cart has no
 * summary, so there the header's notice is the only explanation.
 */
export function WarehouseNotice() {
  const { pathname } = useLocation();
  const count = useCartStore(selectCount);
  if (warehousePickerHidden(pathname) || (count > 0 && /^\/cart\/?$/.test(pathname))) return null;
  return <OrderingPausedNotice />;
}
