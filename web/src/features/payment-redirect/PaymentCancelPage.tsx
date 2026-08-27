import { Link, useSearchParams } from 'react-router';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { orderChatMessage } from '@/lib/chat-links.ts';
import { findSavedOrder } from '@/stores/saved-orders.ts';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where a hosted checkout redirects back to when the shopper cancels or backs
 * out before paying. Nothing was charged — the copy says so plainly — and the
 * order is still there to finish, so the primary action returns to it
 * whenever a saved link exists rather than sending them back to browse.
 */
export function PaymentCancelPage() {
  const [params] = useSearchParams();
  const orderRef = params.get('order');
  const saved = orderRef ? findSavedOrder(orderRef) : null;

  return (
    <div className={`${classes.page} ${FADE}`}>
      <span className={`${classes.ring} ${classes.ringWarn}`} aria-hidden>
        <CloseIcon size={18} />
      </span>
      <p className={classes.eyebrow} data-tone="warn">
        Payment cancelled
      </p>
      <h1 className={classes.headline}>No charge taken</h1>
      <p className={classes.detail}>
        Your order is still saved. Return to it to try again or choose another way to
        pay, or message us if you&rsquo;d like a hand.
      </p>

      {orderRef ? <ReferenceRow value={orderRef} /> : null}

      <div className={classes.actions}>
        {saved ? (
          <Link
            to={`/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`}
            className={classes.cta}
          >
            Return to your order
          </Link>
        ) : (
          <Link to="/" className={classes.cta}>
            Back to shop
          </Link>
        )}
      </div>

      <div className={classes.contact}>
        <ContactLinks prefill={orderRef ? orderChatMessage(orderRef) : undefined} />
      </div>
    </div>
  );
}
