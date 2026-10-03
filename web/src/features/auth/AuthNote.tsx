import type { ReactNode } from 'react';
import classes from '@/features/auth/AuthNote.module.css';

export type NoteTone = 'muted' | 'warn' | 'danger';

/**
 * A short message in plain sentence case, set off by a rule in its tone. Every
 * "something is off" line on the sign-in screen has this silhouette, so a scan
 * finds them without reading them.
 */
export function AuthNote({ tone = 'muted', children }: { tone?: NoteTone; children: ReactNode }) {
  return (
    <p className={classes.note} data-tone={tone}>
      {children}
    </p>
  );
}
