import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { createTextApi, DEFAULT_TEXT_API, DEFAULT_TEXT_LAYERS, setTextSnapshot } from '@/text/snapshot.ts';
import { ApiError } from '@/lib/errors.ts';
import type { GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { codeSettings, type CodeSettingsOpts } from './helpers/code-settings.ts';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  onLogin: vi.fn(),
  codeEmail: vi.fn(), codeEmailSend: vi.fn(), codePhone: vi.fn(), codeResend: vi.fn(), codeVerify: vi.fn(),
  passwordLogin: vi.fn(), passwordForgot: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({ useLoginSuccess: () => h.onLogin }));
vi.mock('@/api/auth.ts', () => ({
  codeEmail: h.codeEmail, codeEmailSend: h.codeEmailSend, codePhone: h.codePhone, codeResend: h.codeResend, codeVerify: h.codeVerify,
  passwordLogin: h.passwordLogin, passwordForgot: h.passwordForgot,
}));
vi.mock('@/lib/query-client.ts', () => ({ SETTINGS_KEY: ['settings'], queryClient: { invalidateQueries: h.invalidate } }));

import { useCodeLogin } from '@/features/auth/useCodeLogin.ts';

const NOW = Date.parse('2026-10-03T10:00:00Z');
const SENT = (o: Record<string, unknown> = {}) => ({ next: 'code', attemptId: 'att-1', channel: 'whatsapp', maskedTo: '+44 •••• 0123', resendAfter: 60, ...o });
const LOGIN = { token: 'tok', customer: { id: 1, nickname: 'Ada' } };
const mint = vi.fn();
const ref = { current: { mint } } as RefObject<GuestTurnstileHandle | null>;
const configure = (o: CodeSettingsOpts = {}) => { h.settings = codeSettings({ turnstile: true, password: true, ...o }); };
const setup = () => renderHook(() => useCodeLogin(ref));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  let n = 0;
  mint.mockReset().mockImplementation(async () => `ts-${++n}`);
  for (const f of [h.codeEmail, h.codeEmailSend, h.codePhone, h.codeResend, h.codeVerify, h.passwordLogin, h.passwordForgot, h.invalidate]) f.mockReset();
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.codePhone.mockResolvedValue(SENT());
  h.codeEmail.mockResolvedValue(SENT({ channel: 'email', maskedTo: 'a***@example.com' }));
  h.codeEmailSend.mockResolvedValue(SENT({ channel: 'email', maskedTo: 'a***@example.com' }));
  h.codeResend.mockResolvedValue(SENT());
  h.codeVerify.mockResolvedValue({ status: 'signed_in', ...LOGIN, isNew: false });
  h.passwordLogin.mockResolvedValue(LOGIN);
  h.passwordForgot.mockResolvedValue({ ok: true });
  configure();
});
afterEach(() => { vi.useRealTimers(); setTextSnapshot(DEFAULT_TEXT_API); });

describe('phone', () => {
  it('sends the code with a fresh Turnstile token and opens the code screen', async () => {
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'whatsapp', 'ts-1', { language: 'en' });
    expect(result.current.view).toBe('code');
    expect(result.current.attempt).toEqual({ attemptId: 'att-1', kind: 'phone', channel: 'whatsapp', maskedTo: '+44 •••• 0123', resendAt: NOW + 60_000 });
    expect(result.current.failure).toBeNull();
  });

  it('sends no token when the shop has no Turnstile', async () => {
    configure({ turnstile: false });
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'sms'); });
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'sms', undefined, { language: 'en' });
    expect(mint).not.toHaveBeenCalled();
  });

  it('a channel the number cannot get stays on the phone screen with the sentence that names it', async () => {
    h.codePhone.mockRejectedValue(new ApiError(400, 'CODE_CHANNEL_UNAVAILABLE'));
    const { result } = setup();
    await act(async () => { await result.current.go('phone'); });
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(result.current.view).toBe('phone');
    expect(result.current.failure).toEqual({ kind: 'channelUnavailable', message: 'We couldn’t send a WhatsApp message to that number. Try a text message instead' });
  });

  it('switching channel asks resend for the other one and shows the new channel', async () => {
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    h.codeResend.mockResolvedValue(SENT({ channel: 'sms' }));
    await act(async () => { await result.current.switchChannel(); });
    expect(h.codeResend).toHaveBeenCalledWith('att-1', { channel: 'sms', turnstileToken: 'ts-2', language: 'en' });
    expect(result.current.attempt?.channel).toBe('sms');
    expect(result.current.sent).toBe(true);
  });

  it('a switch the country plan refuses keeps the working attempt and says so', async () => {
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    h.codeResend.mockRejectedValue(new ApiError(400, 'CODE_CHANNEL_UNAVAILABLE'));
    await act(async () => { await result.current.switchChannel(); });
    expect(result.current.view).toBe('code');
    expect(result.current.attempt?.channel).toBe('whatsapp');
    expect(result.current.failure?.message).toBe('We can’t send the code that way to this number');
  });
});

describe('email', () => {
  it('a password account goes to the password screen and nothing is sent', async () => {
    h.codeEmail.mockResolvedValue({ next: 'password' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    expect(h.codeEmail).toHaveBeenCalledWith('ada@example.com', 'ts-1', { language: 'en' });
    expect(result.current.view).toBe('password');
    expect(result.current.email).toBe('ada@example.com');
    expect(result.current.attempt).toBeNull();
  });

  it('anyone else gets the code at once', async () => {
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('new@example.com'); });
    expect(result.current.view).toBe('code');
    expect(result.current.attempt).toMatchObject({ kind: 'email', channel: 'email', maskedTo: 'a***@example.com' });
  });

  it('"Email me a code instead" always sends', async () => {
    h.codeEmail.mockResolvedValue({ next: 'password' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    await act(async () => { await result.current.emailMeCode(); });
    expect(h.codeEmailSend).toHaveBeenCalledWith('ada@example.com', 'ts-2', { language: 'en' });
    expect(result.current.view).toBe('code');
  });

  it('a shop with passwords but no email codes goes straight to the password screen without a request', async () => {
    configure({ email: 'off' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    expect(h.codeEmail).not.toHaveBeenCalled();
    expect(result.current.view).toBe('password');
  });

  it('a password answer from a shop whose passwords are off falls back to sending a code', async () => {
    configure({ password: false });
    h.codeEmail.mockResolvedValue({ next: 'password' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    expect(h.codeEmailSend).toHaveBeenCalledWith('ada@example.com', 'ts-2', { language: 'en' });
    expect(result.current.view).toBe('code');
  });

  it('password sign-in uses the password route, then the shared success path', async () => {
    h.codeEmail.mockResolvedValue({ next: 'password' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    await act(async () => { await result.current.passwordSignIn('hunter2hunter2'); });
    expect(h.passwordLogin).toHaveBeenCalledWith({ email: 'ada@example.com' }, 'hunter2hunter2');
    expect(h.onLogin).toHaveBeenCalledWith(LOGIN);
  });

  it('a wrong password is the existing one-sentence answer', async () => {
    h.codeEmail.mockResolvedValue({ next: 'password' });
    h.passwordLogin.mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    await act(async () => { await result.current.passwordSignIn('nope'); });
    expect(result.current.failure?.message).toBe('Email/phone or password is incorrect');
  });

  it('a reset link goes to the typed address with a token and the neutral "sent" flag', async () => {
    h.codeEmail.mockResolvedValue({ next: 'password' });
    const { result } = setup();
    await act(async () => { await result.current.submitEmail('ada@example.com'); });
    await act(async () => { result.current.go('forgot'); });
    await act(async () => { await result.current.sendReset(); });
    expect(h.passwordForgot).toHaveBeenCalledWith('ada@example.com', 'ts-2');
    expect(result.current.sent).toBe(true);
  });
});

describe('the code', () => {
  const toCodeScreen = async () => {
    const hook = setup();
    await act(async () => { await hook.result.current.sendPhone('+447700900123', 'whatsapp'); });
    return hook;
  };

  it('a correct code signs in through the shared success path, without a Turnstile token', async () => {
    const { result } = await toCodeScreen();
    mint.mockClear();
    await act(async () => { await result.current.verify('123456'); });
    expect(h.codeVerify).toHaveBeenCalledWith('att-1', '123456');
    expect(h.onLogin).toHaveBeenCalledWith(LOGIN);
    expect(mint).not.toHaveBeenCalled();
  });

  it('a wrong code keeps the attempt and reports the tries left', async () => {
    h.codeVerify.mockResolvedValue({ status: 'incorrect', attemptsRemaining: 3 });
    const { result } = await toCodeScreen();
    await act(async () => { await result.current.verify('000000'); });
    expect(result.current.view).toBe('code');
    expect(result.current.attempt?.attemptId).toBe('att-1');
    expect(result.current.failure).toMatchObject({ kind: 'incorrect', attemptsRemaining: 3, message: 'That code isn’t right. 3 tries left.' });
    expect(h.onLogin).not.toHaveBeenCalled();
  });

  it('resend asks for another code on the same channel with a fresh token and restarts the countdown', async () => {
    const { result } = await toCodeScreen();
    vi.setSystemTime(NOW + 61_000);
    h.codeResend.mockResolvedValue(SENT({ attemptId: 'att-2' }));
    await act(async () => { await result.current.resend(); });
    expect(h.codeResend).toHaveBeenCalledWith('att-1', { turnstileToken: 'ts-2', language: 'en' });
    expect(result.current.attempt).toMatchObject({ attemptId: 'att-2', resendAt: NOW + 61_000 + 60_000 });
    expect(result.current.sent).toBe(true);
  });

  it('an expired code can be replaced by repeating the original request, not by resending the dead attempt', async () => {
    h.codeVerify.mockRejectedValue(new ApiError(400, 'CODE_EXPIRED'));
    const { result } = await toCodeScreen();
    await act(async () => { await result.current.verify('123456'); });
    expect(result.current.failure?.kind).toBe('expired');
    h.codePhone.mockResolvedValue(SENT({ attemptId: 'att-9' }));
    await act(async () => { await result.current.sendNewCode(); });
    expect(h.codePhone).toHaveBeenLastCalledWith('+447700900123', 'whatsapp', 'ts-2', { language: 'en' });
    expect(h.codeResend).not.toHaveBeenCalled();
    expect(result.current.attempt?.attemptId).toBe('att-9');
    expect(result.current.failure).toBeNull();
  });

  it('for email, a new code repeats email/send', async () => {
    h.codeVerify.mockRejectedValue(new ApiError(400, 'CODE_EXPIRED'));
    const hook = setup();
    await act(async () => { await hook.result.current.submitEmail('new@example.com'); });
    await act(async () => { await hook.result.current.verify('123456'); });
    await act(async () => { await hook.result.current.sendNewCode(); });
    expect(h.codeEmailSend).toHaveBeenCalledWith('new@example.com', 'ts-2', { language: 'en' });
  });

  it('"Use a different number" drops the old attempt', async () => {
    const { result } = await toCodeScreen();
    await act(async () => { result.current.go('phone'); });
    expect(result.current.view).toBe('phone');
    expect(result.current.attempt).toBeNull();
  });
});

describe('guards', () => {
  it('a second tap while a send is in flight is ignored', async () => {
    let release!: (v: unknown) => void;
    h.codePhone.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = setup();
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.sendPhone('+447700900123', 'whatsapp');
      void result.current.sendPhone('+447700900123', 'whatsapp');
    });
    expect(result.current.pending).toBe(true);
    release(SENT());
    await act(async () => { await first; });
    expect(h.codePhone).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('a verify that lands while a resend is running is ignored', async () => {
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    let release!: (v: unknown) => void;
    h.codeResend.mockReturnValue(new Promise((r) => { release = r; }));
    let pendingResend!: Promise<void>;
    await act(async () => {
      pendingResend = result.current.resend();
      void result.current.verify('123456');
    });
    release(SENT());
    await act(async () => { await pendingResend; });
    expect(h.codeVerify).not.toHaveBeenCalled();
  });

  it('a Turnstile failure sends nothing and says why', async () => {
    mint.mockRejectedValue(new Error('Verification failed'));
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(h.codePhone).not.toHaveBeenCalled();
    expect(result.current.failure).toEqual({ kind: 'other', message: 'Verification failed' });
    expect(result.current.pending).toBe(false);
  });

  it('a switched-off mode refreshes the cached settings', async () => {
    h.codePhone.mockRejectedValue(new ApiError(404, 'CODE_LOGIN_UNAVAILABLE'));
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
    expect(result.current.failure?.kind).toBe('unavailable');
  });

  it('going back clears a failure', async () => {
    h.codePhone.mockRejectedValue(new ApiError(429, 'CODE_RATE_LIMITED'));
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(result.current.failure?.kind).toBe('tooMany');
    await act(async () => { result.current.go('choose'); });
    expect(result.current.failure).toBeNull();
  });
});

describe('language and wrong answers', () => {
  it('every send and resend carries the active text locale', async () => {
    setTextSnapshot(createTextApi({ ...DEFAULT_TEXT_LAYERS, locale: 'fr' }));
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(h.codePhone).toHaveBeenCalledWith('+447700900123', 'whatsapp', 'ts-1', { language: 'fr' });
    await act(async () => { await result.current.resend(); });
    expect(h.codeResend).toHaveBeenCalledWith('att-1', { turnstileToken: 'ts-2', language: 'fr' });
    await act(async () => { await result.current.submitEmail('new@example.com'); });
    expect(h.codeEmail).toHaveBeenCalledWith('new@example.com', 'ts-3', { language: 'fr' });
  });

  it('each wrong answer bumps incorrectCount so the screen can clear the box', async () => {
    h.codeVerify.mockResolvedValue({ status: 'incorrect', attemptsRemaining: 2 });
    const { result } = setup();
    await act(async () => { await result.current.sendPhone('+447700900123', 'whatsapp'); });
    expect(result.current.incorrectCount).toBe(0);
    await act(async () => { await result.current.verify('000000'); });
    expect(result.current.incorrectCount).toBe(1);
    await act(async () => { await result.current.verify('000000'); });
    expect(result.current.incorrectCount).toBe(2);
  });
});
