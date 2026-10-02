import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';

vi.mock('@/features/access/LockedPage.tsx', () => ({
  LockedPage: ({ variant }: { variant: string }) => <div>locked:{variant}</div>,
}));
// The bare auth frame shows the brand mark, which is not under test here.
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));

import { AccessBoundary } from '@/app/AccessBoundary.tsx';
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

  it('re-renders to the lockout screen when the gate flips after mount', () => {
    signedIn();
    mount('/', settings({ storefront: 'restricted' }));
    expect(screen.getByText('shop frame')).toBeInTheDocument();
    act(() => accessGate.getState().setDenied(true));
    expect(screen.getByText('locked:denied')).toBeInTheDocument();
  });

  it('behaves as before on a backend without shop access', () => {
    mount('/', settings());
    expect(screen.getByText('shop frame')).toBeInTheDocument();
  });

  it('shows the closed screen after a refused Mini App registration', () => {
    accessGate.getState().setRegistrationRefused(true);
    mount('/', settings({ storefront: 'login' }));
    expect(screen.getByText('locked:closed')).toBeInTheDocument();
  });
});
