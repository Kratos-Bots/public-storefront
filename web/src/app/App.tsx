import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { SETTINGS_KEY, useSettings, useSettingsQuery } from '@/app/settings.ts';
import { closedGate, isClosedExemptPath } from '@/app/closed-gate.ts';
import { BUILDER_PATH, isBuilderMode } from '@/app/builder-gate.ts';
import { buildMantineTheme, lastKnownBrandName } from '@/app/theme-bridge.ts';
import { useDocumentTheme } from '@/app/document-theme.ts';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { TextProvider, useText } from '@/text/runtime.tsx';
import { router } from '@/app/router.tsx';
import { effectiveLayout } from '@/app/layout.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { PAGES_QUERY, pageSetQueryFn, pagesKey } from '@/builder/runtime.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { ClosedPage } from '@/features/closed/ClosedPage.tsx';
import { fetchCart } from '@/api/cart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import classes from '@/app/App.module.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

/** How often a closed shop re-checks whether it has reopened (spec §6). */
export const CLOSED_POLL_MS = 60_000;

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
    // The builder runs on fixtures; the admin's own shopper cart must not be fetched into it.
    if (isBuilderMode()) return;
    // Inside Telegram the sign-in adopts the right cart itself (telegram-session.ts);
    // fetching here too would race it with whatever token was stored before launch.
    if (useTelegramAuthStore.getState().status !== 'none') return;
    if (!useSessionStore.getState().token) return;
    void fetchCart()
      .then((cart) => useCartStore.getState().replaceFromServer(cart))
      .catch(() => undefined);
  }, []);
}

/**
 * Whether ClosedGate is showing the closed page instead of the router. Read at render time, not
 * via useLocation — ClosedGate sits above RouterProvider, so it has no router context of its own.
 */
function useShowsClosedPage(enabled: boolean): boolean {
  const closed = closedGate((s) => s.closed);
  // The owner may build pages while the shop is closed (e.g. before launch).
  const exempt = isClosedExemptPath(window.location.pathname) || isBuilderMode();
  return (closed || !enabled) && !exempt;
}

export function ClosedGate({ children }: { children: ReactNode }) {
  const closed = closedGate((s) => s.closed);
  const settings = useSettings();
  const client = useQueryClient();

  // A mid-session 503 flips the gate while the cached settings still say `enabled: true`,
  // so settings.ts's own refetchInterval — which keys off that cache — never fires and the
  // tab would sit here forever. Poll from the gate instead; the settings queryFn clears
  // `closed` as soon as a response comes back enabled, so the shop returns on its own.
  useEffect(() => {
    if (!closed) return;
    const timer = setInterval(() => {
      void client.invalidateQueries({ queryKey: SETTINGS_KEY });
    }, CLOSED_POLL_MS);
    return () => clearInterval(timer);
  }, [closed, client]);

  // Read at render time, not via useLocation — ClosedGate sits above
  // RouterProvider, so it has no router context of its own. This means a
  // client-side navigation into an exempt route while already closed won't
  // un-gate until something else re-renders ClosedGate (a settings refetch,
  // the poll above); landing on one directly — a fresh load, a pasted link,
  // the payment gateway's own redirect — always works.
  const showsClosed = useShowsClosedPage(Boolean(settings.enabled));
  return showsClosed ? <ClosedPage /> : <>{children}</>;
}

/**
 * The page set rides alongside the template chunk: the layout is only known once settings are in,
 * and TemplateProvider may still be holding the router back on its fallback. PuckShell/PuckPage
 * then find the same query (same key, same layout rule) already in flight.
 */
export function usePrefetchPageSet(settings: StorefrontSettings): void {
  const client = useQueryClient();
  const layout = effectiveLayout(settings.features?.layout, isTelegramWebApp());
  // Nobody reads the set behind the closed page, nor in the builder, which injects a draft.
  // Only an explicit `enabled: false` closes the shop here — the gate itself decides the rest.
  const skip = useShowsClosedPage(settings.enabled !== false) || window.location.pathname.startsWith(BUILDER_PATH) || isBuilderMode();
  useEffect(() => {
    if (skip) return;
    void client.prefetchQuery({ queryKey: pagesKey(layout), queryFn: pageSetQueryFn(client, layout), staleTime: PAGES_QUERY.staleTime, retry: PAGES_QUERY.retry });
  }, [client, layout, skip]);
}

function ThemedApp({ settings }: { settings: StorefrontSettings }) {
  const resolved = useDocumentTheme(settings);
  const mantineTheme = useMemo(() => buildMantineTheme(resolved), [resolved]);

  usePrefetchPageSet(settings);

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={resolved.scheme}>
      <TemplateProvider resolved={resolved} fallback={<PageSkeleton />}>
        <Notifications position="top-center" />
        <TextProvider>
          <ClosedGate>
            <RouterProvider router={router} />
          </ClosedGate>
        </TextProvider>
      </TemplateProvider>
    </MantineProvider>
  );
}

function SettingsBoundary() {
  const query = useSettingsQuery();
  const telegramPending = useTelegramAuthStore((s) => s.status === 'pending');
  // Renders above TextProvider, so this is always the built-in English (boot.* keys are fixed).
  const { t } = useText();
  useBootCart();

  if (query.data && !telegramPending) return <ThemedApp settings={query.data} />;

  if (query.isError) {
    const name = lastKnownBrandName();
    return (
      <MantineProvider forceColorScheme={bootColorScheme()}>
        <div className={classes.boot}>
          <EmptyState
            eyebrow={t('boot.eyebrow')}
            title={name ? t('boot.titleNamed', { shop: name }) : t('boot.title')}
            description={t('boot.description')}
            action={
              <Button variant="default" size="sm" onClick={() => void query.refetch()}>
                {t('boot.retry')}
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
