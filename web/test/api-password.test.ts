import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import {
  checkResetToken, passwordForgot, passwordLogin, passwordReset, passwordSignup,
  requestEmailVerification, setAccountPassword, verifyEmail,
} from '@/api/auth.ts';

// ky/undici consume the request body, so it is read inside the fetch mock (keyed by request) rather than afterwards.
const bodies = new WeakMap<Request, string>();

function reply(status: number, payload: unknown, error = 'x') {
  const body = status < 400
    ? { success: true, data: payload, error: null }
    : { success: false, data: null, error };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const req = input as Request;
    bodies.set(req, await req.clone().text());
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}

async function sent(spy: ReturnType<typeof reply>) {
  const req = spy.mock.calls[0]![0] as Request;
  return {
    path: new URL(req.url).pathname,
    method: req.method,
    json: JSON.parse(bodies.get(req) ?? 'null') as Record<string, unknown>,
    auth: req.headers.get('authorization'),
  };
}

const LOGIN = { token: 'tok', customer: { id: 7, nickname: 'Ada' } };

beforeEach(() => useSessionStore.getState().clear());
afterEach(() => vi.restoreAllMocks());

describe('request shapes', () => {
  it('signup posts the identifier, the password and a Turnstile token', async () => {
    const spy = reply(201, LOGIN);
    await expect(passwordSignup({ email: 'ada@example.com' }, 'hunter2hunter2', 'ts-1')).resolves.toEqual(LOGIN);
    expect(await sent(spy)).toMatchObject({
      path: '/api/storefront/auth/password/signup', method: 'POST',
      json: { email: 'ada@example.com', password: 'hunter2hunter2', turnstileToken: 'ts-1' },
    });
  });

  it('signup leaves the token out when there is none', async () => {
    const spy = reply(201, LOGIN);
    await passwordSignup({ email: 'a@b.co' }, 'pw-pw-pw-pw');
    expect((await sent(spy)).json).toEqual({ email: 'a@b.co', password: 'pw-pw-pw-pw' });
  });

  it('login posts a phone with its country hint, exactly as given', async () => {
    const spy = reply(200, LOGIN);
    await passwordLogin({ phone: '+447700900123', phoneCountry: 'GB' }, '  spaced  ');
    expect(await sent(spy)).toMatchObject({
      path: '/api/storefront/auth/password/login', method: 'POST',
      json: { phone: '+447700900123', phoneCountry: 'GB', password: '  spaced  ' },
    });
  });

  it('forgot posts the email and the optional token', async () => {
    const spy = reply(200, { ok: true });
    await passwordForgot('a@b.co', 'ts-2');
    expect(await sent(spy)).toMatchObject({ path: '/api/storefront/auth/password/forgot', json: { email: 'a@b.co', turnstileToken: 'ts-2' } });
    spy.mockClear();
    await passwordForgot('a@b.co');
    expect((await sent(spy)).json).toEqual({ email: 'a@b.co' });
  });

  it('reset/check posts the token and returns the verdict', async () => {
    const spy = reply(200, { valid: true, mode: 'set' });
    await expect(checkResetToken('abc')).resolves.toEqual({ valid: true, mode: 'set' });
    expect(await sent(spy)).toMatchObject({ path: '/api/storefront/auth/password/reset/check', method: 'POST', json: { token: 'abc' } });
  });

  it('reset posts the token and the new password and returns a session', async () => {
    const spy = reply(200, LOGIN);
    await expect(passwordReset('abc', 'new password!')).resolves.toEqual(LOGIN);
    expect(await sent(spy)).toMatchObject({ path: '/api/storefront/auth/password/reset', json: { token: 'abc', password: 'new password!' } });
  });

  it('PUT account/password carries the input verbatim and the bearer token', async () => {
    useSessionStore.getState().setSession('tok123', { id: 1, nickname: null });
    const spy = reply(200, { ok: true });
    await setAccountPassword({ newPassword: 'n', currentPassword: 'c' });
    expect(await sent(spy)).toMatchObject({
      path: '/api/storefront/account/password', method: 'PUT', auth: 'Bearer tok123',
      json: { newPassword: 'n', currentPassword: 'c' },
    });
  });

  it('email verification request and verify', async () => {
    const spy = reply(200, { ok: true });
    await requestEmailVerification();
    expect(await sent(spy)).toMatchObject({ path: '/api/storefront/auth/email/verification', method: 'POST', json: {} });
    spy.mockClear();
    await verifyEmail('tok');
    expect(await sent(spy)).toMatchObject({ path: '/api/storefront/auth/email/verify', method: 'POST', json: { token: 'tok' } });
  });
});

describe('session handling', () => {
  it('a wrong CURRENT password (422 CURRENT_PASSWORD_INCORRECT) does NOT clear the session store', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: 'Ada' });
    reply(422, null, 'CURRENT_PASSWORD_INCORRECT');
    const err = (await setAccountPassword({ newPassword: 'new password', currentPassword: 'wrong' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.isCurrentPasswordIncorrect).toBe(true);
    expect(useSessionStore.getState().token).toBe('tok');
    expect(useSessionStore.getState().customer).toEqual({ id: 1, nickname: 'Ada' });
  });

  it('a 429 on the same route keeps the session too', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    reply(429, null, 'Too many requests');
    await expect(setAccountPassword({ newPassword: 'n', currentPassword: 'c' })).rejects.toMatchObject({ status: 429 });
    expect(useSessionStore.getState().token).toBe('tok');
  });

  it('a genuine dead-session 401 on the same route still clears it (the default)', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    reply(401, null, 'Unauthorized');
    await expect(setAccountPassword({ newPassword: 'n', currentPassword: 'c' })).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('a 401 on email verification clears the session (the default)', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    reply(401, null, 'Unauthorized');
    await expect(verifyEmail('t')).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('a wrong password at sign-in is a thrown ApiError (401), nothing more special', async () => {
    reply(401, null, 'Invalid credentials');
    const err = (await passwordLogin({ email: 'a@b.co' }, 'x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
  });
});

describe('sentinels and statuses', () => {
  it.each([
    [400, 'RESET_LINK_INVALID', 'isResetLinkInvalid'],
    [400, 'VERIFY_LINK_INVALID', 'isVerifyLinkInvalid'],
    [403, 'ACCOUNT_BANNED', 'isBanned'],
    [422, 'CURRENT_PASSWORD_INCORRECT', 'isCurrentPasswordIncorrect'],
  ] as const)('%i %s sets %s', async (status, message, getter) => {
    reply(status, null, message);
    const err = (await checkResetToken('t').catch((e: unknown) => e)) as ApiError;
    expect(err[getter]).toBe(true);
  });

  it('the same message on another status is not the sentinel', async () => {
    reply(401, null, 'CURRENT_PASSWORD_INCORRECT');
    const err = (await checkResetToken('t').catch((e: unknown) => e)) as ApiError;
    expect(err.isCurrentPasswordIncorrect).toBe(false);
  });

  it('a 429 is an ApiError with that status and no sentinel set', async () => {
    reply(429, null, 'Too many requests');
    const err = (await passwordLogin({ email: 'a@b.co' }, 'x').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(429);
    expect(err.isBanned || err.isResetLinkInvalid || err.isVerifyLinkInvalid || err.isCurrentPasswordIncorrect).toBe(false);
  });
});
