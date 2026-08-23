import { lazy, useEffect } from 'react';
import { createBrowserRouter, Navigate, useParams } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useSettings } from '@/app/settings.ts';
import { Guard } from '@/app/guards.tsx';
import { StorefrontShell } from '@/layouts/StorefrontShell.tsx';
import { MenuShell } from '@/layouts/MenuShell.tsx';
import { Chromeless } from '@/layouts/Chromeless.tsx';
import { useUiStore } from '@/stores/ui.ts';

const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage.tsx').then((m) => ({ default: m.CatalogPage })));
const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage.tsx').then((m) => ({ default: m.ProductDetailPage })));
const CartPage = lazy(() => import('@/features/cart/CartPage.tsx').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage.tsx').then((m) => ({ default: m.CheckoutPage })));
const LoginPage = lazy(() => import('@/features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const AccountLayout = lazy(() => import('@/features/account/AccountLayout.tsx').then((m) => ({ default: m.AccountLayout })));
const OrdersPage = lazy(() => import('@/features/account/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import('@/features/account/OrderDetailPage.tsx').then((m) => ({ default: m.OrderDetailPage })));
const LoyaltyPage = lazy(() => import('@/features/account/LoyaltyPage.tsx').then((m) => ({ default: m.LoyaltyPage })));
const ReferralsPage = lazy(() => import('@/features/account/ReferralsPage.tsx').then((m) => ({ default: m.ReferralsPage })));
const ProfilePage = lazy(() => import('@/features/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const OrderStatusPage = lazy(() => import('@/features/order-status/OrderStatusPage.tsx').then((m) => ({ default: m.OrderStatusPage })));
const PaymentSuccessPage = lazy(() => import('@/features/payment-redirect/PaymentSuccessPage.tsx').then((m) => ({ default: m.PaymentSuccessPage })));
const PaymentCancelPage = lazy(() => import('@/features/payment-redirect/PaymentCancelPage.tsx').then((m) => ({ default: m.PaymentCancelPage })));
const OrderPlacedPage = lazy(() => import('@/features/payment-redirect/OrderPlacedPage.tsx').then((m) => ({ default: m.OrderPlacedPage })));
const VerifyPage = lazy(() => import('@/features/verify/VerifyPage.tsx').then((m) => ({ default: m.VerifyPage })));
const TrackingPage = lazy(() => import('@/features/tracking/TrackingPage.tsx').then((m) => ({ default: m.TrackingPage })));

/** Mantine's `md` breakpoint — the point at which the cart becomes a drawer instead of a page. */
const DESKTOP = '(min-width: 62em)';

/** The client picks the shell; both render an <Outlet/> so the route tree below is shared. */
function ShellSwitch() {
  const { features } = useSettings();
  return features.layout === 'menu' ? <MenuShell /> : <StorefrontShell />;
}

/** In the menu layout a product opens as a bottom sheet over the list, so /p/:id becomes /?p=id. */
function ProductRoute() {
  const { features } = useSettings();
  const { id } = useParams();
  if (features.layout === 'menu') return <Navigate to={`/?p=${encodeURIComponent(id ?? '')}`} replace />;
  return <ProductDetailPage />;
}

/** The cart is a page on a phone and a drawer on a desktop — /cart hands off to the drawer there. */
function CartRoute() {
  // Resolve the match synchronously: with the default deferred read the first render
  // is always `false`, so a desktop visitor sees CartPage flash before the redirect.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  const openPanel = useUiStore((s) => s.open);
  useEffect(() => {
    if (desktop) openPanel('cartOpen');
  }, [desktop, openPanel]);
  if (desktop) return <Navigate to="/" replace />;
  return <CartPage />;
}

export const router = createBrowserRouter([
  {
    // Reached from a chat link, not from browsing — no shop chrome.
    element: <Chromeless />,
    children: [{ path: '/order/:ref/:accessKey', element: <OrderStatusPage /> }],
  },
  {
    path: '/',
    element: <ShellSwitch />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'c/:categorySlug', element: <CatalogPage /> },
      { path: 'p/:id', element: <ProductRoute /> },
      {
        path: 'cart',
        element: (
          <Guard spec={{ feature: 'ordering' }}>
            <CartRoute />
          </Guard>
        ),
      },
      {
        path: 'checkout',
        element: (
          <Guard spec={{ feature: 'ordering', sessionOrGuest: true }}>
            <CheckoutPage />
          </Guard>
        ),
      },
      {
        path: 'login',
        element: (
          <Guard spec={{ feature: 'accounts' }}>
            <LoginPage />
          </Guard>
        ),
      },
      {
        path: 'account',
        element: (
          <Guard spec={{ session: true }}>
            <AccountLayout />
          </Guard>
        ),
        children: [
          { index: true, element: <Navigate to="/account/orders" replace /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:ref', element: <OrderDetailPage /> },
          { path: 'loyalty', element: <LoyaltyPage /> },
          { path: 'referrals', element: <ReferralsPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      { path: 'payment/success', element: <PaymentSuccessPage /> },
      { path: 'payment/cancel', element: <PaymentCancelPage /> },
      { path: 'order-placed', element: <OrderPlacedPage /> },
      {
        path: 'verify',
        element: (
          <Guard spec={{ feature: 'verify' }}>
            <VerifyPage />
          </Guard>
        ),
      },
      {
        path: 'tracking',
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <TrackingPage />
          </Guard>
        ),
      },
      {
        path: 'tracking/:reference',
        element: (
          <Guard spec={{ feature: 'tracking' }}>
            <TrackingPage />
          </Guard>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
