import { lazy, useContext } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { CartBlockedContext } from '@/builder/blocks/_shared/cart-context.ts';

const CartSummary = lazy(() => import('@/features/cart/CartSummary.tsx').then((m) => ({ default: m.CartSummary })));

function CartSummaryView() {
  const fromContents = useContext(CartBlockedContext);
  const { issues } = useServerCart();
  const blocked = fromContents ?? issues.some((i) => i.inactive || i.belowMin || i.aboveMax);
  return <CartSummary blocked={blocked} />;
}

/** Subtotal and the way on to checkout. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummary', label: 'Cart summary', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CartSummaryView />,
});
