import { CheckIcon, ClockIcon } from '@/components/icons.tsx';
import { formatDate } from '@/lib/format.ts';
import { ROUTE_STEPS, statusView, type StatusView } from '@/features/order-status/status.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/**
 * Where the order is, in one headline and four milestones.
 *
 * The route is the page's signature: square nodes on a rail, in the geometry the
 * checkout's choice marker uses. It carries a date wherever the order payload
 * actually knows one — nothing is invented to fill the column.
 */
export function StatusHero({ order }: { order: PublicOrder }) {
  const view = statusView(order);
  // The route carries the dates it knows. When it isn't on screen — payment
  // outstanding, or a cancelled order — the hero states the one date there is,
  // rather than the two surfaces saying the same thing twice.
  const routeShown = !view.terminal && !order.payment?.canPay;
  const delivered = order.deliveredAt ? formatDate(order.deliveredAt) : '';
  const placed = formatDate(order.createdAt);
  const stamp = delivered ? `Delivered ${delivered}` : placed ? `Placed ${placed}` : null;

  return (
    <section className={classes.hero} aria-label="Order status">
      <p className={classes.eyebrow} data-tone={view.tone}>
        {view.eyebrow}
      </p>
      <h1 className={classes.headline}>{view.headline}</h1>
      <p className={classes.detail}>{view.detail}</p>

      {!routeShown && stamp ? <p className={classes.meta}>{stamp}</p> : null}

      {order.isPreorder && !view.terminal && !view.done ? (
        <p className={classes.flag}>
          <ClockIcon size={12} />
          Contains pre-order items
        </p>
      ) : null}

      {view.terminal ? (
        <TerminalNotice kind={view.terminal} />
      ) : order.payment?.canPay ? null : (
        // While money is owed, paying is the only thing worth showing — the
        // payment card takes the space directly under the headline.
        <Route view={view} order={order} />
      )}
    </section>
  );
}

/** The dates the payload actually carries, by milestone. Everything else stays blank. */
function stepDates(order: PublicOrder): Array<string | null> {
  const shippedAt = order.shipments
    .map((s) => s.shippedAt)
    .filter((s): s is string => !!s)
    .sort()[0];
  return [
    formatDate(order.createdAt) || null,
    null,
    shippedAt ? formatDate(shippedAt) : null,
    order.deliveredAt ? formatDate(order.deliveredAt) : null,
  ];
}

function Route({ view, order }: { view: StatusView; order: PublicOrder }) {
  const dates = stepDates(order);

  return (
    <ol className={classes.route} aria-label="Order progress">
      {ROUTE_STEPS.map((label, i) => {
        const last = i === ROUTE_STEPS.length - 1;
        const done = view.done || (view.activeStep !== null && i < view.activeStep);
        const here = !view.done && view.activeStep === i;
        const arrived = view.done && last;
        const when = done || here ? dates[i] : null;

        return (
          <li key={label} className={classes.step} aria-current={here ? 'step' : undefined}>
            <span
              className={[
                classes.node,
                arrived ? classes.nodeArrived : done ? classes.nodeDone : here ? classes.nodeHere : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            >
              {here ? <span className={classes.nodeCore} /> : null}
              {done || arrived ? <CheckIcon size={10} /> : null}
            </span>
            {last ? null : (
              <span
                className={done ? `${classes.rail} ${classes.railDone}` : classes.rail}
                aria-hidden
              />
            )}
            <span className={classes.stepBody}>
              <span className={done || here ? `${classes.stepLabel} ${classes.stepLabelOn}` : classes.stepLabel}>
                {label}
              </span>
              {here && view.partial ? <span className={classes.stepMark}>Partial</span> : null}
              {when ? <span className={classes.stepWhen}>{when}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TerminalNotice({ kind }: { kind: 'cancelled' | 'refunded' }) {
  const cancelled = kind === 'cancelled';
  return (
    <p className={cancelled ? `${classes.terminal} ${classes.terminalDanger}` : classes.terminal}>
      {cancelled
        ? "If that isn't right, reply to the message that sent you this link and we'll sort it out."
        : 'Refunds take 5–10 business days to appear on your statement.'}
    </p>
  );
}
