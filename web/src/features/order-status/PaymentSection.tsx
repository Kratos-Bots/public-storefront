import { useState } from 'react';
import { ArrowUpRightIcon, ChevronIcon } from '@/components/icons.tsx';
import { formatDateTime } from '@/lib/format.ts';
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
 * Everything about money owed on this order, drawn inside the order page's payment card (which says
 * "Payment needed" and states the amount, so none of the faces repeat either). Which of the four faces it
 * wears — choose a method, finish a hosted checkout, send crypto, or wait on us — is the backend's call:
 * `payment.canPay` and `payment.activePayment` say what state the order is in, and this only renders it.
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

  return (
    <>
      {/* Stated once, above whichever face is showing: every way of paying is on the same clock. */}
      {payment.canPay ? <Deadline payBy={payment.payBy} /> : null}

      {payment.canPay && !active ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle}>{t('order.payment.chooseTitle')}</h3>
          <MethodPicker order={order} reference={reference} />
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'gateway' && !changing ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle}>{t('order.payment.finishTitle')}</h3>
          <p className={classes.faceLead}>{t('order.payment.hostedLead')}</p>
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
              <ArrowUpRightIcon size={14} />
            </a>
          ) : null}
          <p className={classes.faceNote}>{t('order.payment.hostedNote')}</p>
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'other' && !changing ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle}>{t('order.payment.pendingTitle')}</h3>
          <p className={classes.faceNote}>{t('order.payment.pendingNote')}</p>
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

/** The auto-cancel deadline, when the shop runs one. Only the date is emphasised. */
function Deadline({ payBy }: { payBy: string | null }) {
  const { tn } = useText();
  if (!payBy) return null;
  const when = formatDateTime(payBy);
  if (!when) return null;
  return (
    <p className={classes.deadline}>
      {tn('order.payment.deadline', { when: <strong className={classes.deadlineWhen}>{when}</strong> })}
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
        <span className={open ? `${classes.chevron} ${classes.chevronOpen}` : classes.chevron} aria-hidden>
          <ChevronIcon size={14} />
        </span>
      </button>
      {open ? (
        <div className={classes.changePanel}>
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
