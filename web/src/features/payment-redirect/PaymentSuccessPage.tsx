import { useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useCartStore } from '@/stores/cart.ts';
import { clearPersistedCheckout } from '@/features/checkout/form-state.ts';
import { findSavedOrder } from '@/stores/saved-orders.ts';
import { MissingReferenceScreen } from '@/features/payment-redirect/MissingReferenceScreen.tsx';
import { PAYMENT_VIEWS, type PaymentSlots } from '@/features/payment-redirect/payment-parts.tsx';
import { PaymentFamily, type PaymentData, type PaymentPreview } from '@/builder/family-payment.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where a hosted checkout (Stripe et al.) redirects back to on success. There
 * is no polling here — unlike `/order/:ref/:accessKey`, this route carries no
 * access key, so there is nothing further it can ask the backend. If a saved
 * link for this reference already exists (the order page was opened earlier
 * in the same browser), it hands straight off to it — that page polls its own
 * status. Otherwise this is a static "thanks", not a spinner promising an
 * update it can't deliver. A container of payment parts (spec 5.6): without
 * `slots` it draws the default arrangement, exactly v0.7.0's.
 */
export function PaymentSuccessPage({ slots }: { slots?: PaymentSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('PaymentSuccess', 'storefront', {}, 'payment-success') as unknown as PaymentSlots)), [slots]);
  const preview = usePreviewFixture<PaymentPreview>('PaymentSuccess');
  const previewing = preview !== null;
  const [params] = useSearchParams();
  const orderRef = preview ? preview.orderRef : params.get('order');
  const clearCart = useCartStore((s) => s.clear);

  // The shopper reached the payment gateway and came back — start the next
  // visit from a clean slate, same as /order-placed. (Not while the editor previews the page.)
  useEffect(() => {
    if (previewing) return;
    clearCart();
    clearPersistedCheckout();
  }, [clearCart, previewing]);

  const saved = preview ? null : orderRef ? findSavedOrder(orderRef) : null;
  const value = useMemo<FamilyValue<PaymentData>>(
    () => ({
      data: { kind: 'success', orderRef, saved: preview ? preview.saved : saved !== null, warning: false, whatsapp: null, telegram: null },
      views: PAYMENT_VIEWS,
    }),
    [orderRef, preview, saved],
  );

  if (!orderRef) {
    return <MissingReferenceScreen />;
  }

  if (saved) {
    return (
      <Navigate
        to={`/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`}
        replace
      />
    );
  }

  return (
    <PaymentFamily.Provider value={value}>{(slots ?? legacy!).content({ className: `${classes.page} ${FADE}` })}</PaymentFamily.Provider>
  );
}
