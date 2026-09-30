import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage.tsx').then((m) => ({ default: m.CheckoutPage })));

/** Contact → address → shipping → payment → review. Self-contained; not rearrangeable (spec non-goal). */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutFlow', label: 'Checkout', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <CheckoutPage />,
});
