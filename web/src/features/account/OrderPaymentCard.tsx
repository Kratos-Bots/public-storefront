import { useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Money } from '@/components/Money.tsx';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { cancelView } from '@/features/order-status/cancel-state.ts';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import { visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
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
  // What PaymentSection would draw: a way to pay, or crypto payments to show.
  const payable = loaded && (loaded.payment?.canPay || visibleCryptoPayments(loaded).length > 0) ? loaded : null;
  const cancelShows = cancelView(order.canCancel, order.cancelBlockedBy);
  // A balance with no way to pay it online and nothing else saying why (so never beside a payment section).
  const payHelp =
    !payable && !!loaded && loaded.payment?.canPay === false && cancelShows !== 'contact' &&
    loaded.status !== 'cancelled' && loaded.status !== 'refunded';
  // A failed read stays on screen while it is retried (by the button or the once-a-minute poll): swapping it
  // for the placeholder every minute would make the card flicker.
  const failed = !loaded && payment.isError;
  const loading = !loaded && !failed;

  return (
    <section className={classes.card} aria-labelledby={titleId} data-sf-part="card" {...styleAttrs}>
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
          <p className={classes.failedText}>{t('account.order.pay.loadFailed')}</p>
          <button type="button" className={classes.retry} data-sf-part="button" data-variant="default" disabled={payment.isFetching} onClick={() => void payment.refetch()}>
            {t('common.actions.tryAgain')}
          </button>
        </div>
      ) : null}
      {payable ? (
        <div className={classes.payBody}>
          <PaymentSection order={payable} reference={order.reference} />
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
          key={order.reference}
          reference={order.reference}
          canCancel={order.canCancel}
          blockedBy={order.cancelBlockedBy}
          onCancelled={() => invalidateAfterCancel(queryClient, order.reference)}
        />
      </div>
    </section>
  );
}
