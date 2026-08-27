import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { formatDate } from '@/lib/format.ts';
import { orderStatusLabel, orderStatusTone } from '@/features/order-status/status.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrders } from '@/features/account/queries.ts';
import { rowAnim } from '@/lib/motion.ts';
import classes from '@/features/account/Account.module.css';

/**
 * The order book: one ruled row per order, newest first, references and dates
 * on the left and figures down the right edge. A row with money still owed says
 * so on its own line — that is the only thing on this page a customer has to act
 * on, so it is the only thing carrying an accent.
 */
export function OrdersPage() {
  const orders = useOrders();

  if (orders.isPending) return <PageSkeleton inline />;

  if (orders.isError) {
    return (
      <EmptyState
        eyebrow="Orders"
        title="We couldn't load your orders"
        description="Your history is safe — this was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void orders.refetch()}>
            Try again
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
        eyebrow="Orders"
        title="No orders yet"
        description="Everything you order shows up here, with what you paid and where it is."
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            Browse the catalogue
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.body}>
      <div className={classes.sectionHead}>
        <h2 className={classes.sectionTitle}>Order history</h2>
        <span className={classes.sectionNote}>
          {total} {total === 1 ? 'order' : 'orders'}
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
                  Balance due <Money amount={order.outstandingBalance} />
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
            {orders.isFetchingNextPage ? 'Loading' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
