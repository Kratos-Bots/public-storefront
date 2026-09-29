import type { QueryClient } from '@tanstack/react-query';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { notifications } from '@mantine/notifications';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useSessionStore, type SessionCustomer } from '@/stores/session.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import { FIXTURE_CART_LINES, FIXTURE_CUSTOMER, FIXTURE_TOKEN } from '@/builder/editor/fixtures.ts';

export const PREVIEW_ONLY_MESSAGE = 'Preview only — nothing was sent.';

export function notifyPreviewOnly(): void {
  notifications.show({ id: 'sf-builder-preview-only', message: PREVIEW_ONLY_MESSAGE });
}

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** A Web Storage that lives and dies with the editor frame. */
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  [name: string]: unknown;
  get length(): number {
    return this.#map.size;
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#map.get(String(key)) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(String(key), String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(String(key));
  }
  clear(): void {
    this.#map.clear();
  }
}

/**
 * Every other storage writer in the shopper code (saved order links, the checkout form, dismissed
 * notices, Mantine's colour scheme, the theme payload) reads the global at call time, so shadowing
 * the globals catches them all — including ones added later. The shopper's real values are never
 * read either: the frame starts from empty storage.
 */
function isolateWebStorage(): void {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const memory = new MemoryStorage();
    for (const target of new Set<object>([window, globalThis])) {
      try {
        Object.defineProperty(target, name, { configurable: true, enumerable: true, get: () => memory });
      } catch {
        // A non-configurable global: the per-store swaps below still hold for session and cart.
      }
    }
  }
}

let entered = false;

/**
 * The editor frame shares the live shop's origin, so the persisted stores would otherwise write
 * fixture sessions and carts into the admin's own storage for that shop. From here on they
 * persist to memory, and every action a block can trigger is inert.
 */
export function enterFixtureMode(): void {
  if (entered) return;
  if (!isBuilderMode()) throw new Error('enterFixtureMode is only available in builder mode');
  entered = true;
  // The zustand stores captured the real localStorage when they were created: swap them first,
  // so not even the neutralising setState calls below reach it.
  useSessionStore.persist.setOptions({
    storage: createJSONStorage<{ token: string | null; customer: SessionCustomer | null }>(memoryStorage),
  });
  useCartStore.persist.setOptions({ storage: createJSONStorage<{ lines: LocalLine[] }>(memoryStorage) });
  isolateWebStorage();
  // clear() is also what the api client calls on any 401 — a fixture 401 must not sign out.
  // The admin's own stored shopper (hydrated at boot) is dropped, never shown or sent.
  useSessionStore.setState({
    token: null, customer: null, returnTo: null,
    setSession: () => undefined, clear: () => undefined, setReturnTo: () => undefined,
  });
  useCartStore.setState({
    lines: [], mode: 'local',
    add: notifyPreviewOnly,
    setQuantity: notifyPreviewOnly,
    remove: notifyPreviewOnly,
    // Silent: OrderPlacedPage and PaymentSuccessPage clear the cart on mount, with no user action.
    // No user-triggered path reaches it here (sign-out returns early, checkout is always refused).
    clear: () => undefined,
    replaceFromServer: () => undefined,
    setMode: () => undefined,
  });
}

/** Queries that hold live, shopper-independent data; everything else is fixture-backed. */
const LIVE_QUERY_ROOTS = new Set(['settings', 'catalog', 'product', 'pages']);

export function applyPreviewAs(p: PreviewAs, client: QueryClient): void {
  // Before enterFixtureMode the stores still persist to the shopper's storage: never write a
  // fixture token there.
  if (!entered) throw new Error('applyPreviewAs needs fixture mode: call enterFixtureMode() first');
  useSessionStore.setState(
    p.session === 'signed-out' ? { token: null, customer: null } : { token: FIXTURE_TOKEN, customer: FIXTURE_CUSTOMER },
  );
  // Always a local cart: a server-mode cart would schedule PUTs on every render path.
  useCartStore.setState({ mode: 'local', lines: p.cart === 'items' ? FIXTURE_CART_LINES.map((l) => ({ ...l })) : [] });
  void client.resetQueries({ predicate: (q) => !LIVE_QUERY_ROOTS.has(String(q.queryKey[0])) });
}
