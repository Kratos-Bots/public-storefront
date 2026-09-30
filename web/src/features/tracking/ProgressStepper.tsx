import { VisuallyHidden } from '@mantine/core';
import { STAGE_KEYS } from '@/features/tracking/status.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/tracking/Tracking.module.css';

export interface ProgressStepperProps {
  /** Furthest stage reached, or -1 when no scan has mapped to one yet. */
  stage: number;
  /** The parcel came back — the rail reads in the danger tone rather than the accent. */
  failed: boolean;
}

/**
 * The page's signature: the courier's seven stages as seven segments rather than
 * dots on a rule, so progress is countable at a glance on a 390 px screen. The
 * stages already behind the parcel are mixed down; the one it is actually in
 * carries the client's full accent, so the eye lands on "where it is now"
 * without reading a word.
 *
 * Segments and labels share one seven-column grid, so every label sits under its
 * own segment. Narrower than that there is no room for seven, so the rail states
 * the current stage and its place in the sequence instead.
 */
export function ProgressStepper({ stage, failed }: ProgressStepperProps) {
  const { t } = useText();
  const reached = Math.max(stage, -1);
  const tone = failed ? 'danger' : undefined;
  const summary =
    reached < 0
      ? t('tracking.status.awaitingCourierScan')
      : t('tracking.status.stageSummary', { stage: reached + 1, total: STAGE_KEYS.length, name: t(STAGE_KEYS[reached]!) });

  return (
    <div className={classes.stepper} data-sf-part="stepper">
      {/* The rail is a picture of the summary; screen readers get the sentence. */}
      <VisuallyHidden>{summary}</VisuallyHidden>

      <div className={classes.rail} aria-hidden>
        {STAGE_KEYS.map((key, i) => (
          <span
            key={key}
            className={classes.seg}
            data-fill={i > reached ? 'ahead' : i === reached ? 'here' : 'passed'}
            data-tone={tone}
          />
        ))}
      </div>

      <div className={classes.stageNow} aria-hidden>
        <p className={classes.stageName}>{reached < 0 ? t('tracking.parcel.awaitingScan') : t(STAGE_KEYS[reached]!)}</p>
        {reached >= 0 ? (
          <p className={classes.stageCount}>
            {reached + 1} / {STAGE_KEYS.length}
          </p>
        ) : null}
      </div>

      <div className={classes.stageLabels} aria-hidden>
        {STAGE_KEYS.map((key, i) => (
          <span
            key={key}
            className={classes.stageLabel}
            data-state={i > reached ? 'ahead' : i === reached ? 'here' : 'passed'}
          >
            {t(key)}
          </span>
        ))}
      </div>
    </div>
  );
}
