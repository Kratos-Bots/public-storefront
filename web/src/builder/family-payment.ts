import { createFamily } from '@/builder/parts.ts';

export interface PaymentData {
  kind: 'success' | 'cancel' | 'placed';
  orderRef: string | null;
  /** Where a signed-out customer signs in to reach the order; null when signed in, accounts are off, or there is no reference. */
  signIn: string | null;
  /** `?warning=1`: the hosted checkout failed to start (placed). */
  warning: boolean;
  /** Chat links with the reference pre-typed (placed); null when the shop has none. */
  whatsapp: string | null;
  telegram: string | null;
}
export const PaymentFamily = createFamily<PaymentData>('payment');

/** What the editor's Preview state supplies for a payment container (stage 4 §6). */
export interface PaymentPreview {
  orderRef: string | null; signIn: string | null; warning: boolean; whatsapp: string | null; telegram: string | null;
}
