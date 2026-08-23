import { create } from 'zustand';

export const closedGate = create<{ closed: boolean; setClosed: (v: boolean) => void }>((set) => ({
  closed: false,
  setClosed: (closed) => set({ closed }),
}));

// Flat routes a shopper can land on mid-checkout or from a chat link — a
// hosted-checkout redirect, a chat-settled order handoff, or a shared order
// URL. All three read from endpoints that stay up during the kill switch
// (`/api/orders/*`), and the visitor is already holding the link, so trading
// it for `ClosedPage` would strand someone who has money in flight or is only
// there to check a delivery. `/order` alone (no reference) and `/orders`
// (no such route) are deliberately excluded — only a link with something to
// look up is exempt.
const EXEMPT_EXACT_PATHS = ['/payment/success', '/payment/cancel', '/order-placed'];
const EXEMPT_PREFIX = '/order/';

/** Tolerate exactly one trailing slash (`/payment/success/`) without opening up a prefix match. */
function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Whether `pathname` is one of the routes `ClosedGate` must never swap for
 * `ClosedPage`, kill switch or not. `ClosedGate` renders above the router, so
 * it can't call `useLocation()` — it reads `window.location.pathname` at
 * render time and passes it through this pure check instead.
 */
export function isClosedExemptPath(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname);
  return EXEMPT_EXACT_PATHS.includes(normalized) || normalized.startsWith(EXEMPT_PREFIX);
}
