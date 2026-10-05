import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Money } from '@/components/Money.tsx';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { ApiError } from '@/lib/errors.ts';
import { wantTitleFocus } from '@/features/account/title-focus.ts';
import { cancelView } from '@/features/order-status/cancel-state.ts';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import { paymentMovedOn, visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { SupportLinks } from '@/features/order-status/SupportLinks.tsx';
import { useText } from '@/text/runtime.tsx';
import type { StyleAttrs } from '@/builder/define.ts';
import type { OrderDetail } from '@/types/orders.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import classes from '@/features/account/OrderDetail.module.css';

/** What the card needs of the payment query: the editor's preview hands it the same shape. */
export interface PaymentRead {
  data: PublicOrder | undefined;
  isError: boolean;
  /** What the failed read threw; a 429 is told apart from any other failure. */
  error?: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * What is owed and how to settle it: the strongest thing on the order page. The amount leads; the
 * body is whatever the payment state calls for (a placeholder while it loads, a retry when it could
 * not, the payment section when there is a way to pay, a pointer to the shop when there is not); and
 * Cancel order sits under a rule in every one of those, since its own logic decides whether to draw.
 */
export function OrderPaymentCard({ order, payment, styleAttrs }: { order: OrderDetail; payment: PaymentRead; styleAttrs?: StyleAttrs }) {
  const { t } = useText();
  const queryClient = useQueryClient();
  const titleId = useId();

  const loaded = payment.data;
  // With no data, a retry resets the query to pending and clears its error; this remembers that the last
  // read failed until one succeeds, so the message stays up while Try again is in flight.
  const [lastFailed, setLastFailed] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  if (!loaded && payment.isError && !lastFailed) { setLastFailed(true); setLastError(payment.error ?? null); }
  if (loaded && lastFailed) { setLastFailed(false); setLastError(null); }
  // What PaymentSection would draw: a way to pay, or crypto payments to show.
  const payable = loaded && (loaded.payment?.canPay || visibleCryptoPayments(loaded).length > 0) ? loaded : null;
  const cancelShows = cancelView(order.canCancel, order.cancelBlockedBy);
  // The payment view is the fresher read: when it says the order has moved on, the account order is about to say
  // the same, and until it does nothing here should claim the balance cannot be paid.
  const updating = !payable && !!loaded && paymentMovedOn(loaded, order.status);
  // Loaded, the view agrees the order is waiting, and there is nothing to pay with (cannot be paid online, or an
  // older backend sent no payment block): say so and point to the shop, unless the cancel control is already
  // showing its own contact line.
  const payHelp = !payable && !!loaded && !updating && cancelShows !== 'contact';
  const failed = !loaded && (payment.isError || lastFailed);
  const loading = !loaded && !failed;

  return (
    <section className={`${classes.card} ${classes.payCard}`} aria-labelledby={titleId} data-sf-part="card" {...styleAttrs}>
      <span className={classes.accent} aria-hidden />
      <div className={classes.payHead}>
        <h2 id={titleId} className={classes.payEyebrow}>{t('account.order.pay.eyebrow')}</h2>
        <p className={classes.payAmount}>
          <span className={classes.srOnly}>{t('account.order.balanceDue')}</span>
          <Money amount={order.outstandingBalance} />
        </p>
      </div>

      {loading ? (
        <div className={`${classes.payBody} ${classes.skeleton}`} aria-busy="true">
          <span className={classes.srOnly}>{t('account.order.pay.loading')}</span>
          <span className={classes.skeletonLine} aria-hidden />
          <span className={classes.skeletonLine} aria-hidden />
        </div>
      ) : null}
      {failed ? (
        <div className={`${classes.payBody} ${classes.failed}`} role="alert">
          <p className={classes.failedText}>
            {(payment.error ?? lastError) instanceof ApiError && ((payment.error ?? lastError) as ApiError).status === 429
              ? t('account.order.pay.rateLimited')
              : t('account.order.pay.loadFailed')}
          </p>
          <button type="button" className={classes.retry} data-sf-part="button" data-variant="default" aria-disabled={payment.isFetching} onClick={() => { if (!payment.isFetching) void payment.refetch(); }}>
            {payment.isFetching ? t('common.status.loading') : t('common.actions.tryAgain')}
          </button>
        </div>
      ) : null}
      {payable ? (
        <div className={classes.payBody}>
          <PaymentSection order={payable} reference={order.reference} />
        </div>
      ) : null}
      {updating ? (
        <div className={classes.payBody}>
          <p className={classes.payHelp}>{t('account.order.pay.updating')}</p>
        </div>
      ) : null}
      {payHelp ? (
        <div className={classes.payBody}>
          <p className={classes.payHelp}>{t('account.order.payHelp')}</p>
          <SupportLinks />
        </div>
      ) : null}

      <div className={classes.payFoot}>
        <CancelOrder
          reference={order.reference}
          canCancel={order.canCancel}
          blockedBy={order.cancelBlockedBy}
          onCancelled={(outcome) => {
            if (outcome === 'cancelled') wantTitleFocus(order.reference);
            invalidateAfterCancel(queryClient, order.reference);
          }}
        />
      </div>
    </section>
  );
}
