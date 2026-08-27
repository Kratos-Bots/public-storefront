import { FADE } from '@/lib/motion.ts';
import type { ShippingAddress } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/** Where it is going. Blank lines are dropped rather than rendered as gaps. */
export function AddressCard({ address }: { address: ShippingAddress }) {
  const lines = [
    address.addressLine1,
    address.addressLine2,
    address.addressLine3,
    [address.city, address.county].filter(Boolean).join(', '),
    address.zip,
    address.country,
  ].filter((line): line is string => !!line && line.trim().length > 0);

  return (
    <section className={`${classes.card} ${FADE}`} aria-label="Delivery address">
      <p className={classes.cardEyebrow}>Delivery address</p>
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
