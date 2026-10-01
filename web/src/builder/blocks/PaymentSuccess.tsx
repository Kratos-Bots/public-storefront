import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { PAYMENT_SUCCESS_CONTAINER } from '@/builder/blocks/_shared/payment-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const PaymentSuccessPage = lazy(() => import('@/features/payment-redirect/PaymentSuccessPage.tsx').then((m) => ({ default: m.PaymentSuccessPage })));

/** The hosted-checkout success page: a container of payment parts; a saved order still hands off to its page. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'PaymentSuccess', label: 'Payment received', category: 'post-order', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['payment.missing.*', 'order.link.eyebrow', 'common.contact.*', 'common.actions.backToShop'],
  container: PAYMENT_SUCCESS_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <PaymentSuccessPage slots={{ content }} />,
});
