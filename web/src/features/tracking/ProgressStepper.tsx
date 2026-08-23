import { VisuallyHidden } from '@mantine/core';
import { STAGES } from '@/features/tracking/status.ts';
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
  const reached = Math.max(stage, -1);
  const tone = failed ? 'danger' : undefined;
  const summary =
    reached < 0
      ? 'Awaiting first courier scan'
      : `Stage ${reached + 1} of ${STAGES.length}: ${STAGES[reached]}`;

  return (
    <div className={classes.stepper}>
      {/* The rail is a picture of the summary; screen readers get the sentence. */}
      <VisuallyHidden>{summary}</VisuallyHidden>

      <div className={classes.rail} aria-hidden>
        {STAGES.map((label, i) => (
          <span
            key={label}
            className={classes.seg}
            data-fill={i > reached ? 'ahead' : i === reached ? 'here' : 'passed'}
            data-tone={tone}
          />
        ))}
      </div>

      <div className={classes.stageNow} aria-hidden>
        <p className={classes.stageName}>{reached < 0 ? 'Awaiting first scan' : STAGES[reached]}</p>
        {reached >= 0 ? (
          <p className={classes.stageCount}>
            {reached + 1} / {STAGES.length}
          </p>
        ) : null}
      </div>

      <div className={classes.stageLabels} aria-hidden>
        {STAGES.map((label, i) => (
          <span
            key={label}
            className={classes.stageLabel}
            data-state={i > reached ? 'ahead' : i === reached ? 'here' : 'passed'}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
