import { Link } from 'react-router';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Shown by both `/payment/success` and `/order-placed` when the `?order`
 * param is missing — a garbled or truncated link, same failure either way,
 * so the recovery (message us, or start over) is identical too.
 */
export function MissingReferenceScreen() {
  return (
    <div className={classes.page}>
      <EmptyState
        eyebrow="Order link"
        title="Order reference missing"
        description="Return to the shop and try again, or message us for help."
      />
      <ContactLinks />
      <Link to="/" className={classes.back}>
        ← Back to shop
      </Link>
    </div>
  );
}
