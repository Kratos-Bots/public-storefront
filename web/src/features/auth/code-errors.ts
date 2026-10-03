import { ApiError, errorMessage } from '@/lib/errors.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import type { CodeChannel } from '@/types/auth.ts';

export type CodeFailureKind =
  | 'registrationClosed' | 'banned' | 'tooMany' | 'triesUsed' | 'channelUnavailable' | 'expired' | 'incorrect' | 'unavailable' | 'phoneInvalid' | 'other';

export interface CodeFailure { kind: CodeFailureKind; message: string; attemptsRemaining?: number }

export interface CodeFailureContext {
  /** The channel the failed call asked for, so the sentence can name it. */
  channel?: CodeChannel;
  /** The failed call was "send it another way" on a code that is still waiting. */
  switching?: boolean;
}

/** The backend's sentinels travel as the error message (their statuses are fixed by the spec). A wrong code is not one: it is a 200 answer. */
const SENTINEL: Record<string, CodeFailureKind> = {
  CODE_LOGIN_UNAVAILABLE: 'unavailable',
  CODE_SERVICE_UNAVAILABLE: 'unavailable',
  CODE_CHANNEL_UNAVAILABLE: 'channelUnavailable',
  CODE_EXPIRED: 'expired',
  // The backend deletes the attempt on this one: the code is dead, unlike a rate limit, which is only "wait".
  CODE_TOO_MANY_TRIES: 'triesUsed',
  CODE_RATE_LIMITED: 'tooMany',
  PHONE_INVALID: 'phoneInvalid',
  REGISTRATION_CLOSED: 'registrationClosed',
  ACCOUNT_BANNED: 'banned',
};

export function codeFailureKind(err: unknown): CodeFailureKind {
  if (!(err instanceof ApiError)) return 'other';
  const named = SENTINEL[err.message];
  if (named) return named;
  return err.status === 429 ? 'tooMany' : 'other';
}

/** `404 CODE_LOGIN_UNAVAILABLE`: the shop switched the mode off under this visitor, so the cached settings are stale. */
export function isLoginUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.message === 'CODE_LOGIN_UNAVAILABLE';
}

/** A wrong code (a 200 answer): how many tries are left. Reads the text snapshot: call from handlers only. */
export function incorrectFailure(attemptsRemaining: number): CodeFailure {
  const { t, tp } = textSnapshot();
  return Number.isInteger(attemptsRemaining) && attemptsRemaining >= 0
    ? { kind: 'incorrect', message: tp('auth.code.error.incorrect', attemptsRemaining), attemptsRemaining }
    : { kind: 'incorrect', message: t('auth.code.error.incorrectNoCount') };
}

/**
 * The shopper-facing sentence for a failed code call. Reads the text snapshot: call from handlers only.
 * A plain `Error` (never an `ApiError`) is a Turnstile mint failure whose message is already a sentence.
 */
export function codeFailure(err: unknown, ctx: CodeFailureContext = {}): CodeFailure {
  const { t } = textSnapshot();
  const kind = codeFailureKind(err);
  switch (kind) {
    case 'registrationClosed': return { kind, message: t('errors.registrationClosed') };
    case 'banned': return { kind, message: t('auth.password.banned') };
    case 'tooMany': return { kind, message: t('auth.code.error.tooMany') };
    case 'triesUsed': return { kind, message: t('auth.code.error.triesUsed') };
    case 'phoneInvalid': return { kind, message: t('auth.password.phoneInvalid') };
    case 'expired': return { kind, message: t('auth.code.error.expired') };
    case 'unavailable': return { kind, message: t('auth.code.error.unavailable') };
    case 'channelUnavailable': {
      if (ctx.switching) return { kind, message: t('auth.code.error.cannotSwitch') };
      if (ctx.channel === 'sms') return { kind, message: t('auth.code.error.channelSms') };
      if (ctx.channel === 'whatsapp') return { kind, message: t('auth.code.error.channelWhatsapp') };
      return { kind, message: t('auth.code.error.unavailable') };
    }
    default:
      return { kind, message: err instanceof Error && !(err instanceof ApiError) ? err.message : errorMessage(err) };
  }
}
