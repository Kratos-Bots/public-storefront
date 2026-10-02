import { describe, expect, it } from 'vitest';
import '@/builder/render.tsx';
import { BLOCKS } from '@/builder/registry.ts';
import { TEXT, matchesTextPattern } from '@/text/registry.ts';

const claims = (block: string, key: string) => (BLOCKS[block]!.text ?? []).some((p) => matchesTextPattern(key, p));

/** Every key under a prefix, so a newly added `checkout.phone.*` key is covered without editing this test. */
const under = (prefix: string) => Object.keys(TEXT).filter((k) => k.startsWith(prefix));

describe('the Sign-in page claims every sentence its card can show', () => {
  // buildIdentifier (required / emailInvalid / phoneInvalid), checkCurrentPassword + checkNewPassword (required, tooShort, tooLong),
  // usePasswordLogin's Turnstile failure (verifyFailed), passwordErrorMessage (banned, invalid, taken, unavailable, rate limit), the phone field.
  const KEYS = [
    'checkout.errors.required', 'checkout.errors.emailInvalid', 'checkout.errors.verifyFailed',
    'auth.password.phoneInvalid', 'auth.password.tooShort', 'auth.password.tooLong', 'auth.password.banned', 'auth.password.invalid',
    'auth.password.taken', 'auth.password.unavailable', 'auth.password.rule', 'errors.rateLimited',
    ...under('checkout.phone.'),
  ];

  it('finds the phone field keys it is meant to cover', () => {
    expect(under('checkout.phone.').length).toBeGreaterThan(0);
  });

  it.each(KEYS)('LoginMethods matches %s', (key) => {
    expect(TEXT[key as keyof typeof TEXT], `${key} is a registry key`).toBeTruthy();
    expect(claims('LoginMethods', key), key).toBe(true);
  });
});

describe('the reset and verify blocks claim every sentence they can show', () => {
  it('ResetPasswordForm: the length and banned messages, the rate limit and the panel texts', () => {
    for (const key of ['auth.password.tooShort', 'auth.password.tooLong', 'auth.password.banned', 'errors.rateLimited', 'auth.reset.form.submit', 'auth.reset.expired.body']) {
      expect(claims('ResetPasswordForm', key), key).toBe(true);
    }
  });

  it('VerifyEmailStatus: its panel texts, the banned and rate-limit sentences', () => {
    for (const key of ['auth.verifyEmail.status.doneTitle', 'auth.password.banned', 'errors.rateLimited', 'common.actions.tryAgain']) {
      expect(claims('VerifyEmailStatus', key), key).toBe(true);
    }
  });
});
