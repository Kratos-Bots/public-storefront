import { Link } from 'react-router';
import { TrackingFamily, type TrackingData } from '@/builder/family-tracking.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { LookupForm } from '@/features/tracking/LookupForm.tsx';
import { OrderHero } from '@/features/tracking/OrderHero.tsx';
import { ParcelCard } from '@/features/tracking/ParcelCard.tsx';
import { ProgressStepper } from '@/features/tracking/ProgressStepper.tsx';
import { RefreshButton } from '@/features/tracking/RefreshButton.tsx';
import {
  DegradedNotice,
  ErrorScreen,
  NotFoundScreen,
  NothingShippedScreen,
  PendingSkeleton,
  VerifyBlockedScreen,
  VerifyingNote,
} from '@/features/tracking/StateScreens.tsx';
import { allTerminal, furthestStage } from '@/features/tracking/status.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/tracking/Tracking.module.css';

// Each view is the v0.7.0 JSX of one piece of the page. The result views (hero, progress, refresh,
// notice, parcels) return null until an answer exists, so one placed outside `result` is harmless.

function IntroView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { compact } = TrackingFamily.useData();
  return compact ? (
    <div className={classes.strip} {...styleAttrs}>
      <p className={classes.stripLabel}>{t('tracking.lookup.strip')}</p>
      <Link className={classes.stripLink} to="/tracking">
        {t('tracking.lookup.another')}
      </Link>
    </div>
  ) : (
    <div className={classes.masthead} {...styleAttrs}>
      <p className={classes.eyebrow}>{t('tracking.lookup.eyebrow')}</p>
      <h1 className={classes.title}>{t('tracking.lookup.title')}</h1>
      <p className={classes.lead}>{t('tracking.lookup.lead')}</p>
    </div>
  );
}

function StateView() {
  const { phase, awaitingToken, errorStatus, retry, reload } = TrackingFamily.useData();
  switch (phase) {
    case 'pending':
      return (
        <>
          {awaitingToken ? <VerifyingNote /> : null}
          <PendingSkeleton />
        </>
      );
    case 'error':
      return <ErrorScreen status={errorStatus ?? 0} onRetry={retry} />;
    // No token means no lookup is possible, and a reset can't help a widget that never mounted —
    // a reload is the only honest action.
    case 'blocked':
      return <VerifyBlockedScreen onReload={reload} />;
    case 'notFound':
      return <NotFoundScreen />;
    default:
      return null;
  }
}

function FormView({ styleAttrs }: PartViewProps) {
  const { phase } = TrackingFamily.useData();
  if (phase === 'idle') return <LookupForm rootAttrs={styleAttrs} />;
  // The number was wrong, so the next thing the visitor needs is a way to type a different one.
  if (phase === 'notFound') {
    return (
      <div className={classes.retry} {...styleAttrs}>
        <LookupForm />
      </div>
    );
  }
  return null;
}

function HeroView({ styleAttrs }: PartViewProps) {
  const { phase, data } = TrackingFamily.useData();
  return phase === 'found' && data ? <OrderHero data={data} rootAttrs={styleAttrs} /> : null;
}

/**
 * A single-parcel order gets its rail under the hero, where the headline already speaks for that
 * parcel. Keyed on parcel COUNT, not resolved-tracking count, so it can never overlap the per-card
 * rail a multi-parcel order draws — the two gates partition on the same quantity by construction.
 */
function ProgressView({ styleAttrs }: PartViewProps) {
  const { phase, data } = TrackingFamily.useData();
  if (phase !== 'found' || !data || data.parcels.length !== 1) return null;
  const tracking = data.parcels[0]!.tracking;
  if (tracking?.outcome !== 'ok') return null;
  return <ProgressStepper stage={furthestStage(tracking.events)} failed={tracking.status === 'RETURNED'} rootAttrs={styleAttrs} />;
}

/**
 * Hidden once everything is delivered or returned (nothing left to poll for), hidden in degraded
 * mode (no live tracking to refresh), and hidden when nothing has shipped — trackingAvailable is
 * true there, but a freshness line above "No parcels yet" is noise.
 */
function RefreshView({ styleAttrs }: PartViewProps) {
  const { phase, data, isRefreshing, refresh } = TrackingFamily.useData();
  if (phase !== 'found' || !data) return null;
  return data.trackingAvailable && data.parcels.length > 0 && !allTerminal(data.parcels) ? (
    <RefreshButton checkedAt={data.checkedAt} busy={isRefreshing} onRefresh={refresh} rootAttrs={styleAttrs} />
  ) : null;
}

function NoticeView({ styleAttrs }: PartViewProps) {
  const { phase, data } = TrackingFamily.useData();
  if (phase !== 'found' || !data) return null;
  return !data.trackingAvailable && data.parcels.length > 0 ? <DegradedNotice rootAttrs={styleAttrs} /> : null;
}

function ParcelsView() {
  const { phase, data, refresh } = TrackingFamily.useData();
  if (phase !== 'found' || !data) return null;
  if (data.parcels.length === 0) return <NothingShippedScreen data={data} />;
  return (
    <>
      {data.parcels.map((p, i) => (
        <ParcelCard key={p.trackingNumber ?? `parcel-${i}`} parcel={p} index={i} count={data.parcels.length} onRetry={refresh} />
      ))}
    </>
  );
}

export const TRACKING_VIEWS: FamilyValue<TrackingData>['views'] = {
  TrackingIntro: IntroView, TrackingState: StateView, TrackingForm: FormView, TrackingHero: HeroView,
  TrackingProgress: ProgressView, TrackingRefresh: RefreshView, TrackingNotice: NoticeView, TrackingParcels: ParcelsView,
};
