import { createFamily } from '@/builder/parts.ts';

export interface PaymentData {
  kind: 'success' | 'cancel' | 'placed';
  orderRef: string | null;
  /** A saved order link exists for the reference (cancel's return-to-order target). */
  saved: boolean;
  /** `?warning=1`: the hosted checkout failed to start (placed). */
  warning: boolean;
  /** Chat links with the reference pre-typed (placed); null when the shop has none. */
  whatsapp: string | null;
  telegram: string | null;
}
export const PaymentFamily = createFamily<PaymentData>('payment');

/** What the editor's Preview state supplies for a payment container (stage 4 §6). */
export interface PaymentPreview {
  orderRef: string | null; saved: boolean; warning: boolean; whatsapp: string | null; telegram: string | null;
}
