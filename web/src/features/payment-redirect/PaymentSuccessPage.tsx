import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useCartStore } from '@/stores/cart.ts';
import { clearPersistedCheckout } from '@/features/checkout/form-state.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CheckIcon } from '@/components/icons.tsx';
import { orderInquiryMessage } from '@/lib/chat-links.ts';
import { findSavedOrder } from '@/stores/saved-orders.ts';
import { MissingReferenceScreen } from '@/features/payment-redirect/MissingReferenceScreen.tsx';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where a hosted checkout (Stripe et al.) redirects back to on success. There
 * is no polling here — unlike `/order/:ref/:accessKey`, this route carries no
 * access key, so there is nothing further it can ask the backend. If a saved
 * link for this reference already exists (the order page was opened earlier
 * in the same browser), it hands straight off to it — that page polls its own
 * status. Otherwise this is a static "thanks", not a spinner promising an
 * update it can't deliver.
 */
export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const orderRef = params.get('order');
  const clearCart = useCartStore((s) => s.clear);

  // The shopper reached the payment gateway and came back — start the next
  // visit from a clean slate, same as /order-placed.
  useEffect(() => {
    clearCart();
    clearPersistedCheckout();
  }, [clearCart]);

  if (!orderRef) {
    return <MissingReferenceScreen />;
  }

  const saved = findSavedOrder(orderRef);
  if (saved) {
    return (
      <Navigate
        to={`/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`}
        replace
      />
    );
  }

  return (
    <div className={`${classes.page} ${FADE}`}>
      <span className={`${classes.ring} ${classes.ringSuccess}`} aria-hidden>
        <CheckIcon size={20} />
      </span>
      <p className={classes.eyebrow} data-tone="success">
        Payment received
      </p>
      <h1 className={classes.headline}>Thanks — your order&rsquo;s being confirmed</h1>
      <p className={classes.detail}>
        We&rsquo;re finalising your order now. You&rsquo;ll hear from us as soon as it&rsquo;s
        confirmed — keep this reference handy if you need to get in touch.
      </p>

      <ReferenceRow value={orderRef} />

      <div className={classes.contact}>
        <ContactLinks prefill={orderInquiryMessage(orderRef)} />
      </div>

      <Link to="/" className={classes.back}>
        ← Back to shop
      </Link>
    </div>
  );
}
