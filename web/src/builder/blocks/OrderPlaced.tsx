import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ORDER_PLACED_CONTAINER } from '@/builder/blocks/_shared/payment-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const OrderPlacedPage = lazy(() => import('@/features/payment-redirect/OrderPlacedPage.tsx').then((m) => ({ default: m.OrderPlacedPage })));

/** The chat-settled order hand-off: a container of payment parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'OrderPlaced', label: 'Order placed', category: 'post-order', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['payment.missing.*', 'order.link.eyebrow', 'common.contact.*', 'common.actions.backToShop'],
  container: ORDER_PLACED_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <OrderPlacedPage slots={{ content }} />,
});
