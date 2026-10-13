import { useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { orderUnitLimit, type OrderUnitLimit } from '@/features/cart/order-unit-limit.ts';

/**
 * The shop-wide unit limit measured against the cart on screen. The cart store's lines are the one
 * list every surface renders: a guest's own, and a signed-in shopper's server cart (which replaces them).
 */
export function useOrderUnitLimit(): OrderUnitLimit {
  const max = useSettings().limits?.maxOrderUnits;
  const units = useCartStore(selectCount);
  return useMemo(() => orderUnitLimit(max, units), [max, units]);
}
