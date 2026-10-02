import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/errors.ts';
import { passwordErrorMessage, RESET_KEYWORD, whatsappResetHref } from '@/features/auth/password-errors.ts';

describe('passwordErrorMessage', () => {
  it('a 401 at sign-in is the one "incorrect" sentence whatever the backend said', () => {
    expect(passwordErrorMessage(new ApiError(401, 'Invalid credentials'), 'signin')).toBe('Email/phone or password is incorrect');
    expect(passwordErrorMessage(new ApiError(401, 'anything else'), 'signin')).toBe('Email/phone or password is incorrect');
  });
  it('the CURRENT_PASSWORD_INCORRECT sentinel (a 422) is the field-level "incorrect" sentence, never the backend string', () => {
    expect(passwordErrorMessage(new ApiError(422, 'CURRENT_PASSWORD_INCORRECT'), 'set')).toBe('Your current password is incorrect');
  });
  it('any other 422 passes its own validation text through', () => {
    expect(passwordErrorMessage(new ApiError(422, 'Password must be at least 8 characters'), 'set')).toBe('Password must be at least 8 characters');
  });
  it('a 409 is the generic "can\'t be used" sentence', () => {
    const msg = 'That email or phone can’t be used to create an account. Try signing in or resetting your password.';
    expect(passwordErrorMessage(new ApiError(409, 'whatever'), 'signup')).toBe(msg);
    expect(passwordErrorMessage(new ApiError(409, 'whatever'), 'set')).toBe(msg);
  });
  it('ACCOUNT_BANNED is its own sentence in every context', () => {
    for (const c of ['signin', 'signup', 'forgot', 'reset', 'set', 'verify'] as const) {
      expect(passwordErrorMessage(new ApiError(403, 'ACCOUNT_BANNED'), c)).toBe('This account can’t sign in right now. Contact the shop for help.');
    }
  });
  it('a 404 means the shop has switched password sign-in off', () => {
    expect(passwordErrorMessage(new ApiError(404, 'Not found'), 'signin')).toBe('Password sign-in isn’t available right now.');
  });
  it('a 429 is the shared rate-limit sentence', () => {
    expect(passwordErrorMessage(new ApiError(429, 'Too many requests'), 'signin')).toBe('Too many attempts — please wait a moment and try again');
  });
  it('a transport failure keeps its own message; anything that is not an ApiError is generic', () => {
    expect(passwordErrorMessage(new ApiError(0, 'Network error'), 'forgot')).toBe('Network error');
    expect(passwordErrorMessage(new Error('boom'), 'forgot')).toBe('Something went wrong');
  });
});

describe('whatsappResetHref', () => {
  it('builds a wa.me link from the digits with the fixed keyword, percent-encoded', () => {
    expect(RESET_KEYWORD).toBe('RESET PASSWORD');
    expect(whatsappResetHref('447700900123')).toBe('https://wa.me/447700900123?text=RESET%20PASSWORD');
    expect(whatsappResetHref('+44 7700 900123')).toBe('https://wa.me/447700900123?text=RESET%20PASSWORD');
  });
  it('is null when there is no number to message', () => {
    expect(whatsappResetHref(null)).toBeNull();
    expect(whatsappResetHref('  ')).toBeNull();
  });
});
