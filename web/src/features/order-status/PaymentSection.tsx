import { useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon, ChevronIcon } from '@/components/icons.tsx';
import { formatDateTime } from '@/lib/format.ts';
import { CryptoPaymentCard } from '@/features/order-status/CryptoPaymentCard.tsx';
import { MethodPicker } from '@/features/order-status/MethodPicker.tsx';
import { visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { FADE } from '@/lib/motion.ts';
import { isTelegramWebApp, openExternalLink } from '@/lib/telegram-webapp.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface PaymentSectionProps {
  order: PublicOrder;
  reference: string;
  /** The shop's name for the method being paid with now; the faces say "Paying with" it when they have one. */
  methodName?: string;
}

/**
 * Everything about money owed on this order, drawn inside the order page's payment card (which says
 * "Payment needed" and states the amount, so none of the faces repeat either). Which of the four faces it
 * wears — choose a method, finish a hosted checkout, send crypto, or wait on us — is the backend's call:
 * `payment.canPay` and `payment.activePayment` say what state the order is in, and this only renders it.
 */
export function PaymentSection({ order, reference, methodName }: PaymentSectionProps) {
  const payment = order.payment;
  const crypto = visibleCryptoPayments(order);
  // While the change panel is open the current payment's card is hidden: showing
  // an address or a checkout button mid-switch invites paying the payment that
  // is about to be replaced.
  const [changing, setChanging] = useState(false);
  const { t } = useText();

  const active = payment?.activePayment ?? null;
  // Which payment the face is about. A new one (created, or switched to) closes the change panel, and only then:
  // closing it when the request succeeds would bring the old payment's address back for one round trip.
  const faceId = active?.paymentId ?? crypto[0]?.paymentId ?? null;
  const [panelFor, setPanelFor] = useState(active?.paymentId ?? null);
  if (panelFor !== (active?.paymentId ?? null)) {
    setPanelFor(active?.paymentId ?? null);
    setChanging(false);
  }

  // A different payment replaces the face the customer was looking at (or was never there): its heading takes the
  // focus, so a keyboard or screen reader user is not left on a control that has just disappeared. Not on first draw.
  const root = useRef<HTMLDivElement>(null);
  const lastFace = useRef(faceId);
  useEffect(() => {
    if (lastFace.current === faceId) return;
    lastFace.current = faceId;
    if (faceId !== null) root.current?.querySelector<HTMLElement>('[data-face-title]')?.focus();
  }, [faceId]);

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

  // A hosted checkout is only a face when there is something to open and it is still waiting.
  const hostedUsable = active?.kind === 'gateway' && active.status === 'pending' && !!active.checkoutUrl;
  const picking = payment.canPay && (!active || (active.kind === 'gateway' && !hostedUsable));

  return (
    <div ref={root} className={classes.faces}>
      {/* Stated once, above whichever face is showing: every way of paying is on the same clock. */}
      {payment.canPay ? <Deadline payBy={payment.payBy} /> : null}

      {picking ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle} tabIndex={-1} data-face-title>{t('order.payment.chooseTitle')}</h3>
          <MethodPicker order={order} reference={reference} />
        </section>
      ) : null}

      {payment.canPay && hostedUsable && !changing ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle} tabIndex={-1} data-face-title>{t('order.payment.finishTitle')}</h3>
          {methodName ? (
            <p className={classes.faceLead}>
              <span className={classes.faceMethod}>{t('order.payment.payingWith', { method: methodName })}</span>
              <span className={classes.faceAside}>{t('order.payment.hostedLead')}</span>
            </p>
          ) : (
            <p className={classes.faceLead}>{t('order.payment.hostedLead')}</p>
          )}
          <a
            className={classes.cta}
            href={active.checkoutUrl!}
            target="_blank"
            rel="noopener"
            // Some gateways refuse Telegram's in-app view, so inside the Mini App Telegram's own opener (the
            // system browser) takes it, called within the tap. The anchor keeps its href for everything else.
            onClick={(event) => {
              if (!isTelegramWebApp()) return;
              event.preventDefault();
              openExternalLink(active.checkoutUrl!);
            }}
            data-sf-part="button"
            data-variant="filled"
          >
            {t('order.payment.openCheckout')}
            <ArrowUpRightIcon size={14} />
          </a>
          <p className={classes.faceNote}>{t('order.payment.hostedNote')}</p>
        </section>
      ) : null}

      {payment.canPay && active?.kind === 'other' && !changing ? (
        <section className={classes.face} aria-label={t('order.payment.ariaLabel')}>
          <h3 className={classes.faceTitle} tabIndex={-1} data-face-title>{t('order.payment.pendingTitle')}</h3>
          {methodName ? <p className={classes.faceLead}><span className={classes.faceMethod}>{t('order.payment.payingWith', { method: methodName })}</span></p> : null}
          <p className={classes.faceNote}>{t('order.payment.pendingNote')}</p>
        </section>
      ) : null}

      {cards(changing ? active?.paymentId : undefined)}

      {payment.canPay && active?.canChange && !picking ? (
        <ChangeMethod
          order={order}
          reference={reference}
          open={changing}
          onToggle={() => setChanging((v) => !v)}
        />
      ) : null}
    </div>
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
}: PaymentSectionProps & { open: boolean; onToggle: () => void }) {
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
          <MethodPicker order={order} reference={reference} />
        </div>
      ) : null}
    </section>
  );
}
