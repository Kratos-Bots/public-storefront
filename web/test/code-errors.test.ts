import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/errors.ts';
import { codeFailure, codeFailureKind, incorrectFailure, isLoginUnavailable } from '@/features/auth/code-errors.ts';

const err = (status: number, message: string) => new ApiError(status, message);

describe('every spec error becomes one plain sentence', () => {
  it.each([
    ['REGISTRATION_CLOSED', 403, 'registrationClosed', 'This shop isn’t taking new customers right now.'],
    ['ACCOUNT_BANNED', 403, 'banned', 'This account can’t sign in right now. Contact the shop for help.'],
    ['CODE_RATE_LIMITED', 429, 'tooMany', 'Too many tries. Please wait a few minutes'],
    ['CODE_TOO_MANY_TRIES', 400, 'triesUsed', 'That code has been tried too many times. We can send you a new one.'],
    ['CODE_EXPIRED', 400, 'expired', 'That code has expired. We can send a new one'],
    ['CODE_SERVICE_UNAVAILABLE', 503, 'unavailable', 'Sign-in by code isn’t working right now. Please try another way'],
    ['CODE_LOGIN_UNAVAILABLE', 404, 'unavailable', 'Sign-in by code isn’t working right now. Please try another way'],
    ['PHONE_INVALID', 400, 'phoneInvalid', 'Enter your phone number with its country code'],
  ])('%s', (message, status, kind, text) => {
    expect(codeFailure(err(status, message))).toEqual({ kind, message: text });
  });

  it('matches the sentinel by its message', () => {
    expect(codeFailureKind(err(400, 'CODE_EXPIRED'))).toBe('expired');
    expect(codeFailureKind(err(400, 'CODE_INCORRECT'))).toBe('other'); // a wrong code is a 200 answer now
  });

  it('an unnamed 429 (the per-IP limiter) reads as too many tries', () => {
    expect(codeFailure(err(429, 'Too many requests')).message).toBe('Too many tries. Please wait a few minutes');
  });

  it('a channel that cannot be reached names the channel and offers the other one', () => {
    expect(codeFailure(err(400, 'CODE_CHANNEL_UNAVAILABLE'), { channel: 'whatsapp' })).toEqual({
      kind: 'channelUnavailable',
      message: 'We couldn’t send a WhatsApp message to that number. Try a text message instead',
    });
    expect(codeFailure(err(400, 'CODE_CHANNEL_UNAVAILABLE'), { channel: 'sms' }).message)
      .toBe('We couldn’t send a text message to that number. Try WhatsApp instead');
  });

  it('a failed switch keeps its own sentence, and an unknown channel falls back to the generic one', () => {
    expect(codeFailure(err(400, 'CODE_CHANNEL_UNAVAILABLE'), { channel: 'sms', switching: true }).message)
      .toBe('We can’t send the code that way to this number');
    expect(codeFailure(err(400, 'CODE_CHANNEL_UNAVAILABLE')).message)
      .toBe('Sign-in by code isn’t working right now. Please try another way');
  });
});

describe('a wrong code', () => {
  it('says how many tries are left, singular and plural', () => {
    expect(incorrectFailure(4)).toEqual({ kind: 'incorrect', message: 'That code isn’t right. 4 tries left.', attemptsRemaining: 4 });
    expect(incorrectFailure(1).message).toBe('That code isn’t right. 1 try left.');
    expect(incorrectFailure(0).message).toBe('That code isn’t right. 0 tries left.');
  });
  it('drops the count when the backend sent nonsense', () => {
    expect(incorrectFailure(Number.NaN).message).toBe('That code isn’t right.');
    expect(incorrectFailure(-1).message).toBe('That code isn’t right.');
  });
});

describe('other failures', () => {
  it('shows the sentence of a plain Error (a Turnstile mint failure) and the shared one for transport errors', () => {
    expect(codeFailure(new Error('Verification failed')).message).toBe('Verification failed');
    expect(codeFailure(new ApiError(0, 'x')).kind).toBe('other');
  });
  it('isLoginUnavailable is true only for CODE_LOGIN_UNAVAILABLE', () => {
    expect(isLoginUnavailable(err(404, 'CODE_LOGIN_UNAVAILABLE'))).toBe(true);
    expect(isLoginUnavailable(err(503, 'CODE_SERVICE_UNAVAILABLE'))).toBe(false);
    expect(isLoginUnavailable(new Error('x'))).toBe(false);
  });
});
