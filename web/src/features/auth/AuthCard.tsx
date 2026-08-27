import type { ReactNode } from 'react';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/auth/AuthCard.module.css';

export interface AuthCardProps {
  /** The channel this card signs you in through, e.g. "WhatsApp". */
  name: string;
  icon?: ReactNode;
  /** A card that describes something rather than offering it — no action inside. */
  dim?: boolean;
  children: ReactNode;
}

/**
 * One way in. The head is the chassis' rule-and-micro-caps device: the channel's
 * mark and name, then a hairline running out to the edge, so two cards read as
 * two entries in the same index rather than two competing panels.
 */
export function AuthCard({ name, icon, dim, children }: AuthCardProps) {
  return (
    <section className={dim ? `${classes.card} ${classes.dim} ${FADE}` : `${classes.card} ${FADE}`}>
      <header className={classes.channel}>
        {icon ? <span className={classes.mark}>{icon}</span> : null}
        <h2 className={classes.name}>{name}</h2>
        <span className={classes.rule} aria-hidden />
      </header>
      <div className={classes.body}>{children}</div>
    </section>
  );
}

export type NoteTone = 'muted' | 'warn' | 'danger';

/**
 * The cart's note shape, reused: a rule in the tone with tracked micro-caps
 * beside it. Every "something is off" message in the app has this silhouette,
 * so a scan finds them all without reading them.
 */
export function AuthNote({ tone = 'muted', children }: { tone?: NoteTone; children: ReactNode }) {
  return (
    <p className={classes.note} data-tone={tone}>
      {children}
    </p>
  );
}
