import { useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useCartStore } from '@/stores/cart.ts';
import { clearPersistedCheckout } from '@/features/checkout/form-state.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { accountOrderPath } from '@/features/checkout/outcome.ts';
import { MissingReferenceScreen } from '@/features/payment-redirect/MissingReferenceScreen.tsx';
import { PAYMENT_VIEWS, useSignInTarget, type PaymentSlots } from '@/features/payment-redirect/payment-parts.tsx';
import { PaymentFamily, type PaymentData, type PaymentPreview } from '@/builder/family-payment.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where a hosted checkout (Stripe et al.) redirects back to on success. A
 * signed-in customer is handed straight to their order page, which follows the
 * order's status. A signed-out one gets a static "thanks" plus the way to sign
 * in and reach the order (this route carries no key it could look the order up
 * with). The session is read synchronously from storage, so a signed-in
 * customer is redirected on the first render and never sees the prompt. A container of payment parts (spec 5.6): without
 * `slots` it draws the default arrangement, exactly v0.7.0's.
 */
export function PaymentSuccessPage({ slots }: { slots?: PaymentSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('PaymentSuccess', 'storefront', {}, 'payment-success') as unknown as PaymentSlots)), [slots]);
  const preview = usePreviewFixture<PaymentPreview>('PaymentSuccess');
  const previewing = preview !== null;
  const [params] = useSearchParams();
  const orderRef = preview ? preview.orderRef : params.get('order');
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const liveSignIn = useSignInTarget(orderRef);
  const signIn = preview ? preview.signIn : liveSignIn;
  const clearCart = useCartStore((s) => s.clear);

  // The shopper reached the payment gateway and came back — start the next
  // visit from a clean slate, same as /order-placed. (Not while the editor previews the page.)
  useEffect(() => {
    if (previewing) return;
    clearCart();
    clearPersistedCheckout();
  }, [clearCart, previewing]);

  const value = useMemo<FamilyValue<PaymentData>>(
    () => ({
      data: { kind: 'success', orderRef, signIn, warning: false, whatsapp: null, telegram: null },
      views: PAYMENT_VIEWS,
    }),
    [orderRef, signIn],
  );

  if (!orderRef) {
    return <MissingReferenceScreen />;
  }

  if (loggedIn && !previewing) return <Navigate to={accountOrderPath(orderRef)} replace />;

  return (
    <PaymentFamily.Provider value={value}>{(slots ?? legacy!).content({ className: `${classes.page} ${FADE}` })}</PaymentFamily.Provider>
  );
}
