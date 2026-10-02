import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/PasswordLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { PasswordLogin: () => createElement('p', null, 'PASSWORD CARD') };
});

import { guardDecision, type GuardContext } from '@/app/guards.tsx';
import { isClosedExemptPath } from '@/app/closed-gate.ts';
import { routes } from '@/app/routes.tsx';
import { FIXED_ROUTE_KEYS } from '@/builder/types.ts';
import { LINKABLE_ROUTES } from '@/builder/editor/custom-fields/route-link-model.ts';
import { docLabel, pageOptions } from '@/builder/editor/page-catalog.ts';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { LoginPage } from '@/features/auth/LoginPage.tsx';
import { safeReturnTo } from '@/features/auth/useLoginSuccess.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import type { Features } from '@/types/settings.ts';

const FEATURES: Features = { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: true, wholesale: false, upsell: false };
const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({ features: FEATURES, loggedIn: false, path: '/', ...over });

describe('route table', () => {
  it('both pages are fixed route keys with a route each', () => {
    expect(FIXED_ROUTE_KEYS).toContain('reset-password');
    expect(FIXED_ROUTE_KEYS).toContain('verify-email');
    const shell = routes.find((r) => r.path === '/')!;
    for (const [path, key] of [['reset-password', 'reset-password'], ['verify-email', 'verify-email']] as const) {
      const route = shell.children!.find((r) => r.path === path)!;
      expect(route, path).toBeDefined();
      expect((route.handle as { routeKey: string }).routeKey).toBe(key);
    }
  });
});

describe('guards', () => {
  it('reset-password needs the accounts feature but no session', () => {
    expect(guardDecision({ feature: 'accounts' }, ctx({ loggedIn: false }))).toEqual({ kind: 'allow' });
    expect(guardDecision({ feature: 'accounts' }, ctx({ features: { ...FEATURES, accounts: false } }))).toEqual({ kind: 'notFound' });
  });

  it('a signed-out visitor to /verify-email is sent to /login with the whole URL as returnTo, and the token survives the round trip', () => {
    const path = '/verify-email?token=a-b_c~d.e';
    const d = guardDecision({ session: true }, ctx({ path }));
    expect(d).toEqual({ kind: 'redirect', to: '/login?returnTo=%2Fverify-email%3Ftoken%3Da-b_c~d.e' });
    const to = (d as { to: string }).to;
    expect(safeReturnTo(new URL(to, 'http://shop.invalid').searchParams.get('returnTo'))).toBe(path);
  });

  it('a signed-in visitor, or a shop with accounts off, is handled as for every session route', () => {
    expect(guardDecision({ session: true }, ctx({ loggedIn: true, path: '/verify-email?token=x' }))).toEqual({ kind: 'allow' });
    expect(guardDecision({ session: true }, ctx({ features: { ...FEATURES, accounts: false } }))).toEqual({ kind: 'notFound' });
  });
});

describe('the login page parks the verify-email URL for the sign-in that follows', () => {
  beforeEach(() => {
    useSessionStore.setState({ token: null, customer: null, returnTo: null });
    useTelegramAuthStore.setState({ status: 'none', error: null });
    h.settings = {
      brand: { name: 'N', shortName: 'N', links: { whatsapp: null, telegram: null } }, supportLinks: [],
      login: { whatsapp: { available: false, number: null }, telegram: { available: false, botUsername: null }, password: { available: true, resetByEmail: false, resetByWhatsapp: false } },
    };
  });
  afterEach(cleanup);

  it('stores the decoded returnTo, token and all', async () => {
    render(
      <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/login?returnTo=%2Fverify-email%3Ftoken%3Da-b_c~d.e']}><LoginPage /></MemoryRouter>
      </QueryClientProvider></MantineProvider>,
    );
    await waitFor(() => expect(useSessionStore.getState().returnTo).toBe('/verify-email?token=a-b_c~d.e'));
    expect(screen.getByText('PASSWORD CARD')).toBeTruthy();
  });
});

describe('closed shop and the link picker', () => {
  it('a closed shop cannot reset or verify: neither path is exempt from the closed gate', () => {
    expect(isClosedExemptPath('/reset-password')).toBe(false);
    expect(isClosedExemptPath('/reset-password/')).toBe(false);
    expect(isClosedExemptPath('/verify-email')).toBe(false);
  });

  it('neither page is offered in the link picker (they only work with a token)', () => {
    const paths = LINKABLE_ROUTES.map((r) => r.path);
    expect(paths).not.toContain('/reset-password');
    expect(paths).not.toContain('/verify-email');
  });
});

describe('the editor', () => {
  it('lists both documents, labelled, in the page picker', () => {
    const keys = pageOptions({}, 'storefront').flatMap((g) => g.options.map((o) => o.docKey));
    expect(keys).toContain('reset-password');
    expect(keys).toContain('verify-email');
    expect(docLabel('reset-password', {})).toBe('Reset password');
    expect(docLabel('verify-email', {})).toBe('Verify your email');
  });

  it.each([
    ['POST', 'storefront/auth/password/login'], ['POST', 'storefront/auth/password/signup'], ['POST', 'storefront/auth/password/forgot'],
    ['POST', 'storefront/auth/password/reset/check'], ['POST', 'storefront/auth/password/reset'], ['PUT', 'storefront/account/password'],
    ['POST', 'storefront/auth/email/verification'], ['POST', 'storefront/auth/email/verify'],
  ])('the fixture API refuses %s %s with a toast and never lets it out', async (method, path) => {
    const notify = vi.fn();
    const request = new Request(`http://localhost:3000/api/${path}`, { method, headers: { Authorization: 'Bearer sf-builder-fixture-token' } });
    const result = await createFixtureInterceptor(() => ({ session: 'signed-in', cart: 'empty' }), notify)(request);
    expect(result).toMatchObject({ status: 400 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
