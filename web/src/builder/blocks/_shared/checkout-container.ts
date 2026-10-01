import { part, partId, flattenTypes, type ContainerSpec, type SlotRef } from '@/builder/parts.ts';
import type { ComponentData } from '@/builder/types.ts';
import { STEP_KINDS, STEP_ORDER_MESSAGE, STEP_TYPE, stepKindsOf, stepOrderProblem } from '@/builder/family-checkout.ts';

const STEP_SLOT_HOMES = ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview']
  .flatMap((t) => [`${t}.before`, `${t}.after`]) as SlotRef[];

/** The slots of one step part in the default arrangement: Shipping carries the coupon, Review the notes (spec 5.1). */
export function stepSlots(type: string, stepId: string): Record<string, ComponentData[]> {
  return {
    before: [],
    after: type === 'CheckoutShipping' ? [part('CheckoutCoupon', stepId)] : type === 'CheckoutReview' ? [part('CheckoutNotes', stepId)] : [],
  };
}

const step = (type: string, id: string): ComponentData => {
  const sid = partId(id, type);
  return { type, props: { id: sid, ...stepSlots(type, sid) } };
};

/** The checkout: heading, progress bar, five steps in a legal order, the order summary (stage 5 spec 5.1). */
export const CHECKOUT_CONTAINER: ContainerSpec = {
  family: 'checkout', insertSlot: 'steps', contentOnly: true,
  required: ['CheckoutHeading', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutSummary'],
  unique: ['CheckoutHeading', 'CheckoutProgress', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutCoupon', 'CheckoutNotes', 'CheckoutSummary'],
  noHide: ['CheckoutCoupon', 'CheckoutNotes'],
  // Default order; the editor's allow list for this slot follows it (derive-fields keeps a slotAccepts list's own order).
  slotAccepts: { steps: ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'] },
  homes: {
    CheckoutHeading: ['CheckoutFlow.head'], CheckoutProgress: ['CheckoutFlow.lead'], CheckoutSummary: ['CheckoutFlow.aside'],
    CheckoutContact: ['CheckoutFlow.steps'], CheckoutAddress: ['CheckoutFlow.steps'], CheckoutShipping: ['CheckoutFlow.steps'],
    CheckoutPayment: ['CheckoutFlow.steps'], CheckoutReview: ['CheckoutFlow.steps'],
    CheckoutCoupon: ['CheckoutShipping.before', 'CheckoutShipping.after', 'CheckoutPayment.before', 'CheckoutPayment.after', 'CheckoutReview.before', 'CheckoutReview.after', 'CheckoutFlow.aside'],
    CheckoutNotes: [...STEP_SLOT_HOMES],
  },
  homeWhy: { CheckoutCoupon: 'no prices exist there yet', CheckoutNotes: 'it belongs inside one of the five steps' },
  order: (slots) => {
    const p = stepOrderProblem(stepKindsOf(flattenTypes(slots.steps ?? [])));
    return p ? { message: STEP_ORDER_MESSAGE[p] } : null;
  },
  defaultSlots: (_p, { id }) => ({
    head: [part('CheckoutHeading', id)],
    lead: [part('CheckoutProgress', id)],
    steps: STEP_KINDS.map((k) => step(STEP_TYPE[k], id)),
    after: [],
    aside: [part('CheckoutSummary', id)],
  }),
};
