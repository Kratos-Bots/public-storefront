import type { FormEvent } from 'react';
import { createFamily } from '@/builder/parts.ts';
import type { VerificationResult } from '@/api/verify.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

export type VerifyStatus = 'idle' | 'pending' | 'authentic' | 'expired' | 'not-verified' | 'error';
export type VerifyField = 'verificationCode' | 'authCode';

/** What the editor previews a verdict as (no network): a status and, for the genuine ones, the record. */
export interface VerifyPreview { status: VerifyStatus; result?: VerificationResult }

export interface VerifyData {
  status: VerifyStatus;
  result: VerificationResult | null;
  values: Record<VerifyField, string>;
  errors: Partial<Record<VerifyField, string>>;
  /** An edit drops a verdict already on screen. */
  onChange: (field: VerifyField, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  ids: { code: string; auth: string; codeError: string; authError: string };
}
export const VerifyFamily = createFamily<VerifyData>('verify');
