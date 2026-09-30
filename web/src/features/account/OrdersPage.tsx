import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { formatDate } from '@/lib/format.ts';
import { orderStatusLabel, orderStatusTone } from '@/features/order-status/status.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrders } from '@/features/account/queries.ts';
import { useText } from '@/text/runtime.tsx';
import { rowAnim } from '@/lib/motion.ts';
import classes from '@/features/account/Account.module.css';

/**
 * The order book: one ruled row per order, newest first, references and dates
 * on the left and figures down the right edge. A row with money still owed says
 * so on its own line — that is the only thing on this page a customer has to act
 * on, so it is the only thing carrying an accent.
 */
export function OrdersPage() {
  const { t, tn, tp } = useText();
  const orders = useOrders();

  if (orders.isPending) return <PageSkeleton inline />;

  if (orders.isError) {
    return (
      <EmptyState
        eyebrow={t('account.nav.orders')}
        title={t('account.orders.loadFailedTitle')}
        description={t('account.orders.loadFailedBody')}
        action={
          <Button variant="default" size="sm" onClick={() => void orders.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  }

  const rows = orders.data.pages.flatMap((page) => page.data);
  const total = orders.data.pages[0]?.meta.totalItems ?? rows.length;

  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow={t('account.nav.orders')}
        title={t('account.orders.emptyTitle')}
        description={t('account.orders.emptyBody')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('common.actions.browseCatalogue')}
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.body}>
      <div className={classes.sectionHead}>
        <h2 className={classes.sectionTitle}>{t('account.orders.title')}</h2>
        <span className={classes.sectionNote}>
          {tp('account.orders.count', total)}
        </span>
      </div>

      <ul className={classes.orders}>
        {rows.map((order, i) => (
          <li key={order.reference} {...rowAnim(i)}>
            <Link to={`/account/orders/${order.reference}`} className={classes.order}>
              <span className={classes.ref}>{order.reference}</span>
              <span className={classes.total}>
                <Money amount={order.totalAmount} />
              </span>
              <span className={classes.date}>{formatDate(order.createdAt)}</span>
              <span className={classes.status}>
                <StatusPill tone={orderStatusTone(order.status)}>
                  {orderStatusLabel(order.status)}
                </StatusPill>
              </span>
              {order.outstandingBalance > 0 ? (
                <span className={classes.due}>
                  {tn('account.orders.balanceDue', { amount: <Money amount={order.outstandingBalance} /> })}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {orders.hasNextPage ? (
        <div className={classes.more}>
          <button
            type="button"
            className={classes.ghost}
            onClick={() => void orders.fetchNextPage()}
            disabled={orders.isFetchingNextPage}
          >
            {orders.isFetchingNextPage ? t('account.orders.loadingMore') : t('account.orders.loadMore')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
