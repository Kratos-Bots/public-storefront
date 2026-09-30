import { Link, useSearchParams } from 'react-router';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { orderChatMessage } from '@/lib/chat-links.ts';
import { findSavedOrder } from '@/stores/saved-orders.ts';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
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
  const { t } = useText();

  return (
    <div className={`${classes.page} ${FADE}`}>
      <span className={`${classes.ring} ${classes.ringWarn}`} aria-hidden>
        <CloseIcon size={18} />
      </span>
      <p className={classes.eyebrow} data-tone="warn">
        {t('payment.cancel.eyebrow')}
      </p>
      <h1 className={classes.headline}>{t('payment.cancel.headline')}</h1>
      <p className={classes.detail}>{t('payment.cancel.detail')}</p>

      {orderRef ? <ReferenceRow value={orderRef} /> : null}

      <div className={classes.actions}>
        {saved ? (
          <Link
            to={`/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`}
            className={classes.cta}
            data-sf-part="button"
            data-variant="filled"
          >
            {t('payment.cancel.returnToOrder')}
          </Link>
        ) : (
          <Link to="/" className={classes.cta} data-sf-part="button" data-variant="filled">
            {t('payment.cancel.backToShop')}
          </Link>
        )}
      </div>

      <div className={classes.contact}>
        <ContactLinks prefill={orderRef ? orderChatMessage(orderRef) : undefined} />
      </div>
    </div>
  );
}
