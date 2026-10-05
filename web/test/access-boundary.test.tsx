import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';

const h = vi.hoisted(() => ({ fetchProfile: vi.fn() }));
vi.mock('@/api/profile.ts', () => ({ fetchProfile: h.fetchProfile }));
vi.mock('@/features/access/LockedPage.tsx', () => ({
  LockedPage: ({ variant }: { variant: string }) => <div>locked:{variant}</div>,
}));
// The bare auth frame shows the brand mark, which is not under test here.
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));

import { AccessBoundary } from '@/app/AccessBoundary.tsx';
import { OrderLinkRedirect } from '@/app/OrderLinkRedirect.tsx';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { accessGate } from '@/app/access-gate.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

function settings(access?: Record<string, unknown>, accounts = true): StorefrontSettings {
  return {
    enabled: true,
    features: { accounts },
    ...(access ? { access: { registration: true, deniedMessage: '', deniedButtons: [], ...access } } : {}),
  } as unknown as StorefrontSettings;
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function mount(at: string, s: StorefrontSettings) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(SETTINGS_KEY, s);
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <AccessBoundary>
            <div>shop frame</div>
            <Where />
          </AccessBoundary>
        ),
        children: [{ path: '*', element: <div>page</div> }],
      },
    ],
    { initialEntries: [at] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { router, ...view };
}

const signedIn = () => useSessionStore.getState().setSession('tok', { id: 1, nickname: 'Ada' });

beforeEach(() => {
  useSessionStore.getState().clear();
  accessGate.getState().reset();
  h.fetchProfile.mockReset();
});

afterEach(() => cleanup());

describe('AccessBoundary', () => {
  it('renders the shop in a public shop', () => {
    mount('/', settings({ storefront: 'public' }));
    expect(screen.getByText('shop frame')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in, remembering where they were', () => {
    const { router } = mount('/c/tea?page=2', settings({ storefront: 'login' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/c/tea?page=2');
    expect(screen.queryByText('shop frame')).toBeNull();
  });

  it('shows only the page, without the shop frame, on /login', () => {
    mount('/login', settings({ storefront: 'login' }));
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.queryByText('shop frame')).toBeNull();
  });

  it('locks a signed-in customer the owner has not allowed', () => {
    signedIn();
    accessGate.getState().setDenied(true);
    mount('/', settings({ storefront: 'restricted' }));
    expect(screen.getByText('locked:denied')).toBeInTheDocument();
    expect(screen.queryByText('shop frame')).toBeNull();
  });

  it('keeps their orders reachable', () => {
    signedIn();
    accessGate.getState().setDenied(true);
    mount('/account/orders', settings({ storefront: 'restricted' }));
    expect(screen.getByText('shop frame')).toBeInTheDocument();
  });

  it('ends a refused customer on their account order page when they open an old order link', async () => {
    signedIn();
    accessGate.getState().setDenied(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(SETTINGS_KEY, settings({ storefront: 'restricted' }));
    const router = createMemoryRouter(
      [{
        path: '/',
        element: <AccessBoundary><Where /><Outlet /></AccessBoundary>,
        children: [
          { path: 'order/:ref/:accessKey', element: <OrderLinkRedirect /> },
          { path: 'account/orders/:ref', element: <div>order page</div> },
        ],
      }],
      { initialEntries: ['/order/ORD-1/KEY'] },
    );
    render(
      <QueryClientProvider client={client}>
        <MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('order page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account/orders/ORD-1');
    expect(screen.queryByText(/^locked:/)).toBeNull();
  });

  it('re-renders to the lockout screen when the gate flips after mount', async () => {
    signedIn();
    h.fetchProfile.mockResolvedValue({ shopAccess: true });
    mount('/', settings({ storefront: 'restricted' }));
    expect(await screen.findByText('shop frame')).toBeInTheDocument();
    act(() => accessGate.getState().setDenied(true));
    expect(screen.getByText('locked:denied')).toBeInTheDocument();
  });

  describe('reading the profile in a restricted shop', () => {
    it('shows the neutral skeleton, not the shop frame, while the first read is pending', () => {
      signedIn();
      h.fetchProfile.mockReturnValue(new Promise(() => {}));
      mount('/', settings({ storefront: 'restricted' }));
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('shop frame')).toBeNull();
    });

    it('locks without any catalogue call when the profile says shopAccess is false', async () => {
      signedIn();
      h.fetchProfile.mockResolvedValue({ shopAccess: false });
      mount('/', settings({ storefront: 'restricted' }));
      expect(await screen.findByText('locked:denied')).toBeInTheDocument();
      expect(screen.queryByText('shop frame')).toBeNull();
      expect(accessGate.getState().denied).toBe(true);
    });

    it('shows the frame when the profile says shopAccess is true, and not a second skeleton on a later navigation', async () => {
      signedIn();
      h.fetchProfile.mockResolvedValue({ shopAccess: true });
      const { router } = mount('/', settings({ storefront: 'restricted' }));
      expect(await screen.findByText('shop frame')).toBeInTheDocument();
      await act(async () => { await router.navigate('/cart'); });
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByText('shop frame')).toBeInTheDocument();
      expect(h.fetchProfile).toHaveBeenCalledTimes(1);
    });

    it('shows the frame on a backend that does not send shopAccess', async () => {
      signedIn();
      h.fetchProfile.mockResolvedValue({});
      mount('/', settings({ storefront: 'restricted' }));
      expect(await screen.findByText('shop frame')).toBeInTheDocument();
    });

    it('leaves the 403s to decide when the profile request fails', async () => {
      signedIn();
      h.fetchProfile.mockRejectedValue(new Error('boom'));
      mount('/', settings({ storefront: 'restricted' }));
      expect(await screen.findByText('shop frame')).toBeInTheDocument();
    });

    it.each(['public', 'login'])('makes no profile request in a %s shop', (storefront) => {
      signedIn();
      mount('/', settings({ storefront }));
      expect(screen.getByText('shop frame')).toBeInTheDocument();
      expect(h.fetchProfile).not.toHaveBeenCalled();
    });

    it('makes no profile request on an account page', () => {
      signedIn();
      mount('/account/orders', settings({ storefront: 'restricted' }));
      expect(screen.getByText('shop frame')).toBeInTheDocument();
      expect(h.fetchProfile).not.toHaveBeenCalled();
    });
  });

  it('keeps the bare frame on /login the moment a sign-in lands, before navigation', () => {
    mount('/login', settings({ storefront: 'login' }));
    act(() => signedIn());
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.queryByText('shop frame')).toBeNull();
  });

  it('behaves as before on a backend without shop access', () => {
    mount('/', settings());
    expect(screen.getByText('shop frame')).toBeInTheDocument();
  });

  it('shows the closed screen after a refused Mini App registration in a non-public shop', () => {
    accessGate.getState().setRegistrationRefused(true);
    mount('/', settings({ storefront: 'login', registration: false }));
    expect(screen.getByText('locked:closed')).toBeInTheDocument();
  });

  it('keeps a public shop browsable after a refused Mini App registration', () => {
    accessGate.getState().setRegistrationRefused(true);
    mount('/', settings({ storefront: 'public', registration: false }));
    expect(screen.getByText('shop frame')).toBeInTheDocument();
  });
});
