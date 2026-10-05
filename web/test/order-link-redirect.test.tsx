import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { accessDecision, type AccessContext } from '@/app/access.ts';

const state = vi.hoisted(() => ({ accounts: true }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ features: { accounts: state.accounts, ordering: true, guestCheckout: true } }),
}));
vi.mock('@/features/NotFoundPage.tsx', () => ({ NotFoundPage: () => <p>not found</p> }));

import { OrderLinkRedirect } from '@/app/OrderLinkRedirect.tsx';
import { Guard } from '@/app/guards.tsx';
import { useSessionStore } from '@/stores/session.ts';

function Where() {
  const { pathname, search } = useLocation();
  return <p>at {pathname}{search}</p>;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/order/:ref/:accessKey', element: <OrderLinkRedirect /> },
      { path: '/account', element: <Guard spec={{ session: true }}><Outlet /></Guard>, children: [{ path: 'orders/:ref', element: <Where /> }] },
      { path: '/order-placed', element: <Where /> },
      { path: '/login', element: <Where /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  state.accounts = true;
  useSessionStore.getState().clear();
});

describe('the old order link', () => {
  it('with accounts on, leads to the customer order page (the account guard handles sign-in)', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    mount('/order/K4M2QP/abc123');
    expect(await screen.findByText('at /account/orders/K4M2QP')).toBeTruthy();
  });

  it('with accounts on, keeps a reference that needs encoding intact and drops the key', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    mount('/order/A%2F1/abcdef0123456789');
    expect(await screen.findByText('at /account/orders/A%2F1')).toBeTruthy();
  });

  it('with accounts on and nobody signed in, goes through sign-in with the order page as the way back', async () => {
    const router = mount('/order/K4M2QP/abc123');
    expect(await screen.findByText(/^at \/login/)).toBeTruthy();
    expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent('/account/orders/K4M2QP')}`);
  });

  it('with accounts off, lands on the neutral order-placed page, which a session guard would 404', async () => {
    state.accounts = false;
    mount('/order/K4M2QP/abc123');
    expect(await screen.findByText('at /order-placed?order=K4M2QP')).toBeTruthy();
  });

  it('encodes the reference on the way to order-placed', async () => {
    state.accounts = false;
    const router = mount('/order/' + encodeURIComponent('A/B 1') + '/key');
    await screen.findByText(/^at \/order-placed/);
    expect(router.state.location.search).toBe('?order=A%2FB+1');
    expect(new URLSearchParams(router.state.location.search).get('order')).toBe('A/B 1');
  });
});

describe('the old order link on a shop that needs sign-in', () => {
  const base: AccessContext = {
    access: { storefront: 'login' } as AccessContext['access'], loggedIn: false, denied: false, registrationRefused: false,
    accounts: true, pathname: '/order/K4M2QP/abc123', search: '', builder: false,
  };

  it('a signed-out visitor is sent to sign in with the old link as the way back', () => {
    expect(accessDecision(base)).toEqual({ kind: 'redirect', to: `/login?returnTo=${encodeURIComponent('/order/K4M2QP/abc123')}` });
  });

  it('after signing in, the way back (the old link) ends on the order page', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    expect(accessDecision({ ...base, loggedIn: true })).toEqual({ kind: 'allow' });
    mount('/order/K4M2QP/abc123');
    expect(await screen.findByText('at /account/orders/K4M2QP')).toBeTruthy();
  });
});
