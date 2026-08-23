import { EmptyState } from '@/components/EmptyState.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

/** The hero's silhouette, blocked out while the order loads. */
export function LoadingScreen() {
  return (
    <div className={classes.skeleton} role="status" aria-label="Loading your order">
      <span className={classes.block} style={{ width: 96, height: 12 }} />
      <span className={classes.block} style={{ width: 216, height: 30 }} />
      <span className={classes.block} style={{ width: 264, height: 14 }} />
      <span className={`${classes.block} ${classes.blockCard}`} />
    </div>
  );
}

/**
 * The link is unusable. The customer can't fix a bad key themselves, so the
 * screen hands them the one thing that works: the conversation this link
 * arrived in.
 */
export function InvalidLinkScreen() {
  return (
    <div className={classes.screen}>
      <span className={classes.screenRule} aria-hidden />
      <EmptyState
        eyebrow="Order link"
        title="This link isn't valid"
        description="The link looks incomplete or has expired. Reply to the message that sent it and we'll share a fresh one."
      />
      <ContactLinks />
    </div>
  );
}

/** We couldn't reach the shop. The order is fine; the connection wasn't. */
export function NetworkErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={classes.screen}>
      <span className={classes.screenRule} aria-hidden />
      <EmptyState
        eyebrow="Connection"
        title="We couldn't load your order"
        description="Your order is safe — this was a hiccup between your browser and us."
        action={
          <button type="button" className={classes.ghost} onClick={onRetry}>
            Try again
          </button>
        }
      />
    </div>
  );
}
