import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import type { Profile } from '@/types/profile.ts';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, profile: undefined as unknown }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useProfile: () => ({ data: h.profile, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => false }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => false, tgClose: () => {} }));
vi.mock('@/features/cart/useServerCart.ts', () => ({ resetCartSync: () => {} }));

import { BuilderModeProvider } from '@/builder/mode.ts';
import { PasswordSection } from '@/features/account/PasswordSection.tsx';
import { ProfilePage } from '@/features/account/ProfilePage.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { matchesTextPattern } from '@/text/registry.ts';
import { ApiError } from '@/lib/errors.ts';
import { passwordErrorMessage } from '@/features/auth/password-errors.ts';

let fetchSpy: MockInstance;
// ky/undici consume the request body, so it is read inside the fetch mock (keyed by request) rather than afterwards.
const bodies = new WeakMap<Request, string>();
function respond(status: number, payload: unknown = { ok: true }, error = 'x') {
  const body = status < 400 ? { success: true, data: payload, error: null } : { success: false, data: null, error };
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input) => {
      const req = input as Request;
      bodies.set(req, await req.clone().text());
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    },
  );
}
const lastRequest = () => fetchSpy.mock.calls.at(-1)![0] as Request;
const lastBody = async () => JSON.parse(bodies.get(lastRequest()) ?? 'null') as Record<string, unknown>;

const NONE = { set: false, loginEmail: null, loginPhone: null, emailVerified: false, phoneVerified: false };
const profile = (over: Partial<Profile> = {}): Profile => ({
  loyaltyPoints: 0, storeCreditBalance: 0, referralCode: 'X', referralsCount: 0, referredPeopleCount: 0, hasReferrer: false,
  referrerNickname: null, totalOrders: 1, totalSpend: 10, memberSince: '2026-01-01T00:00:00.000Z', nickname: 'Ada',
  identities: { telegram: false, whatsapp: true, email: false }, password: NONE, ...over,
});
const TG_ONLY = { telegram: true, whatsapp: false, email: false };

beforeEach(() => {
  h.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' },
    features: { layout: 'storefront', ordering: true, accounts: true },
    login: { whatsapp: { available: true, number: '447700900123' }, telegram: { available: false, botUsername: null }, password: { available: true, resetByEmail: false, resetByWhatsapp: false } },
  };
  h.profile = profile();
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' }, returnTo: null });
  respond(200);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const shell = (ui: ReactNode, fixture?: unknown) => {
  const tree = (
    <MantineProvider env="test"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider></MantineProvider>
  );
  return render(fixture ? <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { Profile: fixture } }}>{tree}</BuilderModeProvider> : tree);
};
const section = (p: Profile, resetByEmail = false) => shell(<PasswordSection profile={p} resetByEmail={resetByEmail} />);
const button = (name: string) => screen.getByRole('button', { name });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('the section', () => {
  it('no password yet: says so and offers to set one; the form asks for the new password alone', async () => {
    section(profile());
    expect(screen.getByRole('region', { name: 'Password' })).toBeTruthy();
    expect(screen.getByText('No password yet. Set one to sign in with your email or phone.')).toBeTruthy();
    fireEvent.click(button('Set a password'));
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.queryByLabelText('Email address')).toBeNull();
    const next = screen.getByLabelText('New password') as HTMLInputElement;
    expect(next.getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    type(next, ' a new password ');
    fireEvent.click(button('Save password'));
    expect(await screen.findByText('Password saved.')).toBeTruthy();
    expect(lastRequest().method).toBe('PUT');
    expect(await lastBody()).toEqual({ newPassword: ' a new password ' });
  });

  it('a password is set: Change password asks for the current one, and a wrong one is a field error that leaves the shopper signed in', async () => {
    respond(422, null, 'CURRENT_PASSWORD_INCORRECT');
    section(profile({ password: { ...NONE, set: true, loginEmail: 'ada@example.com' } }));
    expect(screen.getByText('A password is set on this account.')).toBeTruthy();
    fireEvent.click(button('Change password'));
    const current = screen.getByLabelText('Current password') as HTMLInputElement;
    expect(current.getAttribute('autocomplete')).toBe('current-password');
    type(current, 'wrong');
    type(screen.getByLabelText('New password'), 'a new password');
    fireEvent.click(button('Save password'));
    expect(await screen.findByText('Your current password is incorrect')).toBeTruthy();
    expect(screen.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('a new password');
    expect(useSessionStore.getState().token).toBe('tok'); // the session store is NOT cleared by this response
    expect(await lastBody()).toEqual({ newPassword: 'a new password', currentPassword: 'wrong' });
  });

  it('a 429 on save is the rate-limit sentence and the form stays open', async () => {
    respond(429, null, 'Too many requests');
    section(profile());
    fireEvent.click(button('Set a password'));
    type(screen.getByLabelText('New password'), 'a new password');
    fireEvent.click(button('Save password'));
    expect(await screen.findByText('Too many attempts — please wait a moment and try again')).toBeTruthy();
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(useSessionStore.getState().token).toBe('tok');
  });

  it('a Telegram-only account must say which email or phone it signs in with', async () => {
    section(profile({ identities: TG_ONLY }));
    fireEvent.click(button('Set a password'));
    expect(screen.getByText('Add the email or phone you’ll sign in with.')).toBeTruthy();
    expect(button('Email').getAttribute('aria-pressed')).toBe('true');
    type(screen.getByLabelText('Email address'), 'tg@example.com');
    type(screen.getByLabelText('New password'), 'a new password');
    fireEvent.click(button('Save password'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(await lastBody()).toEqual({ newPassword: 'a new password', email: 'tg@example.com' });
  });

  it('the phone field carries no checkout delivery hint', () => {
    section(profile({ identities: TG_ONLY }));
    fireEvent.click(button('Set a password'));
    fireEvent.click(button('Phone'));
    expect(screen.getByLabelText('Phone')).toBeTruthy();
    expect(screen.queryByText('Couriers may use this for delivery.')).toBeNull();
  });

  it.each([
    ['a WhatsApp number', { identities: { telegram: false, whatsapp: true, email: false } }],
    ['an email', { identities: { telegram: false, whatsapp: false, email: true } }],
  ])('an account with %s on record never shows an identifier field', (_n, over) => {
    section(profile(over as Partial<Profile>));
    fireEvent.click(button('Set a password'));
    expect(screen.queryByLabelText('Email address')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Phone' })).toBeNull();
  });

  it('Cancel closes the form', () => {
    section(profile());
    fireEvent.click(button('Set a password'));
    fireEvent.click(button('Cancel'));
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(button('Set a password')).toBeTruthy();
  });
});

describe('what signs in, and the verification email', () => {
  const verified = profile({ password: { ...NONE, set: true, loginEmail: 'ada@example.com', loginPhone: '+447700900123', emailVerified: true, phoneVerified: false } });

  it('lists each sign-in identifier with a verified marker', () => {
    section(verified);
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('+447700900123')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Not verified')).toBeTruthy();
  });

  it.each([
    ['delivery configured, unverified email', profile({ password: { ...NONE, set: true, loginEmail: 'a@b.co' } }), true, true],
    ['delivery not configured', profile({ password: { ...NONE, set: true, loginEmail: 'a@b.co' } }), false, false],
    ['already verified', verified, true, false],
  ])('%s → button shown: %s', (_n, p, resetByEmail, shown) => {
    section(p, resetByEmail);
    expect(!!screen.queryByRole('button', { name: 'Send verification email' })).toBe(shown);
  });

  it('requests the email once and confirms', async () => {
    section(profile({ password: { ...NONE, set: true, loginEmail: 'a@b.co' } }), true);
    fireEvent.click(button('Send verification email'));
    expect(await screen.findByText('Verification email sent — check your inbox.')).toBeTruthy();
    expect(new URL(lastRequest().url).pathname).toBe('/api/storefront/auth/email/verification');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('as a part of the profile page', () => {
  it('draws nothing while the shop has password sign-in off, or the backend does not know it', () => {
    for (const password of [{ available: false, resetByEmail: false, resetByWhatsapp: false }, undefined]) {
      (h.settings.login as Record<string, unknown>).password = password;
      const { unmount } = shell(<ProfilePage />);
      expect(screen.queryByRole('region', { name: 'Password' })).toBeNull();
      unmount();
    }
  });

  it('draws the section, between the channels and the sign-out button, when it is on', () => {
    shell(<ProfilePage />);
    const region = screen.getByRole('region', { name: 'Password' });
    const channels = screen.getByRole('region', { name: 'Sign-in channels' });
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(channels.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the editor previews it from a fixture whatever the live settings say', () => {
    (h.settings.login as Record<string, unknown>).password = undefined;
    shell(<ProfilePage />, { surface: 'website', profile: profile() });
    expect(screen.getByRole('region', { name: 'Password' })).toBeTruthy();
  });
});

describe('the block claims every sentence the section can show', () => {
  it('covers each key passwordErrorMessage can return when saving or requesting a verification email', () => {
    const patterns = BLOCKS.ProfilePassword!.text ?? [];
    const claimed = (key: string) => patterns.some((p) => matchesTextPattern(key, p));
    for (const key of ['auth.password.banned', 'auth.password.wrongCurrent', 'auth.password.taken', 'auth.password.unavailable', 'errors.rateLimited']) {
      expect(claimed(key), key).toBe(true);
    }
  });

  it('those keys are what the function returns for each failure (so the list above is the whole set)', () => {
    const err = (status: number, message = 'x') => new ApiError(status, message);
    const sentences = new Set<string>();
    for (const ctx of ['set', 'forgot'] as const) {
      for (const e of [err(403, 'ACCOUNT_BANNED'), err(422, 'CURRENT_PASSWORD_INCORRECT'), err(409), err(404)]) sentences.add(passwordErrorMessage(e, ctx));
    }
    expect(sentences.size).toBe(4);
  });
});
