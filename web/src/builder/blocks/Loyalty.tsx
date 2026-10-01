import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { LOYALTY_CONTAINER } from '@/builder/blocks/_shared/loyalty-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const LoyaltyPage = lazy(() => import('@/features/account/LoyaltyPage.tsx').then((m) => ({ default: m.LoyaltyPage })));

/** The loyalty tab: a container of loyalty parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'Loyalty', label: 'Loyalty points', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.loyalty.loadFailedTitle', 'account.loyalty.loadFailedBody', 'account.loyalty.redeemedToast', 'account.loyalty.redeemFailed', 'account.loyalty.confirmTitle', 'account.loyalty.confirmBody', 'account.loyalty.redeeming', 'account.nav.loyalty', 'common.actions.tryAgain', 'common.actions.cancel'],
  container: LOYALTY_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <LoyaltyPage slots={{ content }} />,
});
