import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { PAYMENT_VIEWS, useSignInTarget, type PaymentSlots } from '@/features/payment-redirect/payment-parts.tsx';
import { PaymentFamily, type PaymentData, type PaymentPreview } from '@/builder/family-payment.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where a hosted checkout redirects back to when the shopper cancels or backs
 * out before paying. Nothing was charged — the copy says so plainly — and the
 * order is still there to finish, so a signed-in customer's primary action
 * returns to their order page and a signed-out one is asked to sign in to
 * reach it (back to the shop when accounts are off). A
 * container of payment parts (spec 5.6): without `slots` it draws the default
 * arrangement, exactly v0.7.0's.
 */
export function PaymentCancelPage({ slots }: { slots?: PaymentSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('PaymentCancel', 'storefront', {}, 'payment-cancel') as unknown as PaymentSlots)), [slots]);
  const preview = usePreviewFixture<PaymentPreview>('PaymentCancel');
  const [params] = useSearchParams();
  const orderRef = preview ? preview.orderRef : params.get('order');
  const liveSignIn = useSignInTarget(orderRef);
  const signIn = preview ? preview.signIn : liveSignIn;

  const value = useMemo<FamilyValue<PaymentData>>(
    () => ({ data: { kind: 'cancel', orderRef, signIn, warning: false, whatsapp: null, telegram: null }, views: PAYMENT_VIEWS }),
    [orderRef, signIn],
  );

  return (
    <PaymentFamily.Provider value={value}>{(slots ?? legacy!).content({ className: `${classes.page} ${FADE}` })}</PaymentFamily.Provider>
  );
}
