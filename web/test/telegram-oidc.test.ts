import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors.ts';
import {
  BINDING_KEY,
  classifyTelegramOidcError,
  generateBinding,
  storeBinding,
  takeBinding,
} from '@/features/auth/telegram-oidc.ts';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('generateBinding', () => {
  it('is 43 base64url characters (32 bytes), inside the backend window', () => {
    const b = generateBinding();
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateBinding()));
    expect(seen.size).toBe(50);
  });

  it('uses 32 bytes from crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateBinding();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(32);
  });

  it('never emits padding or the standard-alphabet characters, whatever the bytes', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((a: Uint8Array) => a.fill(0xfb)) as never);
    expect(generateBinding()).toBe(`${'-_v7'.repeat(10)}-_s`);
  });
});

describe('storeBinding / takeBinding', () => {
  it('keeps the binding in sessionStorage and gives it back exactly once', () => {
    expect(storeBinding('abc')).toBe(true);
    expect(sessionStorage.getItem(BINDING_KEY)).toBe('abc');
    expect(takeBinding()).toBe('abc');
    expect(sessionStorage.getItem(BINDING_KEY)).toBeNull();
    expect(takeBinding()).toBeNull();
  });

  it('reports a failed write instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(storeBinding('abc')).toBe(false);
  });

  it('reads as no binding when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(takeBinding()).toBeNull();
  });
});

describe('classifyTelegramOidcError', () => {
  it.each([
    [new ApiError(400, 'TELEGRAM_LOGIN_EXPIRED'), 'expired'],
    [new ApiError(401, 'TELEGRAM_LOGIN_FAILED'), 'failed'],
    [new ApiError(404, 'TELEGRAM_LOGIN_UNAVAILABLE'), 'unavailable'],
    [new ApiError(403, 'REGISTRATION_CLOSED'), 'closed'],
    [new ApiError(403, 'ACCOUNT_BANNED'), 'banned'],
    [new ApiError(429, 'Too many requests'), 'rateLimited'],
    [new ApiError(500, 'boom'), 'generic'],
    [new ApiError(0, 'Network error'), 'generic'],
    [new Error('plain'), 'generic'],
  ])('%#', (err, expected) => {
    expect(classifyTelegramOidcError(err)).toBe(expected);
  });
});
