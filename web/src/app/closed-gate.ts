import { create } from 'zustand';

export const closedGate = create<{ closed: boolean; setClosed: (v: boolean) => void }>((set) => ({
  closed: false,
  setClosed: (closed) => set({ closed }),
}));

// Exactly three flat routes stay up while the shop is closed: the two return pages of a hosted payment and the
// order-placed page. Someone coming back from a payment already in flight must be told what happened, and these
// pages read nothing from the account. The old /order/:ref/:accessKey link is not exempt: it redirects to the
// customer's order page, whose routes answer 503 while the shop is closed, so showing the closed page at once is
// the honest answer (this gate reads the address once, above the router, and would not notice that redirect).
const EXEMPT_EXACT_PATHS = ['/payment/success', '/payment/cancel', '/order-placed'];

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
  return EXEMPT_EXACT_PATHS.includes(normalized);
}
