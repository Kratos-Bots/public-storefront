import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { REFERRALS_CONTAINER } from '@/builder/blocks/_shared/referrals-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const ReferralsPage = lazy(() => import('@/features/account/ReferralsPage.tsx').then((m) => ({ default: m.ReferralsPage })));

/** The referral tab: a container of referral parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'Referrals', label: 'Referrals', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.referrals.loadFailedTitle', 'account.referrals.loadFailedBody', 'account.referrals.referredToast', 'account.referrals.shareText', 'account.nav.referrals', 'common.actions.tryAgain'],
  container: REFERRALS_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <ReferralsPage slots={{ content }} />,
});
