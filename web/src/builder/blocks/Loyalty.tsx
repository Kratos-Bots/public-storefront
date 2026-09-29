import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const LoyaltyPage = lazy(() => import('@/features/account/LoyaltyPage.tsx').then((m) => ({ default: m.LoyaltyPage })));

export const block = defineBlock<{ id: string }>({
  name: 'Loyalty', label: 'Loyalty points', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <LoyaltyPage />,
});
