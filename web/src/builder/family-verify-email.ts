import { createFamily } from '@/builder/parts.ts';

export type VerifyEmailPhase = 'verifying' | 'done' | 'invalid' | 'otherAccount' | 'error';

export interface VerifyEmailData {
  phase: VerifyEmailPhase;
  /** The failure behind phase `error`; a view turns it into text. Null otherwise. */
  error: unknown;
  onRetry: () => void;
}

/** What the editor previews the page as (no network). */
export interface VerifyEmailPreview { phase: VerifyEmailPhase }

export const VerifyEmailFamily = createFamily<VerifyEmailData>('verify-email');
