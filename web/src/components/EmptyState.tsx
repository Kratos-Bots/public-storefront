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
  /** The heading level of the title; a screen that stands in for a whole page makes it the page's h1. */
  as?: 'h1' | 'h2';
}

/** Centred "there is nothing here yet" panel. An empty screen is an invitation to act, so pass an `action` whenever there is one. */
export function EmptyState({ title, description, eyebrow, action, rootAttrs, as: Heading = 'h2' }: EmptyStateProps) {
  return (
    <div className={`${classes.root} ${FADE}`} {...rootAttrs}>
      <span className={classes.rule} aria-hidden />
      {eyebrow ? <span className={classes.eyebrow}>{eyebrow}</span> : null}
      <Heading className={classes.title}>{title}</Heading>
      {description ? <p className={classes.description}>{description}</p> : null}
      {action ? <div className={classes.action}>{action}</div> : null}
    </div>
  );
}
