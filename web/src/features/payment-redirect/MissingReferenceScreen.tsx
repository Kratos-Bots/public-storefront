import { Link } from 'react-router';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Shown by both `/payment/success` and `/order-placed` when the `?order`
 * param is missing — a garbled or truncated link, same failure either way,
 * so the recovery (message us, or start over) is identical too.
 */
export function MissingReferenceScreen() {
  const { t } = useText();
  return (
    <div className={classes.page}>
      <EmptyState
        eyebrow={t('order.link.eyebrow')}
        title={t('payment.missing.title')}
        description={t('payment.missing.description')}
      />
      <ContactLinks />
      <Link to="/" className={classes.back}>
        {t('common.actions.backToShop')}
      </Link>
    </div>
  );
}
