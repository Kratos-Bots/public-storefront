import { useEffect } from 'react';
import { Navigate, Outlet, useParams, type RouteObject } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useEffectiveLayout } from '@/app/layout.ts';
import { Guard } from '@/app/guards.tsx';
import { AccessBoundary, AuthOnlyFrame } from '@/app/AccessBoundary.tsx';
import { TelegramCallbackPage } from '@/features/auth/TelegramCallbackPage.tsx';
import { BuilderRoute } from '@/app/builder-route.tsx';
import { PuckPage, PuckShell } from '@/builder/runtime.tsx';
import { customPageKey, type FixedRouteKey } from '@/builder/types.ts';
import { useUiStore } from '@/stores/ui.ts';

/** Mantine's `md` breakpoint — the point at which the cart becomes a drawer instead of a page. */
const DESKTOP = '(min-width: 62em)';

/** In the list layouts (menu, web app) a product opens as a bottom sheet over the list, so /p/:id becomes /?p=id. */
export function ProductRoute() {
  const layout = useEffectiveLayout();
  const { id } = useParams();
  if (layout !== 'storefront') return <Navigate to={`/?p=${encodeURIComponent(id ?? '')}`} replace />;
  return <PuckPage routeKey="product" />;
}

/**
 * The cart is a page on a phone and a drawer on a desktop — /cart hands off to the
 * drawer there. The web app has no drawer at any width: it is phone-first, and its
 * primary action goes to this page.
 */
export function CartRoute() {
  const layout = useEffectiveLayout();
  // Resolve the match synchronously: with the default deferred read the first render
  // is always `false`, so a desktop visitor sees the cart page flash before the redirect.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  const drawer = desktop && layout !== 'webapp';
  const openPanel = useUiStore((s) => s.open);
  useEffect(() => {
    if (drawer) openPanel('cartOpen');
  }, [drawer, openPanel]);
  if (drawer) return <Navigate to="/" replace />;
  return <PuckPage routeKey="cart" />;
}

/** `/pages/<slug>`: an owner's page if the published set has it; anything else goes home, like the catch-all. */
export function CustomPageRoute() {
  const { slug } = useParams();
  const key = customPageKey(slug);
  return key ? <PuckPage routeKey={key} /> : <Navigate to="/" replace />;
}

const page = (routeKey: FixedRouteKey) => ({ handle: { routeKey }, element: <PuckPage routeKey={routeKey} /> });

/**
 * Every page is a page-builder document (spec §5.1). PuckShell reads the deepest `handle.routeKey`
 * to pick the frame; the guards stay at route level exactly as v0.6.0 had them. The page builder's
 * `/__builder` route comes first, outside the shell.
 */
export const routes: RouteObject[] = [
  // The page builder (spec §6): outside the shell — it renders its own canvas.
  { path: '/__builder/*', element: <BuilderRoute /> },
  // Telegram sign-in's return page: a bare frame, never a builder page, and an auth path so a private shop shows it.
  {
    path: '/auth/telegram/callback',
    element: (
      <AccessBoundary>
        <AuthOnlyFrame>
          <Outlet />
        </AuthOnlyFrame>
      </AccessBoundary>
    ),
    children: [{ index: true, element: <TelegramCallbackPage /> }],
  },
  {
    path: '/',
    element: (
      <AccessBoundary>
        <PuckShell />
      </AccessBoundary>
    ),
    children: [
      { index: true, ...page('catalog') },
      { path: 'c/:categorySlug', ...page('catalog') },
      { path: 'p/:id', handle: { routeKey: 'product' }, element: <ProductRoute /> },
      {
        path: 'cart',
        handle: { routeKey: 'cart' },
        element: (
          <Guard spec={{ feature: 'ordering' }}>
            <CartRoute />
          </Guard>
        ),
      },
      {
        path: 'checkout',
        handle: { routeKey: 'checkout' },
        element: (
          <Guard spec={{ feature: 'ordering', sessionOrGuest: true }}>
            <PuckPage routeKey="checkout" />
          </Guard>
        ),
      },
      {
        path: 'login',
        handle: { routeKey: 'login' },
        element: (
          <Guard spec={{ feature: 'accounts' }}>
            <PuckPage routeKey="login" />
          </Guard>
        ),
      },
      {
        path: 'reset-password',
        handle: { routeKey: 'reset-password' },
        element: (
          <Guard spec={{ feature: 'accounts' }}>
            <PuckPage routeKey="reset-password" />
          </Guard>
        ),
      },
      {
        path: 'verify-email',
        handle: { routeKey: 'verify-email' },
        element: (
          <Guard spec={{ session: true }}>
            <PuckPage routeKey="verify-email" />
          </Guard>
        ),
      },
      {
        path: 'account',
        element: (
          <Guard spec={{ session: true }}>
            <Outlet />
          </Guard>
        ),
        children: [
          { index: true, element: <Navigate to="/account/orders" replace /> },
          { path: 'orders', ...page('account.orders') },
          { path: 'orders/:ref', ...page('account.order') },
          { path: 'loyalty', ...page('account.loyalty') },
          { path: 'referrals', ...page('account.referrals') },
          { path: 'profile', ...page('account.profile') },
        ],
      },
      // Reached from a chat link: its default document says chrome: 'none', so PuckShell
      // renders v0.6.0's Chromeless frame around it.
      { path: 'order/:ref/:accessKey', ...page('order-status') },
      { path: 'payment/success', ...page('payment-success') },
      { path: 'payment/cancel', ...page('payment-cancel') },
      { path: 'order-placed', ...page('order-placed') },
      {
        path: 'verify',
        handle: { routeKey: 'verify' },
        element: (
          <Guard spec={{ feature: 'verify' }}>
            <PuckPage routeKey="verify" />
          </Guard>
        ),
      },
      {
        path: 'tracking',
        handle: { routeKey: 'tracking' },
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <PuckPage routeKey="tracking" />
          </Guard>
        ),
      },
      {
        path: 'tracking/:reference',
        handle: { routeKey: 'tracking' },
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <PuckPage routeKey="tracking" />
          </Guard>
        ),
      },
      { path: 'pages/:slug', handle: { routeKey: 'page' }, element: <CustomPageRoute /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
