import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ACCOUNT_CONTAINER } from '@/builder/blocks/_shared/account-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const AccountLayout = lazy(() => import('@/features/account/AccountLayout.tsx').then((m) => ({ default: m.AccountLayout })));

/** The account letterhead and section rail (`head`); `body` is the section's own block. */
export const block = defineBlock<{ id: string; head: ComponentData[]; body: ComponentData[] }>({
  name: 'AccountNav', label: 'Account header', category: 'commerce', layouts: 'all', routeBound: false, slots: ['head', 'body'],
  style: styleSupport('wrap', [...BOX]),
  text: [],
  container: ACCOUNT_CONTAINER,
  schema: z.object({ head: slot(), body: slot() }), defaultProps: { head: [], body: [] },
  render: ({ head, body }) => <AccountLayout slots={{ head }}>{body()}</AccountLayout>,
});
