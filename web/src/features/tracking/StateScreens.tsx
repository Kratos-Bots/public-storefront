import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { formatRelative } from '@/features/tracking/status.ts';
import { useText } from '@/text/runtime.tsx';
import type { TrackingLookup } from '@/types/tracking.ts';
import classes from '@/features/tracking/Tracking.module.css';

/**
 * Shaped like the answer it will be replaced by — eyebrow row, headline, stage
 * rail, facts, first card — so nothing jumps when the lookup lands.
 */
export function PendingSkeleton() {
  const { t } = useText();
  return (
    <div className={classes.skeleton} role="status" aria-label={t('tracking.states.loading')}>
      <div className={classes.heroTop}>
        <span className={classes.block} style={{ width: 112, height: 11 }} />
        <span className={classes.block} style={{ width: 88, height: 20 }} />
      </div>
      <span className={classes.block} style={{ width: 208, height: 30, marginTop: 12 }} />
      <span className={classes.block} style={{ width: 160, height: 14, marginTop: 10 }} />

      <div className={classes.skelRail}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className={classes.block} style={{ height: 5 }} />
        ))}
      </div>

      <div className={classes.skelFacts}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={classes.skelFact}>
            <span className={classes.block} style={{ width: 52, height: 9 }} />
            <span className={classes.block} style={{ width: 92, height: 13, marginTop: 8 }} />
          </div>
        ))}
      </div>

      <div className={classes.skelCard}>
        <span className={classes.block} style={{ width: 64, height: 18 }} />
        <span className={classes.block} style={{ width: '100%', height: 12, marginTop: 20 }} />
        <span className={classes.block} style={{ width: '80%', height: 12, marginTop: 10 }} />
        <span className={classes.block} style={{ width: '60%', height: 12, marginTop: 10 }} />
      </div>
    </div>
  );
}

/**
 * The invisible challenge hasn't handed over a token yet. It normally resolves
 * in well under a second, so this is usually a flicker — but a slow challenge
 * must not read as a stalled lookup. The sweeping hairline is the shop's mark
 * for waiting on something it cannot hurry.
 */
export function VerifyingNote() {
  const { t } = useText();
  return (
    <div className={classes.verifying} role="status">
      <p className={classes.verifyingLabel}>{t('tracking.states.verifying')}</p>
      <span className={classes.sweep} aria-hidden />
    </div>
  );
}

/**
 * The challenge never produced a token — a blocked script, a network filter, or
 * a widget that errored for good. Nothing can be looked up without one, so say
 * so rather than leaving the visitor on a skeleton forever. A reset can't help a
 * widget that never mounted, so the action is a reload.
 */
export function VerifyBlockedScreen({ onReload }: { onReload: () => void }) {
  const { t } = useText();
  return (
    <div className={classes.screen} data-tone="warn">
      <p className={classes.screenHead} data-tone="warn">
        {t('tracking.states.blockedHead')}
      </p>
      <p className={classes.screenText}>{t('tracking.states.blockedBody')}</p>
      <div className={classes.screenAction}>
        <button className={classes.ghost} type="button" onClick={onReload}>
          {t('tracking.states.reload')}
        </button>
      </div>
      <div className={classes.screenContact}>
        <ContactLinks />
      </div>
    </div>
  );
}

export function NotFoundScreen() {
  const { t } = useText();
  return (
    <div className={classes.screen} data-tone="warn">
      <p className={classes.screenHead} data-tone="warn">
        {t('tracking.states.notFoundHead')}
      </p>
      <p className={classes.screenText}>{t('tracking.states.notFoundBody')}</p>
      <div className={classes.screenContact}>
        <ContactLinks />
      </div>
    </div>
  );
}

/**
 * The lookup failed for a reason that isn't "no such order". Four of those, and
 * they need four different things from the visitor — a retry is the wrong offer
 * for three of them.
 */
export function ErrorScreen({ status, onRetry }: { status: number; onRetry: () => void }) {
  const { t } = useText();
  if (status === 503) {
    return (
      <div className={classes.screen} data-tone="warn">
        <p className={classes.screenHead} data-tone="warn">
          {t('tracking.states.offHead')}
        </p>
        <p className={classes.screenText}>{t('tracking.states.offBody')}</p>
        <div className={classes.screenContact}>
          <ContactLinks />
        </div>
      </div>
    );
  }

  if (status === 429) {
    return (
      <div className={classes.screen} data-tone="warn">
        <p className={classes.screenHead} data-tone="warn">
          {t('tracking.states.rateHead')}
        </p>
        <p className={classes.screenText}>{t('tracking.states.rateBody')}</p>
        <div className={classes.screenAction}>
          <button className={classes.ghost} type="button" onClick={onRetry}>
            {t('common.actions.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (status === 422) {
    return (
      <div className={classes.screen} data-tone="warn">
        <p className={classes.screenHead} data-tone="warn">
          {t('tracking.states.challengeHead')}
        </p>
        <p className={classes.screenText}>{t('tracking.states.challengeBody')}</p>
        <div className={classes.screenAction}>
          <button className={classes.ghost} type="button" onClick={onRetry}>
            {t('common.actions.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.screen} data-tone="danger">
      <p className={classes.screenHead} data-tone="danger">
        {t('tracking.states.connectionHead')}
      </p>
      <p className={classes.screenText}>{t('tracking.states.connectionBody')}</p>
      <div className={classes.screenAction}>
        <button className={classes.ghost} type="button" onClick={onRetry}>
          {t('common.actions.tryAgain')}
        </button>
      </div>
    </div>
  );
}

/** The order is real and nothing has been dispatched — the majority case. */
export function NothingShippedScreen({ data }: { data: TrackingLookup }) {
  const { t } = useText();
  const terminal = data.status === 'cancelled' || data.status === 'refunded';
  return (
    <div className={classes.nothing} data-tone={terminal ? 'danger' : undefined}>
      <div className={classes.nothingHead}>
        <p className={classes.refLabel}>{terminal ? t('tracking.states.thisOrder') : t('tracking.states.noParcels')}</p>
        <p className={classes.timelineCount}>{formatRelative(data.createdAt)}</p>
      </div>
      <p className={classes.screenText}>
        {terminal
          ? t('tracking.states.cancelledBody', { status: data.status })
          : data.isPreorder
            ? t('tracking.states.preorderBody')
            : t('tracking.states.notDispatchedBody')}
      </p>
      {/* No spec sheet here: the hero above already carries the status, the
          placed date and the item count. */}
      {terminal ? null : (
        <div className={classes.screenContact}>
          <ContactLinks />
        </div>
      )}
    </div>
  );
}

/** The courier network is unconfigured or unreachable — shipments still render. */
export function DegradedNotice() {
  const { t } = useText();
  return (
    <div className={classes.degraded}>
      <p className={classes.screenHead}>{t('tracking.states.degradedHead')}</p>
      <p className={classes.degradedText}>{t('tracking.states.degradedBody')}</p>
    </div>
  );
}

/**
 * The feature flag is on but no Turnstile site key is configured, so the widget
 * can never mount — and the backend answers this route `503` anyway. Say so, and
 * offer the way through.
 */
export function TrackingUnavailableScreen() {
  const { t } = useText();
  return (
    <>
      <EmptyState
        eyebrow={t('tracking.states.disabledEyebrow')}
        title={t('tracking.states.disabledTitle')}
        description={t('tracking.states.disabledBody')}
      />
      <div className={classes.centreContact}>
        <ContactLinks />
      </div>
    </>
  );
}
