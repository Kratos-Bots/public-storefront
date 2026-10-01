import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions',
  'PaymentContact', 'PaymentBack'] as const;

/** Three specs, one factory (spec §5.6): they differ only in the default order, what is required and what is offered. */
function paymentContainer(opts: { required: readonly string[]; defaults: readonly (typeof PARTS)[number][]; offers?: readonly string[] }): ContainerSpec {
  return {
    family: 'payment',
    defaultSlots: (_props, { id }) => ({ content: opts.defaults.map((type) => part(type, id)) }),
    required: opts.required,
    unique: PARTS,
    ...(opts.offers ? { offers: opts.offers } : {}),
    insertSlot: 'content',
  };
}

/** A hosted checkout's success return has no actions: the hand-off to the saved order is a redirect. */
export const PAYMENT_SUCCESS_CONTAINER = paymentContainer({
  required: ['PaymentHeadline', 'PaymentReference'],
  defaults: ['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentContact', 'PaymentBack'],
  offers: PARTS.filter((p) => p !== 'PaymentActions'),
});

export const PAYMENT_CANCEL_CONTAINER = paymentContainer({
  required: ['PaymentHeadline', 'PaymentActions'],
  defaults: ['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentContact'],
});

export const ORDER_PLACED_CONTAINER = paymentContainer({
  required: ['PaymentHeadline', 'PaymentReference', 'PaymentActions'],
  defaults: ['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentBack'],
});
