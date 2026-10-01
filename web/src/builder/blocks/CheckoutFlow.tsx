import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CHECKOUT_CONTAINER } from '@/builder/blocks/_shared/checkout-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage.tsx').then((m) => ({ default: m.CheckoutPage })));

/** The checkout: a container of checkout parts. The steps stay in a legal order; everything else moves and styles. */
export const block = defineBlock<{ id: string; head: ComponentData[]; lead: ComponentData[]; steps: ComponentData[]; after: ComponentData[]; aside: ComponentData[] }>({
  name: 'CheckoutFlow', label: 'Checkout', category: 'commerce', layouts: 'all', routeBound: true, slots: ['head', 'lead', 'steps', 'after', 'aside'],
  style: styleSupport('wrap', [...BOX]),
  text: [
    'checkout.page.eyebrow', 'checkout.page.emptyTitle', 'checkout.page.emptyBody', 'checkout.page.guestUnavailableTitle', 'checkout.page.guestUnavailableBody',
    'checkout.page.verifying', 'checkout.page.terms', 'checkout.steps.count', 'checkout.steps.contactTitle', 'checkout.steps.addressTitle',
    'checkout.steps.shippingTitle', 'checkout.steps.paymentTitle', 'checkout.steps.reviewTitle', 'checkout.actions.*', 'checkout.errors.*',
    'common.actions.*', 'common.totals.*',
  ],
  container: CHECKOUT_CONTAINER,
  schema: z.object({ head: slot(), lead: slot(), steps: slot(), after: slot(), aside: slot() }),
  defaultProps: { head: [], lead: [], steps: [], after: [], aside: [] },
  render: ({ head, lead, steps, after, aside }) => <CheckoutPage slots={{ head, lead, steps, after, aside }} />,
});
