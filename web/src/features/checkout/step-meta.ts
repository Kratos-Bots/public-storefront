import type { StepKind } from '@/builder/family-checkout.ts';
import { textKey } from '@/text/snapshot.ts';

/** The progress bar's label and the card's title for each step kind. */
export const STEP_META = {
  contact: { label: textKey('checkout.steps.contact'), title: textKey('checkout.steps.contactTitle') },
  address: { label: textKey('checkout.steps.address'), title: textKey('checkout.steps.addressTitle') },
  shipping: { label: textKey('checkout.steps.shipping'), title: textKey('checkout.steps.shippingTitle') },
  payment: { label: textKey('checkout.steps.payment'), title: textKey('checkout.steps.paymentTitle') },
  review: { label: textKey('checkout.steps.review'), title: textKey('checkout.steps.reviewTitle') },
} as const satisfies Record<StepKind, { label: string; title: string }>;
