import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import type { ShippingAddress } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/** Where it is going. Blank lines are dropped rather than rendered as gaps. */
export function AddressCard({ address }: { address: ShippingAddress }) {
  const { t } = useText();
  const lines = [
    address.addressLine1,
    address.addressLine2,
    address.addressLine3,
    [address.city, address.county].filter(Boolean).join(', '),
    address.zip,
    address.country,
  ].filter((line): line is string => !!line && line.trim().length > 0);

  return (
    <section className={`${classes.card} ${FADE}`} aria-label={t('order.address.title')} data-sf-part="card">
      <p className={classes.cardEyebrow}>{t('order.address.title')}</p>
      <address className={classes.address}>
        <p className={classes.addressName}>
          {address.firstName} {address.surname}
        </p>
        {lines.map((line, i) => (
          <p key={`${line}-${i}`} className={classes.addressLine}>
            {line}
          </p>
        ))}
      </address>
    </section>
  );
}
