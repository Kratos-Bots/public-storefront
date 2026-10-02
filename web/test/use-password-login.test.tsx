import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { ApiError } from '@/lib/errors.ts';
import type { GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  onLogin: vi.fn(), login: vi.fn(), signup: vi.fn(), forgot: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/useLoginSuccess.ts', () => ({ useLoginSuccess: () => h.onLogin }));
vi.mock('@/api/auth.ts', () => ({ passwordLogin: h.login, passwordSignup: h.signup, passwordForgot: h.forgot }));

import { usePasswordLogin, type PasswordField } from '@/features/auth/usePasswordLogin.ts';

const RESULT = { token: 'tok', customer: { id: 1, nickname: 'Ada' } };
const mint = vi.fn();
const ref = { current: { mint } } as RefObject<GuestTurnstileHandle | null>;

interface Opts {
  turnstile?: boolean;
  reset?: { resetByEmail?: boolean; resetByWhatsapp?: boolean } | null;
  number?: string | null;
  country?: string | null;
}
function configure(o: Opts = {}) {
  h.settings = {
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: o.country === undefined ? 'GB' : o.country },
    turnstile: o.turnstile === false ? null : { siteKey: 'site-key' },
    login: {
      whatsapp: { available: true, number: o.number === undefined ? '447700900123' : o.number },
      telegram: { available: false, botUsername: null },
      password: o.reset === null ? undefined : { available: true, resetByEmail: false, resetByWhatsapp: false, ...o.reset },
    },
  };
}

beforeEach(() => {
  h.onLogin.mockReset().mockResolvedValue(undefined);
  h.login.mockReset().mockResolvedValue(RESULT);
  h.signup.mockReset().mockResolvedValue(RESULT);
  h.forgot.mockReset().mockResolvedValue({ ok: true });
  mint.mockReset().mockResolvedValue('ts-token');
  configure();
});

const setup = () => renderHook(() => usePasswordLogin(ref));
type R = ReturnType<typeof setup>;
const fill = (r: R, values: Partial<Record<PasswordField, string>>) =>
  act(() => { for (const [k, v] of Object.entries(values)) r.result.current.setValue(k as PasswordField, v); });
const submit = (r: R) => act(async () => { await r.result.current.submit(); });

describe('sign in', () => {
  it('trims and lower-cases the email but sends the password verbatim, then hands the result to useLoginSuccess', async () => {
    const r = setup();
    fill(r, { email: '  Ada@Example.COM ', password: '  pass word  ' });
    await submit(r);
    expect(h.login).toHaveBeenCalledWith({ email: 'ada@example.com' }, '  pass word  ');
    expect(h.onLogin).toHaveBeenCalledWith(RESULT);
    expect(mint).not.toHaveBeenCalled();
    expect(r.result.current.pending).toBe(false);
  });

  it('a phone typed with spaces and a trunk zero goes out as +CC… with the picker as the country hint', async () => {
    const r = setup();
    act(() => r.result.current.setKind('phone'));
    expect(r.result.current.values.prefix).toBe('GB'); // from contactModes.defaultPhoneCountry
    fill(r, { phone: '07700 900123', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(h.login).toHaveBeenCalledWith({ phone: '+4407700900123', phoneCountry: 'GB' }, 'pw-pw-pw-pw');
  });

  it('an international number pasted into the national field wins over the picker', async () => {
    const r = setup();
    act(() => r.result.current.setKind('phone'));
    fill(r, { prefix: 'FR', phone: '+44 7700 900123', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(h.login).toHaveBeenCalledWith({ phone: '+447700900123', phoneCountry: 'FR' }, 'pw-pw-pw-pw');
  });

  it('no country and no plus: a field error, and nothing is sent', async () => {
    configure({ country: null });
    const r = setup();
    act(() => r.result.current.setKind('phone'));
    fill(r, { phone: '07700 900123', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.phone).toBe('Enter your phone number with its country code');
    expect(h.login).not.toHaveBeenCalled();
  });

  it('blank fields are Required and send nothing', async () => {
    const r = setup();
    await submit(r);
    expect(r.result.current.errors).toEqual({ email: 'Required', password: 'Required' });
    expect(h.login).not.toHaveBeenCalled();
  });

  it('a wrong password is the one "incorrect" sentence, keeps what was typed and re-enables the button', async () => {
    h.login.mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'nope nope' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('Email/phone or password is incorrect');
    expect(r.result.current.values).toMatchObject({ email: 'a@b.co', password: 'nope nope' });
    expect(r.result.current.pending).toBe(false);
    expect(h.onLogin).not.toHaveBeenCalled();
  });

  it('a 429 is the rate-limit sentence and the form stays usable', async () => {
    h.login.mockRejectedValue(new ApiError(429, 'Too many requests'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('Too many attempts — please wait a moment and try again');
    expect(r.result.current.pending).toBe(false);
    h.login.mockResolvedValue(RESULT);
    await submit(r);
    expect(h.onLogin).toHaveBeenCalledTimes(1);
  });

  it('a banned account gets its own sentence', async () => {
    h.login.mockRejectedValue(new ApiError(403, 'ACCOUNT_BANNED'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('This account can’t sign in right now. Contact the shop for help.');
  });

  it('a double submit sends one request', async () => {
    let finish!: (v: unknown) => void;
    h.login.mockReturnValue(new Promise((res) => { finish = res; }));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await act(async () => { void r.result.current.submit(); void r.result.current.submit(); });
    expect(h.login).toHaveBeenCalledTimes(1);
    expect(r.result.current.pending).toBe(true);
    await act(async () => { finish(RESULT); });
    expect(r.result.current.pending).toBe(false);
  });

  it('editing a field clears its error and the form error', async () => {
    h.login.mockRejectedValue(new ApiError(401, 'x'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.form).toBeTruthy();
    fill(r, { password: 'pw-pw-pw-px' });
    expect(r.result.current.errors.form).toBeUndefined();
  });
});

describe('create account', () => {
  it('mints a fresh Turnstile token per submit — including the retry after a 409', async () => {
    mint.mockReset().mockResolvedValueOnce('t1').mockResolvedValueOnce('t2');
    h.signup.mockRejectedValueOnce(new ApiError(409, 'taken')).mockResolvedValueOnce(RESULT);
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    expect(r.result.current.needsTurnstile).toBe(true);
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('That email or phone can’t be used to create an account. Try signing in or resetting your password.');
    await submit(r);
    expect(mint).toHaveBeenCalledTimes(2);
    expect(h.signup.mock.calls.map((c) => c[2])).toEqual(['t1', 't2']);
    expect(h.onLogin).toHaveBeenCalledWith(RESULT);
  });

  it('refuses a short password before spending a token', async () => {
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    fill(r, { email: 'a@b.co', password: '1234567' });
    await submit(r);
    expect(r.result.current.errors.password).toBe('Use at least 8 characters');
    expect(mint).not.toHaveBeenCalled();
    expect(h.signup).not.toHaveBeenCalled();
  });

  it('a password of spaces is valid and goes out untrimmed', async () => {
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    fill(r, { email: 'a@b.co', password: '        ' });
    await submit(r);
    expect(h.signup).toHaveBeenCalledWith({ email: 'a@b.co' }, '        ', 'ts-token');
  });

  it('a shop with no Turnstile key mints nothing and sends no token', async () => {
    configure({ turnstile: false });
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    expect(r.result.current.needsTurnstile).toBe(false);
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(mint).not.toHaveBeenCalled();
    expect(h.signup).toHaveBeenCalledWith({ email: 'a@b.co' }, 'pw-pw-pw-pw', undefined);
  });

  it('a failed token mint is shown and sends nothing', async () => {
    mint.mockRejectedValue(new Error('Verification restarted'));
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('Verification restarted');
    expect(h.signup).not.toHaveBeenCalled();
    expect(r.result.current.pending).toBe(false);
  });
});

describe('forgot password', () => {
  it('by email: sends the address with a token and shows the neutral note; editing the address hides it', async () => {
    configure({ reset: { resetByEmail: true } });
    const r = setup();
    act(() => r.result.current.setMode('forgot'));
    expect(r.result.current.forgotRoute).toBe('email');
    expect(r.result.current.needsTurnstile).toBe(true);
    fill(r, { email: ' Ada@Example.com ' });
    await submit(r);
    expect(h.forgot).toHaveBeenCalledWith('ada@example.com', 'ts-token');
    expect(r.result.current.sent).toBe(true);
    fill(r, { email: 'ada@example.org' });
    expect(r.result.current.sent).toBe(false);
  });

  it('a transport failure is an error, not the neutral note', async () => {
    configure({ reset: { resetByEmail: true } });
    h.forgot.mockRejectedValue(new ApiError(429, 'Too many requests'));
    const r = setup();
    act(() => r.result.current.setMode('forgot'));
    fill(r, { email: 'a@b.co' });
    await submit(r);
    expect(r.result.current.sent).toBe(false);
    expect(r.result.current.errors.form).toBe('Too many attempts — please wait a moment and try again');
  });

  it('resolves the route from the identifier kind and the shop policy', () => {
    const route = (opts: Opts, kind: 'email' | 'phone') => {
      configure(opts);
      const r = setup();
      act(() => { r.result.current.setMode('forgot'); r.result.current.setKind(kind); });
      return { route: r.result.current.forgotRoute, href: r.result.current.whatsappHref };
    };
    expect(route({ reset: { resetByEmail: true } }, 'email')).toEqual({ route: 'email', href: null });
    expect(route({ reset: { resetByEmail: false } }, 'email')).toEqual({ route: 'none', href: null });
    expect(route({ reset: { resetByWhatsapp: true } }, 'phone')).toEqual({ route: 'whatsapp', href: 'https://wa.me/447700900123?text=RESET%20PASSWORD' });
    expect(route({ reset: { resetByWhatsapp: true }, number: null }, 'phone')).toEqual({ route: 'none', href: null });
    expect(route({ reset: { resetByEmail: true } }, 'phone')).toEqual({ route: 'none', href: null });
    expect(route({ reset: null }, 'email')).toEqual({ route: 'none', href: null });
  });

  it('the whatsapp and none routes have nothing to submit', async () => {
    configure({ reset: { resetByWhatsapp: true } });
    const r = setup();
    act(() => { r.result.current.setMode('forgot'); r.result.current.setKind('phone'); });
    await submit(r);
    expect(h.forgot).not.toHaveBeenCalled();
    expect(r.result.current.needsTurnstile).toBe(false);
  });
});

describe('mode and kind', () => {
  it('switching mode keeps the identifier, clears the password, the errors and the sent note', async () => {
    h.login.mockRejectedValue(new ApiError(401, 'x'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    act(() => r.result.current.setMode('signup'));
    expect(r.result.current.values).toMatchObject({ email: 'a@b.co', password: '' });
    expect(r.result.current.errors).toEqual({});
  });

  it('turnstile is only asked for by sign-up and by forgot-by-email', () => {
    configure({ reset: { resetByEmail: true } });
    const r = setup();
    expect(r.result.current.needsTurnstile).toBe(false);
    act(() => r.result.current.setMode('signup'));
    expect(r.result.current.needsTurnstile).toBe(true);
    act(() => r.result.current.setMode('forgot'));
    expect(r.result.current.needsTurnstile).toBe(true);
    act(() => r.result.current.setKind('phone'));
    expect(r.result.current.needsTurnstile).toBe(false);
  });
});

describe('fix round 1', () => {
  it('clears the password (and only the password) after a successful sign-in', async () => {
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(h.onLogin).toHaveBeenCalledTimes(1);
    expect(r.result.current.values).toMatchObject({ email: 'a@b.co', password: '' });
  });

  it('clears the password after a successful sign-up', async () => {
    const r = setup();
    act(() => r.result.current.setMode('signup'));
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(h.onLogin).toHaveBeenCalledTimes(1);
    expect(r.result.current.values).toMatchObject({ email: 'a@b.co', password: '' });
  });

  it('keeps the password after a failed sign-in', async () => {
    h.login.mockRejectedValue(new ApiError(401, 'x'));
    const r = setup();
    fill(r, { email: 'a@b.co', password: 'pw-pw-pw-pw' });
    await submit(r);
    expect(r.result.current.values.password).toBe('pw-pw-pw-pw');
  });

  it('a required Turnstile with no mounted handle is a form error and sends nothing', async () => {
    const empty = { current: null } as RefObject<GuestTurnstileHandle | null>;
    const r = renderHook(() => usePasswordLogin(empty));
    act(() => r.result.current.setMode('signup'));
    act(() => { r.result.current.setValue('email', 'a@b.co'); r.result.current.setValue('password', 'pw-pw-pw-pw'); });
    await act(async () => { await r.result.current.submit(); });
    expect(r.result.current.errors.form).toBe("We couldn't verify your browser — please try again");
    expect(h.signup).not.toHaveBeenCalled();
    expect(r.result.current.pending).toBe(false);
  });
});
