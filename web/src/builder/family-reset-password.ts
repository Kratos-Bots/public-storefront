import type { FormEvent } from 'react';
import { createFamily } from '@/builder/parts.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

/** `banned`: the reset went through (the link is spent) but the account may not sign in; `error` carries the sentence. */
export type ResetPasswordPhase = 'checking' | 'form' | 'expired' | 'unreachable' | 'banned';

export interface ResetPasswordData {
  phase: ResetPasswordPhase;
  /** `set` = the customer has no password yet ("Choose a password"); null until the check answers. */
  mode: 'reset' | 'set' | null;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  /** Re-runs the token check (phase `unreachable`). */
  onRetry: () => void;
  pending: boolean;
  /** Already-resolved text (validation or server error) for the new-password field, or null. */
  error: string | null;
}

/** What the editor previews the page as (no network). */
export interface ResetPasswordPreview { phase: ResetPasswordPhase; mode: 'reset' | 'set' | null }

export const ResetPasswordFamily = createFamily<ResetPasswordData>('reset-password');
