import { useQuery } from '@tanstack/react-query';
import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';

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

/** The catalog query key for an audience; outside React, read the audience with `catalogAudience(useSessionStore.getState())`. */
export const catalogKey = (audience: number | null) => [...CATALOG_KEY, audience] as const;

function useCatalogAudience(): number | null {
  return useSessionStore(catalogAudience);
}

export function useCatalog() {
  const audience = useCatalogAudience();
  // A non-public shop refuses the anonymous catalogue (401 LOGIN_REQUIRED); do not ask.
  const open = accessOf(useSettings()).storefront === 'public';
  return useQuery({
    queryKey: catalogKey(audience),
    queryFn: () => fetchCatalog(audience !== null),
    staleTime: 60_000,
    enabled: audience !== null || open,
  });
}

/**
 * One product. Takes `null` for "nothing selected" so the menu layout's detail
 * sheet can hold the hook while it is closed — an unparsed `?p=` fetches nothing
 * rather than requesting `/products/NaN`.
 */
export function useProduct(id: number | null) {
  const audience = useCatalogAudience();
  // A non-public shop refuses the anonymous catalogue (401 LOGIN_REQUIRED); do not ask.
  const open = accessOf(useSettings()).storefront === 'public';
  return useQuery({
    queryKey: ['product', id, audience] as const,
    queryFn: () => fetchProduct(id as number, audience !== null),
    enabled: id !== null && Number.isFinite(id) && (audience !== null || open),
  });
}
