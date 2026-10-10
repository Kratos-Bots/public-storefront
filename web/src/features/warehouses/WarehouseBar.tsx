import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useSelectedWarehouse, useWarehouseOrdering } from '@/features/warehouses/use-warehouse.ts';
import { useCartNoticeShowing } from '@/features/warehouses/OrderingPausedNotice.tsx';
import { isWarehouseBarRoute } from '@/features/warehouses/bar-route.ts';
import { WarehouseStrip } from '@/features/warehouses/WarehouseStrip.tsx';
import { WarehouseNotice } from '@/features/warehouses/WarehouseNotice.tsx';
import classes from '@/features/warehouses/WarehouseBar.module.css';

/**
 * Publishes the bar's height as `--sf-wh-h` on the root, next to `--sf-pin-h`, so everything that sticks
 * under the header (`top: bar + pin + wh`) comes to rest under the bar too. The shells zero it with the
 * other two whenever the header itself is not pinned.
 */
function usePublishedHeight(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const publish = () => root.style.setProperty('--sf-wh-h', `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--sf-wh-h');
    };
  }, [ref]);
}

function PinnedBar() {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref);
  return (
    <div ref={ref} className={classes.bar} data-warehouse-bar="">
      <WarehouseStrip />
      <WarehouseNotice />
    </div>
  );
}

/**
 * The "Shipping from" selector and the not-taking-orders notice as one bar inside the sticky header,
 * under its row, so they stay at the top while a shopper browses products and are absent everywhere else
 * (`isWarehouseBarRoute`). With nothing to show it renders nothing at all - no wrapper, no height - so a
 * shop without the feature draws exactly the header it always did.
 */
export function WarehouseBar() {
  const { pathname } = useLocation();
  const { warehouses } = useSelectedWarehouse();
  const { paused } = useWarehouseOrdering();
  const cartSaysIt = useCartNoticeShowing();
  if (!isWarehouseBarRoute(pathname)) return null;
  if (warehouses.length < 2 && !(paused && !cartSaysIt)) return null;
  return <PinnedBar />;
}
