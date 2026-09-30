import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const LoyaltyPage = lazy(() => import('@/features/account/LoyaltyPage.tsx').then((m) => ({ default: m.LoyaltyPage })));

export const block = defineBlock<{ id: string }>({
  name: 'Loyalty', label: 'Loyalty points', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.loyalty.*', 'account.nav.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <LoyaltyPage />,
});
