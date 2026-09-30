import type { ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import { FADE } from '@/lib/motion.ts';
import classes from '@/components/EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Short mono label above the title — use it for a state, not a category. */
  eyebrow?: string;
  action?: ReactNode;
  /** A page-builder part's style attributes (stage 2), spread on the root; undefined adds nothing. */
  rootAttrs?: StyleAttrs;
}

/** Centred "there is nothing here yet" panel. An empty screen is an invitation to act, so pass an `action` whenever there is one. */
export function EmptyState({ title, description, eyebrow, action, rootAttrs }: EmptyStateProps) {
  return (
    <div className={`${classes.root} ${FADE}`} {...rootAttrs}>
      <span className={classes.rule} aria-hidden />
      {eyebrow ? <span className={classes.eyebrow}>{eyebrow}</span> : null}
      <h2 className={classes.title}>{title}</h2>
      {description ? <p className={classes.description}>{description}</p> : null}
      {action ? <div className={classes.action}>{action}</div> : null}
    </div>
  );
}
