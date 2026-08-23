import type { ReactNode } from 'react';
import type { Tone } from '@/features/order-status/status.ts';
import classes from '@/features/account/Account.module.css';

const TONE_CLASS: Record<Tone, string | null> = {
  default: null,
  success: classes.toneSuccess,
  danger: classes.toneDanger,
  muted: classes.toneMuted,
};

/** A bordered status chip in the tone the shared status map assigns. */
export function StatusPill({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  const accent = TONE_CLASS[tone];
  return <span className={accent ? `${classes.pill} ${accent}` : classes.pill}>{children}</span>;
}
