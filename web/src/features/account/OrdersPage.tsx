import { useMemo } from 'react';
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
import { OrdersFamily, type OrdersData, type OrdersPreview } from '@/builder/family-orders.ts';
import { usePreviewFixture, usePreviewState } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
import classes from '@/features/account/Account.module.css';

function HeadingView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { rows, count } = OrdersFamily.useData();
  if (rows.length === 0) return null;
  return (
    <div className={classes.sectionHead} {...styleAttrs}>
      <h2 className={classes.sectionTitle}>{t('account.orders.title')}</h2>
      <span className={classes.sectionNote}>
        {tp('account.orders.count', count)}
      </span>
    </div>
  );
}

function RowsView({ styleAttrs }: PartViewProps) {
  const { t, tn } = useText();
  const { rows } = OrdersFamily.useData();
  if (rows.length === 0) return null;
  return (
    <ul className={classes.orders} {...styleAttrs}>
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
                {orderStatusLabel(order.status, t)}
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
  );
}

function MoreView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { hasNextPage, isFetchingNextPage, loadMore } = OrdersFamily.useData();
  if (!hasNextPage) return null;
  return (
    <div className={classes.more} {...styleAttrs}>
      <button
        type="button"
        className={classes.ghost}
        onClick={() => loadMore()}
        disabled={isFetchingNextPage}
      >
        {isFetchingNextPage ? t('account.orders.loadingMore') : t('account.orders.loadMore')}
      </button>
    </div>
  );
}

function EmptyView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { rows } = OrdersFamily.useData();
  if (rows.length > 0) return null;
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
      rootAttrs={styleAttrs}
    />
  );
}

/** The order history's views (spec §5.4): the v0.7.0 JSX of each piece. */
export const ORDERS_VIEWS: FamilyValue<OrdersData>['views'] = {
  OrdersHeading: HeadingView, OrdersRows: RowsView, OrdersMore: MoreView, OrdersEmpty: EmptyView,
};

/**
 * The order book: one ruled row per order, newest first, references and dates
 * on the left and figures down the right edge. A row with money still owed says
 * so on its own line — that is the only thing on this page a customer has to act
 * on, so it is the only thing carrying an accent.
 *
 * The OrdersList container: the query and its pending / error screens stay here; the
 * `content` slot holds the parts. Without `slots` the default arrangement is drawn.
 */
export function OrdersPage({ slots }: { slots?: { content: SlotRender } }) {
  const { t } = useText();
  const state = usePreviewState('OrdersList');
  const fixture = usePreviewFixture<OrdersPreview>('OrdersList');
  // The editor previews from a fixture (spec §11.3): the query neither fires nor is read.
  const preview = fixture !== null;
  const orders = useOrders(!preview);
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('OrdersList', 'storefront', {}, 'account.orders')), [slots]);
  const content = slots?.content ?? legacy!.content!;

  const rows = useMemo(
    () => (preview ? (state === 'none' ? [] : fixture.rows) : orders.data?.pages.flatMap((page) => page.data) ?? []),
    [preview, state, fixture, orders.data],
  );
  const value = useMemo<FamilyValue<OrdersData>>(
    () => ({
      data: {
        rows,
        hasNextPage: preview ? fixture.hasNextPage || state === 'more' : orders.hasNextPage,
        isFetchingNextPage: preview ? false : orders.isFetchingNextPage,
        loadMore: () => void orders.fetchNextPage(),
        count: preview ? rows.length : orders.data?.pages[0]?.meta.totalItems ?? rows.length,
      },
      views: ORDERS_VIEWS,
    }),
    [rows, preview, state, orders.data, orders.hasNextPage, orders.isFetchingNextPage, orders.fetchNextPage],
  );

  if (!preview) {
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
  }

  return (
    <OrdersFamily.Provider value={value}>
      {rows.length === 0 ? content() : content({ className: classes.body })}
    </OrdersFamily.Provider>
  );
}
