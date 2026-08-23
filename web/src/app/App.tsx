import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { useSettings, useSettingsQuery } from '@/app/settings.ts';
import { closedGate } from '@/app/closed-gate.ts';
import { applyDocumentTheme, buildMantineTheme, THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import { router } from '@/app/router.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { ClosedPage } from '@/features/closed/ClosedPage.tsx';
import { fetchCart } from '@/api/cart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import classes from '@/app/App.module.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

/** The last brand name we saw, so the retry screen can still name the shop. */
function lastKnownBrandName(): string | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { brand?: { name?: unknown } };
    return typeof parsed.brand?.name === 'string' && parsed.brand.name ? parsed.brand.name : null;
  } catch {
    return null;
  }
}

/**
 * The scheme the first-paint script restored, so the boot screens match the palette
 * already on the page. No attribute (first-ever visit) means the built-in dark default.
 */
function bootColorScheme(): 'light' | 'dark' {
  try {
    return document.documentElement.getAttribute('data-mantine-color-scheme') === 'light'
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * A returning customer's server cart is the source of truth, and admin Live Carts
 * mirror it — so a boot with a token adopts the server cart. A failure is silent:
 * the api client already clears the session on 401 and the local cart stands in.
 */
function useBootCart() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!useSessionStore.getState().token) return;
    void fetchCart()
      .then((cart) => useCartStore.getState().replaceFromServer(cart))
      .catch(() => undefined);
  }, []);
}

function ClosedGate({ children }: { children: ReactNode }) {
  const closed = closedGate((s) => s.closed);
  const settings = useSettings();
  return closed || !settings.enabled ? <ClosedPage /> : <>{children}</>;
}

function ThemedApp({ settings }: { settings: StorefrontSettings }) {
  const { theme, brand } = settings;
  // One key for both objects: the document only needs re-theming when their content
  // changes, not on every settings refetch.
  const themeKey = JSON.stringify({ theme, brand });
  useEffect(() => {
    applyDocumentTheme(theme, brand);
  }, [themeKey]);
  const mantineTheme = useMemo(() => buildMantineTheme(theme), [theme]);

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={theme.scheme}>
      <Notifications position="top-center" />
      <ClosedGate>
        <RouterProvider router={router} />
      </ClosedGate>
    </MantineProvider>
  );
}

function SettingsBoundary() {
  const query = useSettingsQuery();
  useBootCart();

  if (query.data) return <ThemedApp settings={query.data} />;

  if (query.isError) {
    const name = lastKnownBrandName();
    return (
      <MantineProvider forceColorScheme={bootColorScheme()}>
        <div className={classes.boot}>
          <EmptyState
            eyebrow="Connection"
            title={name ? `We can't reach ${name}` : "We can't reach the shop"}
            description="Check your connection and try again."
            action={
              <Button variant="default" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider forceColorScheme={bootColorScheme()}>
      <PageSkeleton />
    </MantineProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsBoundary />
    </QueryClientProvider>
  );
}
