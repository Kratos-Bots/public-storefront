import { useState } from 'react';
import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { formatDateTime, formatMoney } from '@/lib/format.ts';
import { CryptoPaymentCard } from '@/features/order-status/CryptoPaymentCard.tsx';
import { MethodPicker } from '@/features/order-status/MethodPicker.tsx';
import { visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { FADE } from '@/lib/motion.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface PaymentSectionProps {
  order: PublicOrder;
  reference: string;
}

/**
 * Everything about money owed on this order. Which of the four faces it wears —
 * choose a method, finish a hosted checkout, send crypto, or wait on us — is the
 * backend's call: `payment.canPay` and `payment.activePayment` say what state
 * the order is in, and this only renders it.
 */
export function PaymentSection({ order, reference }: PaymentSectionProps) {
  const payment = order.payment;
  const crypto = visibleCryptoPayments(order);
  // While the change panel is open the current payment's card is hidden: showing
  // an address or a checkout button mid-switch invites paying the payment that
  // is about to be replaced.
  const [changing, setChanging] = useState(false);
  const { t } = useText();

  const cards = (skip?: number) =>
    crypto
      .filter((p) => p.paymentId !== skip)
      .map((p) => (
        <CryptoPaymentCard
          key={p.paymentId}
          payment={p}
          reference={reference}
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
        <section className={`${classes.card} ${classes.cardAction}`} aria-label={t('order.payment.ariaLabel')} data-sf-part="card">
          <p className={`${classes.cardEyebrow} ${classes.cardEyebrowAction}`}>{t('order.payment.required')}</p>
          <h2 className={classes.cardTitle}>{t('order.payment.chooseHowToPay', { total })}</h2>
          <MethodPicker order={order} reference={reference} />
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'gateway' && !changing ? (
        <section className={`${classes.card} ${classes.cardAction}`} aria-label={t('order.payment.ariaLabel')} data-sf-part="card">
          <div className={classes.cardHead}>
            <div className={classes.cardHeadBody}>
              <p className={`${classes.cardEyebrow} ${classes.cardEyebrowAction}`}>{t('order.payment.required')}</p>
              <h2 className={classes.cardTitle}>{t('order.payment.finishTitle')}</h2>
              <p className={classes.cardFigure}>{t('order.payment.hostedFigure', { total })}</p>
            </div>
            <span className={classes.pill}>{t('order.payment.awaiting')}</span>
          </div>
          {active.checkoutUrl ? (
            <a
              className={classes.cta}
              href={active.checkoutUrl}
              target="_blank"
              rel="noopener"
              data-sf-part="button"
              data-variant="filled"
            >
              {t('order.payment.openCheckout')}
              <ArrowUpRightIcon size={12} />
            </a>
          ) : null}
          <div className={classes.waiting} aria-hidden />
          <p className={classes.waitingNote}>{t('order.payment.hostedNote')}</p>
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'other' && !changing ? (
        <section className={classes.card} aria-label={t('order.payment.ariaLabel')} data-sf-part="card">
          <p className={classes.cardEyebrow}>{t('order.payment.pendingEyebrow')}</p>
          <h2 className={classes.cardTitle}>{t('order.payment.pendingTitle')}</h2>
          <p className={classes.cardNote}>{t('order.payment.pendingNote')}</p>
        </section>
      ) : null}

      {cards(changing ? active?.paymentId : undefined)}

      {payment.canPay && active?.canChange ? (
        <ChangeMethod
          order={order}
          reference={reference}
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
  const { tn } = useText();
  if (!payBy) return null;
  const when = formatDateTime(payBy);
  if (!when) return null;
  return (
    <p className={classes.deadline}>
      {tn('order.payment.deadline', { when: <span className={classes.deadlineWhen}>{when}</span> })}
    </p>
  );
}

/** The same picker, framed as a switch and folded away until it is wanted. */
function ChangeMethod({
  order,
  reference,
  open,
  onToggle,
  onSelected,
}: PaymentSectionProps & { open: boolean; onToggle: () => void; onSelected: () => void }) {
  const { t } = useText();
  return (
    <section className={FADE} aria-label={t('order.payment.changeMethod')}>
      <button type="button" className={classes.disclosure} onClick={onToggle} aria-expanded={open}>
        <span>{open ? t('order.payment.keepMethod') : t('order.payment.changeMethod')}</span>
        <span className={classes.disclosureSign} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div className={`${classes.card} ${classes.disclosurePanel}`} data-sf-part="card">
          <MethodPicker
            order={order}
            reference={reference}
            onSelected={onSelected}
          />
        </div>
      ) : null}
    </section>
  );
}
