import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { stepSlots } from '@/builder/blocks/_shared/checkout-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The Your details step: its content slots sit before and after the step's own fields. */
export const block = defineBlock<{ id: string; before: ComponentData[]; after: ComponentData[] }>({
  name: 'CheckoutContact', label: 'Your details', category: 'part',
  part: { family: 'checkout', defaultSlots: (_p, { id }) => stepSlots('CheckoutContact', id) },
  layouts: 'all', routeBound: false, slots: ['before', 'after'],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.contact.*', 'checkout.field.*', 'checkout.phone.*', 'common.actions.signIn'],
  schema: z.object({ before: slot(), after: slot() }), defaultProps: { before: [], after: [] },
  render: (p) => <CheckoutFamily.PartHost name="CheckoutContact" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
