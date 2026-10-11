import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';

// The review link a Telegram notification opens is /account/orders/<ref>?review=1, and inside the Mini App that page is
// the FIRST history entry and the session does not exist yet: the app must hold its skeleton while Telegram sign-in is
// pending, so the route guard never sees "signed out" and bounces to /login.
const h = vi.hoisted(() => ({ settings: { enabled: true, features: { layout: 'webapp', accounts: true } } as Record<string, unknown> }));
vi.mock('@/api/settings.ts', () => ({ fetchSettings: vi.fn(async () => h.settings) }));
vi.mock('@/app/document-theme.ts', () => ({ useDocumentTheme: () => ({ scheme: 'dark' }) }));
vi.mock('@/app/theme-bridge.ts', () => ({ buildMantineTheme: () => ({}), lastKnownBrandName: () => null }));
vi.mock('@/templates/runtime.tsx', () => ({ TemplateProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/text/runtime.tsx', async (orig) => ({ ...(await orig<typeof import('@/text/runtime.tsx')>()), TextProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/features/warehouses/WarehouseSync.tsx', () => ({ WarehouseSync: () => null }));
vi.mock('@/builder/runtime.tsx', () => ({ PAGES_QUERY: { staleTime: 0, retry: false }, pageSetQueryFn: () => async () => null, pagesKey: (l: string) => ['pages', l] }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => true }));

const { memory } = vi.hoisted(() => ({ memory: { router: null as unknown } }));
vi.mock('@/app/router.tsx', () => ({ get router() { return memory.router; } }));

import { App } from '@/app/App.tsx';
import { Guard } from '@/app/guards.tsx';
import { queryClient } from '@/lib/query-client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';

function Here() {
  const l = useLocation();
  return <p data-testid="here">{l.pathname + l.search}</p>;
}

beforeEach(() => {
  queryClient.clear();
  useSessionStore.setState({ token: null, customer: null });
  // The Mini App opened straight on the order page: one history entry, nothing before it.
  memory.router = createMemoryRouter(
    [
      {
        path: '/account/orders/:ref',
        element: (
          <Guard spec={{ session: true }}>
            <p>the order page</p>
            <Here />
          </Guard>
        ),
      },
      { path: '/login', element: <p>the sign-in page</p> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
    { initialEntries: ['/account/orders/K4M2QP?review=1'] },
  );
});
afterEach(() => {
  cleanup();
  useTelegramAuthStore.getState().setStatus('none');
});

describe('opening the review link inside the Telegram Mini App', () => {
  it('holds the skeleton while Telegram sign-in is pending, then lands on the order page with ?review=1 intact, never on login', async () => {
    useTelegramAuthStore.getState().setStatus('pending');
    render(<App />);
    // Settings arrive, but the app is held until the sign-in answers.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText('the sign-in page')).toBeNull();
    expect(screen.queryByText('the order page')).toBeNull();

    await act(async () => {
      useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
      useTelegramAuthStore.getState().setStatus('ready');
    });
    await screen.findByText('the order page');
    expect(screen.getByTestId('here').textContent).toBe('/account/orders/K4M2QP?review=1');
    expect(screen.queryByText('the sign-in page')).toBeNull();
  });

  it('a failed Telegram sign-in is the normal guard: the order page asks for sign-in (no review form is shown to a guest)', async () => {
    useTelegramAuthStore.getState().setStatus('pending');
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await act(async () => { useTelegramAuthStore.getState().setStatus('failed', 'no'); });
    await screen.findByText('the sign-in page');
  });
});
