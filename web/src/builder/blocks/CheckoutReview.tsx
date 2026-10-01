import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { stepSlots } from '@/builder/blocks/_shared/checkout-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The Review step: its content slots sit before and after the step's own fields. */
export const block = defineBlock<{ id: string; before: ComponentData[]; after: ComponentData[] }>({
  name: 'CheckoutReview', label: 'Review', category: 'part',
  part: { family: 'checkout', defaultSlots: (_p, { id }) => stepSlots('CheckoutReview', id) },
  layouts: 'all', routeBound: false, slots: ['before', 'after'],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.review.blurb', 'checkout.review.change', 'checkout.review.notChosen', 'checkout.steps.contact', 'checkout.steps.addressTitle', 'checkout.steps.shipping', 'checkout.steps.payment', 'common.totals.storeCredit'],
  schema: z.object({ before: slot(), after: slot() }), defaultProps: { before: [], after: [] },
  render: (p) => <CheckoutFamily.PartHost name="CheckoutReview" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
