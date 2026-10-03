import type { CodeChannel, CodeSent } from '@/types/auth.ts';

export const DEFAULT_RESEND_SECONDS = 60;

export type CodeKind = 'phone' | 'email';

/** One code that has been sent: what the code screen shows and what a resend needs. */
export interface CodeAttempt {
  attemptId: string;
  kind: CodeKind;
  channel: CodeChannel;
  maskedTo: string;
  /** Epoch ms from which "Resend code" is allowed. */
  resendAt: number;
}

/** The moment a resend becomes allowed: `after` is whole seconds from now. */
export function resendDeadline(after: number, now: number): number {
  return Number.isFinite(after) ? now + Math.max(0, after) * 1000 : now + DEFAULT_RESEND_SECONDS * 1000;
}

export function toAttempt(kind: CodeKind, sent: CodeSent, now: number = Date.now()): CodeAttempt {
  return { attemptId: sent.attemptId, kind, channel: sent.channel, maskedTo: sent.maskedTo, resendAt: resendDeadline(sent.resendAfter, now) };
}

export function otherPhoneChannel(channel: CodeChannel): 'whatsapp' | 'sms' {
  return channel === 'sms' ? 'whatsapp' : 'sms';
}

/** `1:00`, `0:09`. Rounds up so the clock never shows 0:00 while a second is still left. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
