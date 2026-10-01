import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { PAYMENT_CANCEL_CONTAINER } from '@/builder/blocks/_shared/payment-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const PaymentCancelPage = lazy(() => import('@/features/payment-redirect/PaymentCancelPage.tsx').then((m) => ({ default: m.PaymentCancelPage })));

/** The hosted-checkout cancel page: a container of payment parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'PaymentCancel', label: 'Payment cancelled', category: 'post-order', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: [],
  container: PAYMENT_CANCEL_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <PaymentCancelPage slots={{ content }} />,
});
