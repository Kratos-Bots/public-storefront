import { useState } from 'react';
import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { formatDateTime, formatMoney } from '@/lib/format.ts';
import { CryptoPaymentCard } from '@/features/order-status/CryptoPaymentCard.tsx';
import { MethodPicker } from '@/features/order-status/MethodPicker.tsx';
import { visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface PaymentSectionProps {
  order: PublicOrder;
  reference: string;
  accessKey: string;
}

/**
 * Everything about money owed on this order. Which of the four faces it wears —
 * choose a method, finish a hosted checkout, send crypto, or wait on us — is the
 * backend's call: `payment.canPay` and `payment.activePayment` say what state
 * the order is in, and this only renders it.
 */
export function PaymentSection({ order, reference, accessKey }: PaymentSectionProps) {
  const payment = order.payment;
  const crypto = visibleCryptoPayments(order);
  // While the change panel is open the current payment's card is hidden: showing
  // an address or a checkout button mid-switch invites paying the payment that
  // is about to be replaced.
  const [changing, setChanging] = useState(false);

  const cards = (skip?: number) =>
    crypto
      .filter((p) => p.paymentId !== skip)
      .map((p) => (
        <CryptoPaymentCard
          key={p.paymentId}
          payment={p}
          reference={reference}
          accessKey={accessKey}
          currency={order.currency}
        />
      ));

  // A backend from before the payment block: crypto cards and nothing else.
  if (!payment) return <>{cards()}</>;

  const active = payment.activePayment;
  const total = formatMoney(order.totals.totalAmount, order.currency);

  return (
    <>
      {/* Stated once, above whichever card is showing: every way of paying is on
          the same clock, and the crypto card is a card like any other. */}
      {payment.canPay ? <Deadline payBy={payment.payBy} /> : null}

      {payment.canPay && !active ? (
        <section className={`${classes.card} ${classes.cardAction}`} aria-label="Payment">
          <p className={`${classes.cardEyebrow} ${classes.cardEyebrowAction}`}>Payment required</p>
          <h2 className={classes.cardTitle}>Choose how to pay {total}</h2>
          <MethodPicker order={order} reference={reference} accessKey={accessKey} />
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'gateway' && !changing ? (
        <section className={`${classes.card} ${classes.cardAction}`} aria-label="Payment">
          <div className={classes.cardHead}>
            <div className={classes.cardHeadBody}>
              <p className={`${classes.cardEyebrow} ${classes.cardEyebrowAction}`}>Payment required</p>
              <h2 className={classes.cardTitle}>Finish your payment</h2>
              <p className={classes.cardFigure}>{total} · secure hosted checkout</p>
            </div>
            <span className={classes.pill}>Awaiting payment</span>
          </div>
          {active.checkoutUrl ? (
            <a className={classes.cta} href={active.checkoutUrl} target="_blank" rel="noopener">
              Open secure checkout
              <ArrowUpRightIcon size={12} />
            </a>
          ) : null}
          <div className={classes.waiting} aria-hidden />
          <p className={classes.waitingNote}>
            The checkout opens in a new tab. This page updates on its own once the payment lands.
          </p>
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'other' && !changing ? (
        <section className={classes.card} aria-label="Payment">
          <p className={classes.cardEyebrow}>Payment pending</p>
          <h2 className={classes.cardTitle}>We&rsquo;re waiting on your payment</h2>
          <p className={classes.cardNote}>
            This one is arranged with us directly. Message us if anything is unclear.
          </p>
        </section>
      ) : null}

      {cards(changing ? active?.paymentId : undefined)}

      {payment.canPay && active?.canChange ? (
        <ChangeMethod
          order={order}
          reference={reference}
          accessKey={accessKey}
          open={changing}
          onToggle={() => setChanging((v) => !v)}
          onSelected={() => setChanging(false)}
        />
      ) : null}
    </>
  );
}

/** The auto-cancel deadline, when the shop runs one. */
function Deadline({ payBy }: { payBy: string | null }) {
  if (!payBy) return null;
  const when = formatDateTime(payBy);
  if (!when) return null;
  return (
    <p className={classes.deadline}>
      Pay by <span className={classes.deadlineWhen}>{when}</span> — after that the order cancels
      itself.
    </p>
  );
}

/** The same picker, framed as a switch and folded away until it is wanted. */
function ChangeMethod({
  order,
  reference,
  accessKey,
  open,
  onToggle,
  onSelected,
}: PaymentSectionProps & { open: boolean; onToggle: () => void; onSelected: () => void }) {
  return (
    <section aria-label="Change payment method">
      <button type="button" className={classes.disclosure} onClick={onToggle} aria-expanded={open}>
        <span>{open ? 'Keep this method' : 'Change payment method'}</span>
        <span className={classes.disclosureSign} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div className={`${classes.card} ${classes.disclosurePanel}`}>
          <MethodPicker
            order={order}
            reference={reference}
            accessKey={accessKey}
            onSelected={onSelected}
          />
        </div>
      ) : null}
    </section>
  );
}
