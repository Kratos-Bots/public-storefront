import { EmptyState } from '@/components/EmptyState.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

/** The hero's silhouette, blocked out while the order loads. */
export function LoadingScreen() {
  const { t } = useText();
  return (
    <div className={classes.skeleton} role="status" aria-label={t('order.screens.loading')}>
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
  const { t } = useText();
  return (
    <div className={classes.screen}>
      <span className={classes.screenRule} aria-hidden />
      <EmptyState
        eyebrow={t('order.link.eyebrow')}
        title={t('order.screens.invalidTitle')}
        description={t('order.screens.invalidDescription')}
      />
      <ContactLinks />
    </div>
  );
}

/** We couldn't reach the shop. The order is fine; the connection wasn't. */
export function NetworkErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useText();
  return (
    <div className={classes.screen}>
      <span className={classes.screenRule} aria-hidden />
      <EmptyState
        eyebrow={t('order.screens.networkEyebrow')}
        title={t('order.screens.networkTitle')}
        description={t('order.screens.networkDescription')}
        action={
          <button type="button" className={classes.ghost} onClick={onRetry}>
            {t('common.actions.tryAgain')}
          </button>
        }
      />
    </div>
  );
}
