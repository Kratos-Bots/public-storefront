import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CART_SUMMARY_CONTAINER } from '@/builder/blocks/_shared/cart-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';

const CartSummaryLazy = lazy(() => import('@/features/cart/CartSummary.tsx').then((m) => ({ default: m.CartSummary })));

/** Subtotal and the way on to checkout: a container of summary parts. Nested in CartContents.summary, or standalone. */
export const block = defineBlock<{ id: string; items: ComponentData[] }>({
  name: 'CartSummary', label: 'Cart summary', category: 'commerce', layouts: 'all', routeBound: true, slots: ['items'],
  style: styleSupport('root', [...BOX]),
  text: [],
  container: CART_SUMMARY_CONTAINER,
  schema: z.object({ items: slot() }),
  defaultProps: { items: [] },
  render: ({ items, puck }) => {
    const View = cartViews.summary ?? CartSummaryLazy;
    return <View slots={{ items }} styleAttrs={puck.style} />;
  },
});
