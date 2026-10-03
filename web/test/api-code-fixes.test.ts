import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/stores/session.ts';
import { codeEmail, codePhone, codeResend } from '@/api/auth.ts';

// ky/undici consume the request body, so it is read inside the fetch mock.
const bodies = new WeakMap<Request, string>();
const SENT = { next: 'code', attemptId: 'att-1', channel: 'sms', maskedTo: '+44 •••• 0123', resendAfter: 60 };

function reply() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const req = input as Request;
    bodies.set(req, await req.clone().text());
    return new Response(JSON.stringify({ success: true, data: SENT, error: null }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}
const posted = (spy: ReturnType<typeof reply>) => JSON.parse(bodies.get(spy.mock.calls[0]![0] as Request) ?? 'null') as Record<string, unknown>;

beforeEach(() => useSessionStore.getState().clear());
afterEach(() => vi.restoreAllMocks());

describe('sign-in by code: the picked country', () => {
  it('phone sends phoneCountry when there is one', async () => {
    const spy = reply();
    await codePhone('+447700900123', 'sms', undefined, { language: 'en', phoneCountry: 'GB' });
    expect(posted(spy)).toEqual({ phone: '+447700900123', channel: 'sms', language: 'en', phoneCountry: 'GB' });
  });

  it('phone leaves phoneCountry out when there is none', async () => {
    const spy = reply();
    await codePhone('+447700900123', 'sms', undefined, { language: 'en' });
    expect(posted(spy)).toEqual({ phone: '+447700900123', channel: 'sms', language: 'en' });
  });
});

describe('sign-in by code: language is sent only when the backend would accept it', () => {
  it.each([['en'], ['fr-CA'], ['zh-Hant-TW'], ['eng'], ['pt-BR-x1abcd']])('%s is sent', async (language) => {
    const spy = reply();
    await codeEmail('ada@example.com', undefined, { language });
    expect(posted(spy).language).toBe(language);
  });

  it.each([['e'], ['english'], ['en_GB'], ['en-'], ['en-x'], ['en-GB-a-b-c-d'], ['en GB'], ['']])('"%s" is left out', async (language) => {
    const spy = reply();
    await codeEmail('ada@example.com', undefined, { language });
    expect(posted(spy)).toEqual({ email: 'ada@example.com' });
  });

  it('the same rule covers a resend', async () => {
    const spy = reply();
    await codeResend('att-1', { language: 'not a tag' });
    expect(posted(spy)).toEqual({ attemptId: 'att-1' });
  });
});
