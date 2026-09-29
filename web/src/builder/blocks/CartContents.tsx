import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CartBlockedContext } from '@/builder/blocks/_shared/cart-context.ts';

const CartPage = lazy(() => import('@/features/cart/CartPage.tsx').then((m) => ({ default: m.CartPage })));

/** The cart's lines (and empty state); its `summary` slot is the totals column. */
export const block = defineBlock<{ id: string; summary: ComponentData[] }>({
  name: 'CartContents', label: 'Cart lines', category: 'commerce', layouts: 'all', routeBound: true, slots: ['summary'],
  schema: z.object({ summary: slot() }), defaultProps: { summary: [] },
  render: ({ summary }) => (
    <CartPage
      foot={({ blocked, className }) => (
        <CartBlockedContext.Provider value={blocked}>{summary({ className })}</CartBlockedContext.Provider>
      )}
    />
  ),
});
