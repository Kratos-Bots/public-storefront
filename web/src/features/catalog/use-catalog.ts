import { useQuery } from '@tanstack/react-query';
import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';
import { useWarehouseId } from '@/features/warehouses/use-warehouse.ts';

export const CATALOG_KEY = ['catalog'] as const;

/**
 * Whose catalog this is: the logged-in customer's id, or null for the public
 * one. It is part of every catalog query key, so logging in, out, or in as
 * someone else refetches instead of reusing another audience's cached catalog
 * (group rules and group prices differ per customer). An expired token 401s,
 * the API client clears the session, the audience flips to null, and the
 * public catalog loads.
 */
export function catalogAudience(s: { token: string | null; customer: { id: number } | null }): number | null {
  return s.token !== null ? (s.customer?.id ?? 0) : null;
}

/**
 * The catalog query key for an audience; outside React, read the audience with `catalogAudience(useSessionStore.getState())`.
 * The shopper's chosen warehouse is part of the key too, so choosing another refetches instead of showing the previous
 * warehouse's stock and product set. With no choice (`null`, the default) the key is exactly the pre-warehouse one.
 */
export const catalogKey = (audience: number | null, warehouse: number | null = null) =>
  (warehouse === null ? [...CATALOG_KEY, audience] : [...CATALOG_KEY, audience, warehouse]) as readonly unknown[];

/** The product query key; same rule as `catalogKey`. */
export const productKey = (id: number | null, audience: number | null, warehouse: number | null = null) =>
  (warehouse === null ? ['product', id, audience] : ['product', id, audience, warehouse]) as readonly unknown[];

function useCatalogAudience(): number | null {
  return useSessionStore(catalogAudience);
}

export function useCatalog(options: { enabled?: boolean } = {}) {
  const audience = useCatalogAudience();
  const warehouse = useWarehouseId();
  // A non-public shop refuses the anonymous catalogue (401 LOGIN_REQUIRED); do not ask.
  const open = accessOf(useSettings()).storefront === 'public';
  return useQuery({
    queryKey: catalogKey(audience, warehouse),
    // The warehouse argument is only passed when one is chosen: no choice calls it exactly as before.
    queryFn: () => (warehouse === null ? fetchCatalog(audience !== null) : fetchCatalog(audience !== null, warehouse)),
    staleTime: 60_000,
    enabled: (options.enabled ?? true) && (audience !== null || open),
  });
}

/**
 * One product. Takes `null` for "nothing selected" so the menu layout's detail
 * sheet can hold the hook while it is closed — an unparsed `?p=` fetches nothing
 * rather than requesting `/products/NaN`.
 */
export function useProduct(id: number | null) {
  const audience = useCatalogAudience();
  const warehouse = useWarehouseId();
  // A non-public shop refuses the anonymous catalogue (401 LOGIN_REQUIRED); do not ask.
  const open = accessOf(useSettings()).storefront === 'public';
  return useQuery({
    queryKey: productKey(id, audience, warehouse),
    queryFn: () => (warehouse === null ? fetchProduct(id as number, audience !== null) : fetchProduct(id as number, audience !== null, warehouse)),
    enabled: id !== null && Number.isFinite(id) && (audience !== null || open),
  });
}
