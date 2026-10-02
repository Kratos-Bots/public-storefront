import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { textSnapshot } from '@/text/snapshot.ts';

describe('shop access error codes', () => {
  it.each([
    [401, 'LOGIN_REQUIRED', 'isLoginRequired'],
    [403, 'ACCESS_DENIED', 'isAccessDenied'],
    [403, 'REGISTRATION_CLOSED', 'isRegistrationClosed'],
  ] as const)('%s %s sets %s and nothing else', (status, message, getter) => {
    const err = new ApiError(status, message);
    for (const g of ['isLoginRequired', 'isAccessDenied', 'isRegistrationClosed', 'isBanned'] as const) {
      expect(err[g], g).toBe(g === getter);
    }
  });

  it('requires the matching status', () => {
    expect(new ApiError(403, 'LOGIN_REQUIRED').isLoginRequired).toBe(false);
    expect(new ApiError(401, 'ACCESS_DENIED').isAccessDenied).toBe(false);
    expect(new ApiError(400, 'REGISTRATION_CLOSED').isRegistrationClosed).toBe(false);
  });

  it('never shows a raw code', () => {
    const { t } = textSnapshot();
    expect(errorMessage(new ApiError(401, 'LOGIN_REQUIRED'))).toBe(t('errors.loginRequired'));
    expect(errorMessage(new ApiError(403, 'ACCESS_DENIED'))).toBe(t('errors.accessDenied'));
    expect(errorMessage(new ApiError(403, 'REGISTRATION_CLOSED'))).toBe(t('errors.registrationClosed'));
  });
});
