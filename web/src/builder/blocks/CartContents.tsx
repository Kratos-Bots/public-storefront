import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CART_CONTAINER } from '@/builder/blocks/_shared/cart-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';

// The cart drawer imports the container statically (registering it in cartViews), so inside the drawer this never suspends.
const CartPageLazy = lazy(() => import('@/features/cart/CartPage.tsx').then((m) => ({ default: m.CartPage })));

/** The cart: a container of cart parts (heading, lines, empty state) with the totals column nested in `summary`. */
export const block = defineBlock<{ id: string; head: ComponentData[]; main: ComponentData[]; summary: ComponentData[] }>({
  name: 'CartContents', label: 'Cart lines', category: 'commerce', layouts: 'all', routeBound: true, slots: ['head', 'main', 'summary'],
  style: styleSupport('wrap', [...BOX]),
  // It draws nothing itself: its parts list the cart.* keys they render.
  text: [],
  container: CART_CONTAINER,
  schema: z.object({ head: slot(), main: slot(), summary: slot() }),
  defaultProps: { head: [], main: [], summary: [] },
  render: ({ head, main, summary }) => {
    const View = cartViews.page ?? CartPageLazy;
    return <View slots={{ head, main, summary }} />;
  },
});
