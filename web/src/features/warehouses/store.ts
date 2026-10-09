import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { queryClient, SETTINGS_KEY } from '@/lib/query-client.ts';
import { accessOf } from '@/app/access.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Warehouse } from '@/types/warehouses.ts';

/**
 * The shopper's warehouse choice (STOREFRONT.md §3.8b).
 *
 * `warehouseId` is the only persisted field: `null` is "the shop's default warehouse" and is what
 * every shopper has until they choose another. Everything under `ctx` is session-scoped context that
 * `WarehouseSync` pushes in (the feature flag, the fetched list), so plain modules - the cart's sync
 * code, the checkout API - can ask `currentWarehouseId()` without a React tree or a QueryClient.
 *
 * THE INVARIANT: `selectedWarehouseId` is `null` unless the feature is on, the list has at least two
 * entries and the stored id is one of the non-default ones. Every request builder sends a warehouse
 * only when this is non-null, so with the feature off (or a single warehouse) no request, query key
 * or cache key differs from what it was before warehouses existed.
 */
export interface WarehouseContext {
  /** Whether the shopper-facing feature applies to this visitor. `null` = not pushed yet (see `warehouseEnabled`). */
  enabled: boolean | null;
  /** The fetched list, or `null` while it is loading / not asked for. */
  list: Warehouse[] | null;
  /** The list request failed: the choice is ignored (default warehouse) until it succeeds. */
  failed: boolean;
  /** Ids the selected warehouse carries, once its catalogue has loaded; `null` otherwise. */
  carried: ReadonlySet<number> | null;
}

export const EMPTY_CONTEXT: WarehouseContext = { enabled: null, list: null, failed: false, carried: null };

interface WarehouseState {
  warehouseId: number | null;
  ctx: WarehouseContext;
  /** Store a choice. `null` (or the default warehouse's id, which the caller maps to null) = the default. */
  choose: (id: number | null) => void;
  setContext: (ctx: Partial<WarehouseContext>) => void;
}

/**
 * localStorage that never writes the "no choice" default into an empty slot. `persist` rewrites the key on
 * EVERY state change, and `ctx` changes on every page load; without this a shop that does not use warehouses at
 * all would still gain an `sf-warehouse-v1` key (and the page builder, which must never touch real storage, would
 * trip over it). A real choice - and clearing one - still writes.
 */
const choiceStorage = createJSONStorage<{ warehouseId: number | null }>(() => ({
  getItem: (name) => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    try {
      const empty = (JSON.parse(value) as { state?: { warehouseId?: unknown } }).state?.warehouseId == null;
      if (empty && localStorage.getItem(name) === null) return;
      localStorage.setItem(name, value);
    } catch { /* private mode: the choice then lasts the session only */ }
  },
  removeItem: (name) => {
    try { localStorage.removeItem(name); } catch { /* ignore */ }
  },
}));

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set) => ({
      warehouseId: null,
      ctx: EMPTY_CONTEXT,
      choose: (id) => set({ warehouseId: id }),
      setContext: (ctx) => set((s) => ({ ctx: { ...s.ctx, ...ctx } })),
    }),
    {
      name: 'sf-warehouse-v1',
      storage: choiceStorage,
      partialize: (s) => ({ warehouseId: s.warehouseId }),
      // A hand-edited or corrupt value must not become a query parameter.
      merge: (persisted, current) => {
        const id = (persisted as { warehouseId?: unknown } | undefined)?.warehouseId;
        return { ...current, warehouseId: typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null };
      },
    },
  ),
);

/** Whether the feature applies, from a settings snapshot: the flag, and a shop that may be browsed (the list is session-gated in a private shop). */
export function warehouseFeatureOn(settings: Pick<StorefrontSettings, 'features' | 'access'> | undefined, signedIn: boolean): boolean {
  if (!settings || settings.features?.warehouseSelect !== true) return false;
  return signedIn || accessOf(settings).storefront === 'public';
}

/** `ctx.enabled` once pushed; before that, the same answer read straight off the cached settings. */
export function warehouseEnabled(ctx: WarehouseContext): boolean {
  if (ctx.enabled !== null) return ctx.enabled;
  return warehouseFeatureOn(queryClient.getQueryData<StorefrontSettings>(SETTINGS_KEY), useSessionStore.getState().token !== null);
}

/** The rules, as a pure function of the pieces (exported for tests). */
export function resolveWarehouse(
  stored: number | null,
  enabled: boolean,
  list: Warehouse[] | null,
  failed: boolean,
): number | null {
  if (!enabled || stored === null || failed) return null;
  // The list has not arrived yet: use the stored choice optimistically (the flag is on, and the
  // backend falls back to the default for an id it does not offer), so a returning shopper's
  // catalogue is fetched once, for their warehouse, instead of twice.
  if (list === null) return stored;
  if (list.length < 2) return null;
  const chosen = list.find((w) => w.id === stored);
  return chosen && !chosen.isDefault ? chosen.id : null;
}

/** The warehouse every request should carry, or `null` for "send nothing". Selector-shaped: usable in a hook or on `getState()`. */
export function selectedWarehouseId(s: Pick<WarehouseState, 'warehouseId' | 'ctx'>): number | null {
  return resolveWarehouse(s.warehouseId, warehouseEnabled(s.ctx), s.ctx.list, s.ctx.failed);
}

/** For code outside React (cart sync, checkout API, the editor's pickers). */
export const currentWarehouseId = (): number | null => selectedWarehouseId(useWarehouseStore.getState());

/** Test seam: forget the choice and the pushed context. */
export function resetWarehouseStore(): void {
  useWarehouseStore.setState({ warehouseId: null, ctx: EMPTY_CONTEXT });
}
