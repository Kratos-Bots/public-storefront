import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Profile } from '@/types/profile.ts';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));

import { PROFILE_KEY } from '@/features/account/queries.ts';
import { useAccountPassword, type AccountPasswordField } from '@/features/account/useAccountPassword.ts';
import { useSessionStore } from '@/stores/session.ts';

// ky/undici consume the request body, so it is read inside the fetch mock (keyed by request) rather than afterwards.
const bodies = new WeakMap<Request, string>();
let fetchSpy: MockInstance;
function respond(status: number, payload: unknown = { ok: true }, error = 'x') {
  const body = status < 400 ? { success: true, data: payload, error: null } : { success: false, data: null, error };
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const req = input as Request;
    bodies.set(req, await req.clone().text());
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}
const request = (i = -1) => fetchSpy.mock.calls.at(i)![0] as Request;
const body = async (i = -1) => JSON.parse(bodies.get(request(i)) ?? 'null') as Record<string, unknown>;

const NONE = { set: false, loginEmail: null, loginPhone: null, emailVerified: false, phoneVerified: false };
const profile = (over: Partial<Profile> = {}): Profile => ({
  loyaltyPoints: 0, storeCreditBalance: 0, referralCode: 'X', referralsCount: 0, referredPeopleCount: 0, hasReferrer: false,
  referrerNickname: null, totalOrders: 0, totalSpend: 0, memberSince: '2026-01-01T00:00:00.000Z', nickname: 'Ada',
  identities: { telegram: false, whatsapp: true, email: false }, password: NONE, ...over,
});
const TG_ONLY = { telegram: true, whatsapp: false, email: false };

beforeEach(() => {
  h.settings = { contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' } };
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' }, returnTo: null });
  respond(200);
});
afterEach(() => vi.restoreAllMocks());

function setup(p: Profile, resetByEmail = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useAccountPassword(p, { resetByEmail }), { wrapper }), invalidate };
}
type R = ReturnType<typeof setup>;
const fill = (r: R, values: Partial<Record<AccountPasswordField, string>>) =>
  act(() => { for (const [k, v] of Object.entries(values)) r.result.current.setValue(k as AccountPasswordField, v); });
const submit = (r: R) => act(async () => { await r.result.current.submit(); });

describe('who must send an email or phone', () => {
  it.each([
    ['a WhatsApp number on record', { identities: { telegram: false, whatsapp: true, email: false } }, false],
    ['an email on record', { identities: { telegram: false, whatsapp: false, email: true } }, false],
    ['Telegram only and nothing else', { identities: TG_ONLY }, true],
    ['Telegram only, but a login email already on the credential', { identities: TG_ONLY, password: { ...NONE, loginEmail: 'a@b.co' } }, false],
    ['Telegram only, but a login phone already on the credential', { identities: TG_ONLY, password: { ...NONE, loginPhone: '+447700900123' } }, false],
    ['Telegram only on a backend with no password block', { identities: TG_ONLY, password: undefined }, true],
    ['a password already set', { identities: TG_ONLY, password: { ...NONE, set: true, loginEmail: 'a@b.co' } }, false],
  ] as const)('%s → %s', (_name, over, expected) => {
    expect(setup(profile(over as Partial<Profile>)).result.current.needsIdentifier).toBe(expected);
  });
});

describe('setting a first password', () => {
  it('sends the new password alone — no identifiers and no current password — when the account has a phone or email', async () => {
    const r = setup(profile());
    act(() => r.result.current.openForm());
    fill(r, { next: '  a new password  ' });
    await submit(r);
    expect(request().method).toBe('PUT');
    expect(new URL(request().url).pathname).toBe('/api/storefront/account/password');
    expect(await body()).toEqual({ newPassword: '  a new password  ' });
    expect(r.result.current.saved).toBe(true);
    expect(r.result.current.open).toBe(false);
    expect(r.result.current.values.next).toBe('');
    expect(r.invalidate).toHaveBeenCalledWith({ queryKey: PROFILE_KEY });
  });

  it('refuses a short password before sending', async () => {
    const r = setup(profile());
    act(() => r.result.current.openForm());
    fill(r, { next: '1234567' });
    await submit(r);
    expect(r.result.current.errors.next).toBe('Use at least 8 characters');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a Telegram-only account must carry an email: a blank one is refused, a typed one is lower-cased and sent', async () => {
    const r = setup(profile({ identities: TG_ONLY }));
    act(() => r.result.current.openForm());
    fill(r, { next: 'a new password' });
    await submit(r);
    expect(r.result.current.errors.email).toBe('Required');
    expect(fetchSpy).not.toHaveBeenCalled();
    fill(r, { email: ' Tg@Example.com ' });
    await submit(r);
    expect(await body()).toEqual({ newPassword: 'a new password', email: 'tg@example.com' });
  });

  it('…or a phone, composed with its country hint', async () => {
    const r = setup(profile({ identities: TG_ONLY }));
    act(() => { r.result.current.openForm(); r.result.current.setKind('phone'); });
    fill(r, { next: 'a new password', phone: '07700 900123' });
    await submit(r);
    expect(await body()).toEqual({ newPassword: 'a new password', phone: '+4407700900123', phoneCountry: 'GB' });
  });

  it('a 409 (someone else holds that email or phone) is the generic sentence, and the form stays open with what was typed', async () => {
    respond(409, null, 'whatever the backend says');
    const r = setup(profile({ identities: TG_ONLY }));
    act(() => r.result.current.openForm());
    fill(r, { next: 'a new password', email: 'tg@example.com' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('That email or phone can’t be used to create an account. Try signing in or resetting your password.');
    expect(r.result.current.open).toBe(true);
    expect(r.result.current.values).toMatchObject({ next: 'a new password', email: 'tg@example.com' });
    expect(r.result.current.saved).toBe(false);
    expect(r.invalidate).not.toHaveBeenCalled();
  });
});

describe('changing a password', () => {
  const withPassword = () => profile({ password: { ...NONE, set: true, loginEmail: 'ada@example.com' } });

  it('asks for the current password, sends both untrimmed, and never sends an identifier', async () => {
    const r = setup(withPassword());
    expect(r.result.current.hasPassword).toBe(true);
    act(() => r.result.current.openForm());
    await submit(r);
    expect(r.result.current.errors).toMatchObject({ current: 'Required', next: 'Use at least 8 characters' });
    fill(r, { current: ' old pass ', next: ' new pass word ' });
    await submit(r);
    expect(await body()).toEqual({ newPassword: ' new pass word ', currentPassword: ' old pass ' });
  });

  it('a success clears BOTH the current and the new password from state and refetches the profile', async () => {
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    fill(r, { current: 'old password', next: 'a new password' });
    await submit(r);
    expect(r.result.current.saved).toBe(true);
    expect(r.result.current.values).toMatchObject({ current: '', next: '' });
    expect(r.invalidate).toHaveBeenCalledWith({ queryKey: PROFILE_KEY });
  });

  it('a wrong current password (422 CURRENT_PASSWORD_INCORRECT) is a field error, keeps the form open and does NOT sign the shopper out', async () => {
    respond(422, null, 'CURRENT_PASSWORD_INCORRECT');
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    fill(r, { current: 'wrong', next: 'a new password' });
    await submit(r);
    expect(r.result.current.errors.current).toBe('Your current password is incorrect');
    expect(r.result.current.errors.form).toBeUndefined();
    expect(r.result.current.open).toBe(true);
    expect(r.result.current.values).toMatchObject({ current: 'wrong', next: 'a new password' });
    expect(useSessionStore.getState().token).toBe('tok');
    expect(useSessionStore.getState().customer).toEqual({ id: 1, nickname: 'Ada' });
    expect(r.invalidate).not.toHaveBeenCalled();
  });

  it('a 429 is the rate-limit sentence, keeps the session, the form and both typed passwords', async () => {
    respond(429, null, 'Too many requests');
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    fill(r, { current: 'old password', next: 'a new password' });
    await submit(r);
    expect(r.result.current.errors.form).toBe('Too many attempts — please wait a moment and try again');
    expect(useSessionStore.getState().token).toBe('tok');
    expect(r.result.current.open).toBe(true);
    expect(r.result.current.values).toMatchObject({ current: 'old password', next: 'a new password' });
  });

  it('a genuinely dead session (401) still signs out, as for every other account call', async () => {
    respond(401, null, 'Unauthorized');
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    fill(r, { current: 'old password', next: 'a new password' });
    await submit(r);
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('a double submit sends one request', async () => {
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    fill(r, { current: 'old password', next: 'a new password' });
    await act(async () => { void r.result.current.submit(); void r.result.current.submit(); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cancel closes the form and forgets what was typed', () => {
    const r = setup(withPassword());
    act(() => r.result.current.openForm());
    act(() => r.result.current.setKind('phone'));
    fill(r, { current: 'x', next: 'y', email: 'a@b.co', phone: '07700 900123' });
    act(() => r.result.current.cancel());
    expect(r.result.current.open).toBe(false);
    expect(r.result.current.values).toMatchObject({ current: '', next: '', email: '', phone: '' });
    expect(r.result.current.kind).toBe('email');
    expect(r.result.current.errors).toEqual({});
  });

  it('opening the form again hides the "saved" note', async () => {
    const r = setup(profile());
    act(() => r.result.current.openForm());
    fill(r, { next: 'a new password' });
    await submit(r);
    expect(r.result.current.saved).toBe(true);
    act(() => r.result.current.openForm());
    expect(r.result.current.saved).toBe(false);
  });
});

describe('verification email', () => {
  const unverified = () => profile({ password: { ...NONE, set: true, loginEmail: 'ada@example.com', emailVerified: false } });

  it.each([
    ['delivery is not configured', unverified(), false, false],
    ['there is no login email', profile({ password: { ...NONE, set: true, loginPhone: '+447700900123' } }), true, false],
    ['the email is already verified', profile({ password: { ...NONE, set: true, loginEmail: 'a@b.co', emailVerified: true } }), true, false],
    ['an unverified login email and delivery configured', unverified(), true, true],
    ['an older backend with no password block', profile({ password: undefined }), true, false],
  ])('canSend when %s → %s', (_name, p, resetByEmail, expected) => {
    expect(setup(p, resetByEmail).result.current.verification.canSend).toBe(expected);
  });

  it('posts once and reports it was sent', async () => {
    const r = setup(unverified(), true);
    await act(async () => { void r.result.current.verification.send(); void r.result.current.verification.send(); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(new URL(request().url).pathname).toBe('/api/storefront/auth/email/verification');
    expect(r.result.current.verification.sent).toBe(true);
    expect(r.result.current.verification.error).toBeNull();
  });

  it('a 429 is shown and nothing is claimed sent', async () => {
    respond(429, null, 'Too many requests');
    const r = setup(unverified(), true);
    await act(async () => { await r.result.current.verification.send(); });
    expect(r.result.current.verification.sent).toBe(false);
    expect(r.result.current.verification.error).toBe('Too many attempts — please wait a moment and try again');
    expect(r.result.current.verification.sending).toBe(false);
  });

  it('a resend that fails after a success no longer reports sent', async () => {
    const r = setup(unverified(), true);
    await act(async () => { await r.result.current.verification.send(); });
    expect(r.result.current.verification.sent).toBe(true);
    respond(429, null, 'Too many requests');
    await act(async () => { await r.result.current.verification.send(); });
    expect(r.result.current.verification.sent).toBe(false);
    expect(r.result.current.verification.error).toBe('Too many attempts — please wait a moment and try again');
  });
});
