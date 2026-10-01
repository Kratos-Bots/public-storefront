import { createFamily } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import type { ContactModes } from '@/types/settings.ts';
import type { CryptoOption, PaymentMethod, Quote } from '@/types/checkout.ts';

// Runtime-safe: type-only imports from features (this module is in the shopper's entry bundle).

export type StepKind = 'contact' | 'address' | 'shipping' | 'payment' | 'review';
export const STEP_KINDS: readonly StepKind[] = ['contact', 'address', 'shipping', 'payment', 'review'];
export const STEP_TYPE: Readonly<Record<StepKind, string>> = {
  contact: 'CheckoutContact', address: 'CheckoutAddress', shipping: 'CheckoutShipping', payment: 'CheckoutPayment', review: 'CheckoutReview',
};
export const DEFAULT_STEP_ORDER: readonly StepKind[] = STEP_KINDS;

export type StepOrderProblem = 'review-last' | 'address-first' | 'payment-last';

/** null when `order` (kinds in stored order) is legal OR not a full permutation (part-required reports that). */
export function stepOrderProblem(order: readonly StepKind[]): StepOrderProblem | null {
  const at = (k: StepKind) => order.indexOf(k);
  if (order.includes('review') && at('review') !== order.length - 1) return 'review-last';
  if (order.includes('address') && order.includes('shipping') && at('address') > at('shipping')) return 'address-first';
  if (order.includes('shipping') && order.includes('payment') && at('shipping') > at('payment')) return 'payment-last';
  return null;
}

export const isLegalStepOrder = (o: readonly StepKind[]): boolean => o.length === 5 && new Set(o).size === 5 && stepOrderProblem(o) === null;

export const STEP_ORDER_MESSAGE: Readonly<Record<StepOrderProblem, string>> = {
  'review-last': 'The Review step must be last — it holds Place order.',
  'address-first': 'Delivery options need the Delivery address step before them.',
  'payment-last': 'Payment must come after the Delivery address and Delivery steps.',
};

/** Maps step block types back to kinds, dropping every other type. */
export function stepKindsOf(types: readonly string[]): StepKind[] {
  const byType = new Map<string, StepKind>(STEP_KINDS.map((k) => [STEP_TYPE[k], k]));
  const out: StepKind[] = [];
  for (const t of types) {
    const k = byType.get(t);
    if (k) out.push(k);
  }
  return out;
}

/** The CheckoutFlow container's data (stage 5 spec section 5.1). */
export interface CheckoutData {
  /** The PERSISTED form (views read what the shopper typed). */
  form: CheckoutForm;
  patch: (next: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  contactModes: ContactModes;
  guest: boolean;
  currency: string;
  /** The shown quote (the last good one while a refetch fails). */
  quote: Quote | undefined;
  method: PaymentMethod | undefined;
  combo: CryptoOption | null;
  /** A quote is in the air or a guest token is being minted. */
  busy: boolean;
  quoteStale: boolean;
  couponError?: string;
  shippingNotice?: string;
  addressNotice?: string;
  order: readonly StepKind[];
  step: number;
  kind: StepKind;
  onReview: boolean;
  /** Clears errors, sets the step, scrolls the card into view. */
  goTo(index: number): void;
}
export const CheckoutFamily = createFamily<CheckoutData>('checkout');

export interface CheckoutSlots { head: SlotRender; lead: SlotRender; steps: SlotRender; after: SlotRender; aside: SlotRender }
