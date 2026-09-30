import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const ReferralsPage = lazy(() => import('@/features/account/ReferralsPage.tsx').then((m) => ({ default: m.ReferralsPage })));

export const block = defineBlock<{ id: string }>({
  name: 'Referrals', label: 'Referrals', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  text: ['account.referrals.*', 'account.nav.*', 'common.contact.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <ReferralsPage />,
});
