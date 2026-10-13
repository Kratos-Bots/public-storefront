import { deleteGuestCart, putGuestCart } from '@/api/cart.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';

// Mirrors a guest's cart to the backend so the shop's admin can see it in Live Carts. One-way and
// silent: localStorage stays the guest's cart, the response is never read, and a failure changes
// nothing on screen. A signed-in cart has its own two-way sync in useServerCart.ts.

/** Same gathering window as the signed-in cart's writes. */
export const GUEST_SYNC_DEBOUNCE_MS = 400;

/** A guest is a cart in local mode with no session: a signed-in shopper whose cart fell back to local mode
 *  (failed boot fetch, failed merge) has an account cart that is listed already. */
const isGuest = (): boolean => useCartStore.getState().mode === 'local' && !useSessionStore.getState().token;

let timer: ReturnType<typeof setTimeout> | null = null;

async function send(): Promise<void> {
  // Re-checked at send time: the shopper may have signed in during the debounce, and the account
  // cart is now the one that counts.
  if (!isGuest()) return;
  const lines = useCartStore.getState().lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
  try {
    if (lines.length > 0) await putGuestCart(lines);
    else await deleteGuestCart();
  } catch {
    /* The next edit tries again; the mirror expires on its own after a day. */
  }
}

export function scheduleGuestCartSync(): void {
  if (isBuilderMode()) return;
  if (!isGuest()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void send();
  }, GUEST_SYNC_DEBOUNCE_MS);
}

/** For logout and tests: forget a write that has not gone out yet. */
export function resetGuestCartSync(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
