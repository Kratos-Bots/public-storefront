import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import { codeEmail, codeEmailSend, codePhone, codeResend, codeVerify } from '@/api/auth.ts';

// ky/undici consume the request body, so it is read inside the fetch mock.
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
  return { path: new URL(req.url).pathname, method: req.method, json: JSON.parse(bodies.get(req) ?? 'null') as Record<string, unknown> };
}

const SENT = { next: 'code', attemptId: 'att-1', channel: 'email', maskedTo: 'a***@example.com', resendAfter: 60 };

beforeEach(() => useSessionStore.getState().clear());
afterEach(() => vi.restoreAllMocks());

describe('sign-in by code: request shapes', () => {
  it('email posts the address, and the Turnstile token only when there is one', async () => {
    let spy = reply(200, { next: 'password' });
    await expect(codeEmail('ada@example.com', 'ts-1')).resolves.toEqual({ next: 'password' });
    expect(await sent(spy)).toEqual({ path: '/api/storefront/auth/code/email', method: 'POST', json: { email: 'ada@example.com', turnstileToken: 'ts-1' } });
    vi.restoreAllMocks();
    spy = reply(200, SENT);
    await codeEmail('ada@example.com');
    expect((await sent(spy)).json).toEqual({ email: 'ada@example.com' });
  });

  it('email/send always asks for a code', async () => {
    const spy = reply(200, SENT);
    await expect(codeEmailSend('ada@example.com', 'ts-2')).resolves.toEqual(SENT);
    expect(await sent(spy)).toEqual({ path: '/api/storefront/auth/code/email/send', method: 'POST', json: { email: 'ada@example.com', turnstileToken: 'ts-2' } });
  });

  it('phone posts the E.164 number and the chosen channel', async () => {
    const spy = reply(200, { ...SENT, channel: 'sms' });
    await codePhone('+447700900123', 'sms', 'ts-3');
    expect(await sent(spy)).toEqual({ path: '/api/storefront/auth/code/phone', method: 'POST', json: { phone: '+447700900123', channel: 'sms', turnstileToken: 'ts-3' } });
  });

  it('resend posts the attempt, a channel only when switching', async () => {
    let spy = reply(200, SENT);
    await codeResend('att-1', { turnstileToken: 'ts-4' });
    expect((await sent(spy)).json).toEqual({ attemptId: 'att-1', turnstileToken: 'ts-4' });
    vi.restoreAllMocks();
    spy = reply(200, SENT);
    await codeResend('att-1', { channel: 'sms', turnstileToken: 'ts-5' });
    expect(await sent(spy)).toEqual({ path: '/api/storefront/auth/code/resend', method: 'POST', json: { attemptId: 'att-1', channel: 'sms', turnstileToken: 'ts-5' } });
  });

  it('verify posts the attempt and the code, never a Turnstile token', async () => {
    const result = { status: 'signed_in', token: 'tok', customer: { id: 7, nickname: 'Ada' }, isNew: true };
    const spy = reply(200, result);
    await expect(codeVerify('att-1', '123456')).resolves.toEqual(result);
    expect(await sent(spy)).toEqual({ path: '/api/storefront/auth/code/verify', method: 'POST', json: { attemptId: 'att-1', code: '123456' } });
  });

  it('a wrong code is a normal answer carrying the tries left, not an error', async () => {
    reply(200, { status: 'incorrect', attemptsRemaining: 3 });
    await expect(codeVerify('att-1', '000000')).resolves.toEqual({ status: 'incorrect', attemptsRemaining: 3 });
  });

  it('an expired code is an ApiError whose message is the sentinel', async () => {
    reply(400, null, 'CODE_EXPIRED');
    const err = await codeVerify('att-1', '123456').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: 'CODE_EXPIRED' });
  });
});

describe('sign-in by code: the site-text language rides along on every send', () => {
  const lang = { language: 'fr-CA' };

  it.each([
    ['email', () => codeEmail('ada@example.com', undefined, lang), '/api/storefront/auth/code/email', { email: 'ada@example.com' }],
    ['email/send', () => codeEmailSend('ada@example.com', undefined, lang), '/api/storefront/auth/code/email/send', { email: 'ada@example.com' }],
    ['phone', () => codePhone('+447700900123', 'whatsapp', undefined, lang), '/api/storefront/auth/code/phone', { phone: '+447700900123', channel: 'whatsapp' }],
    ['resend', () => codeResend('att-1', lang), '/api/storefront/auth/code/resend', { attemptId: 'att-1' }],
  ])('%s sends language when given', async (_name, call, path, base) => {
    const spy = reply(200, SENT);
    await call();
    expect(await sent(spy)).toEqual({ path, method: 'POST', json: { ...base, language: 'fr-CA' } });
  });

  it.each([
    ['email', () => codeEmail('ada@example.com'), { email: 'ada@example.com' }],
    ['email/send', () => codeEmailSend('ada@example.com'), { email: 'ada@example.com' }],
    ['phone', () => codePhone('+447700900123', 'sms'), { phone: '+447700900123', channel: 'sms' }],
    ['resend', () => codeResend('att-1'), { attemptId: 'att-1' }],
  ])('%s leaves language out when not given', async (_name, call, base) => {
    const spy = reply(200, SENT);
    await call();
    expect((await sent(spy)).json).toEqual(base);
  });

  it('an empty language is left out, and it combines with the Turnstile token and a switch', async () => {
    let spy = reply(200, SENT);
    await codeEmailSend('ada@example.com', 'ts-1', { language: '' });
    expect((await sent(spy)).json).toEqual({ email: 'ada@example.com', turnstileToken: 'ts-1' });
    vi.restoreAllMocks();
    spy = reply(200, SENT);
    await codeResend('att-1', { channel: 'sms', turnstileToken: 'ts-2', language: 'en' });
    expect((await sent(spy)).json).toEqual({ attemptId: 'att-1', channel: 'sms', turnstileToken: 'ts-2', language: 'en' });
  });
});
