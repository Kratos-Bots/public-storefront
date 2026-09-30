import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';

const AccountLayout = lazy(() => import('@/features/account/AccountLayout.tsx').then((m) => ({ default: m.AccountLayout })));

/** The account letterhead and section rail; `body` is the section's own block. */
export const block = defineBlock<{ id: string; body: ComponentData[] }>({
  name: 'AccountNav', label: 'Account header', category: 'commerce', layouts: 'all', routeBound: false, slots: ['body'],
  text: ['account.nav.*', 'account.layout.*'],
  schema: z.object({ body: slot() }), defaultProps: { body: [] },
  render: ({ body }) => <AccountLayout>{body()}</AccountLayout>,
});
