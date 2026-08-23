import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { fetchCart, putCart } from '@/api/cart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import type { Product } from '@/types/catalog.ts';
import type { CartLineInput, ServerCart, ServerCartLine } from '@/types/cart.ts';

/** How long a burst of stepper taps is gathered before it becomes one PUT. */
export const SYNC_DEBOUNCE_MS = 400;

/**
 * The last cart the server sent back, kept beside the local lines because
 * `replaceFromServer` deliberately drops the per-line flags when it maps a
 * `ServerCartLine` onto a `LocalLine` — this is where `issues` comes from.
 *
 * It lives at module scope, not in the hook, for two reasons: the debounce
 * timer has to outlive the component that started it (a shopper who edits a
 * quantity and navigates away would otherwise lose the write, and the admin's
 * Live Carts would show a cart the shopper no longer has), and the writers
 * below have to be callable from a card's quick-add without that card
 * subscribing to sync state it never renders.
 */
interface SyncState {
  cart: ServerCart | null;
  syncing: boolean;
}

const syncStore = create<SyncState>()(() => ({ cart: null, syncing: false }));

let timer: ReturnType<typeof setTimeout> | null = null;
/** Set from the moment an edit is scheduled until its PUT goes out. */
let pendingWrite = false;
/** Latest-wins: a response only lands if its ticket is still the newest issued. */
let ticketSeq = 0;

function serverMode(): boolean {
  return useCartStore.getState().mode === 'server';
}

function outgoingLines(): CartLineInput[] {
  return useCartStore
    .getState()
    .lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
}

function adopt(cart: ServerCart) {
  useCartStore.getState().replaceFromServer(cart);
  syncStore.setState({ cart });
}

/** Pull the server's copy and make it the truth. Silent — a reconcile, not an action. */
async function resync(): Promise<void> {
  const ticket = ++ticketSeq;
  try {
    const cart = await fetchCart();
    if (ticket === ticketSeq) adopt(cart);
  } catch {
    /* Leave the optimistic lines standing; the next edit tries again. */
  }
}

/** Send the whole cart now, cancelling any write that was still waiting its turn. */
async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pendingWrite = false;
  if (!serverMode()) return;

  const ticket = ++ticketSeq;
  syncStore.setState({ syncing: true });
  try {
    const cart = await putCart(outgoingLines());
    if (ticket === ticketSeq) adopt(cart);
  } catch (err) {
    if (ticket !== ticketSeq) return;
    if (err instanceof ApiError && err.isUnauthorized) {
      // The api client has already cleared the session. Keep the lines and carry
      // on as a guest cart — nothing the shopper picked out is lost.
      useCartStore.getState().setMode('local');
      syncStore.setState({ cart: null });
      notifications.show({ message: 'Please sign in again', color: 'red' });
      return;
    }
    notifications.show({
      message: errorMessage(err, "We couldn't update your cart"),
      color: 'red',
    });
    await resync();
  } finally {
    if (ticket === ticketSeq) syncStore.setState({ syncing: false });
  }
}

/**
 * Adopt the server's cart. An edit still sitting in the debounce window is sent
 * first — its response *is* the fresh cart, and fetching around it would hand
 * back the copy from before the edit and undo it.
 */
async function refreshCart(): Promise<void> {
  if (!serverMode()) return;
  if (pendingWrite) {
    await flush();
    return;
  }
  await resync();
}

function schedule() {
  if (!serverMode()) return;
  pendingWrite = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, SYNC_DEBOUNCE_MS);
}

// The cart's write path. Every mutation goes through one of these three: they
// apply the edit to the local store immediately, so no control ever waits on
// the network, then schedule the mirror. Exported as plain functions so a
// product card's quick-add can call one without subscribing to sync state.

export function addToCart(product: Product, quantity = 1) {
  useCartStore.getState().add(product, quantity);
  schedule();
}

export function setCartQuantity(productId: number, quantity: number) {
  useCartStore.getState().setQuantity(productId, quantity);
  schedule();
}

export function removeFromCart(productId: number) {
  useCartStore.getState().remove(productId);
  schedule();
}

/** Drop the pending write and the server snapshot — for logout, and for tests. */
export function resetCartSync() {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingWrite = false;
  ticketSeq = 0;
  syncStore.setState({ cart: null, syncing: false });
}

export interface ServerCartControls {
  mode: 'local' | 'server';
  /** A write is in the air — for a quiet progress mark, never for disabling the stepper. */
  isSyncing: boolean;
  /** Lines the server flagged: inactive, out of stock, or repriced since they were added. */
  issues: ServerCartLine[];
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  /** Send any pending edit immediately — call before leaving for checkout. */
  sync: () => Promise<void>;
  /** Adopt the server's cart. Called when the cart is opened in server mode. */
  refresh: () => Promise<void>;
}

/**
 * The cart's write path, plus what the server had to say about it. Every edit
 * is applied to the local store first so the stepper never waits on the
 * network, then mirrored to `PUT /cart` on a 400 ms debounce; the response
 * replaces the local lines, so the server always has the last word on price
 * and availability.
 *
 * In `local` mode (a guest) it is a thin wrapper over the store and touches no
 * network at all.
 */
export function useServerCart(): ServerCartControls {
  const mode = useCartStore((s) => s.mode);
  const cart = syncStore((s) => s.cart);
  const syncing = syncStore((s) => s.syncing);

  // A guest cart has no server snapshot to explain, so a logout must not leave
  // the previous session's flags hanging off the lines.
  useEffect(() => {
    if (mode === 'local' && syncStore.getState().cart) syncStore.setState({ cart: null });
  }, [mode]);

  const issues = useMemo(
    () =>
      mode === 'server'
        ? (cart?.items ?? []).filter((i) => i.inactive || i.outOfStock || i.priceChanged)
        : [],
    [mode, cart],
  );

  return useMemo(
    () => ({
      mode,
      isSyncing: syncing,
      issues,
      add: addToCart,
      setQuantity: setCartQuantity,
      remove: removeFromCart,
      sync: flush,
      refresh: refreshCart,
    }),
    [mode, syncing, issues],
  );
}
