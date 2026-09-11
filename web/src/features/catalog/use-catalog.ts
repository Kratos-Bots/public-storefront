import { useQuery } from '@tanstack/react-query';
import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';
import { useSessionStore } from '@/stores/session.ts';

export const CATALOG_KEY = ['catalog'] as const;

/**
 * Whose catalog this is: the logged-in customer's id, or null for the public
 * one. It is part of every catalog query key, so logging in, out, or in as
 * someone else refetches instead of reusing another audience's cached catalog
 * (group rules and group prices differ per customer). An expired token 401s,
 * the API client clears the session, the audience flips to null, and the
 * public catalog loads.
 */
function useCatalogAudience(): number | null {
  return useSessionStore((s) => (s.token !== null ? (s.customer?.id ?? 0) : null));
}

export function useCatalog() {
  const audience = useCatalogAudience();
  return useQuery({
    queryKey: [...CATALOG_KEY, audience] as const,
    queryFn: () => fetchCatalog(audience !== null),
    staleTime: 60_000,
  });
}

/**
 * One product. Takes `null` for "nothing selected" so the menu layout's detail
 * sheet can hold the hook while it is closed — an unparsed `?p=` fetches nothing
 * rather than requesting `/products/NaN`.
 */
export function useProduct(id: number | null) {
  const audience = useCatalogAudience();
  return useQuery({
    queryKey: ['product', id, audience] as const,
    queryFn: () => fetchProduct(id as number, audience !== null),
    enabled: id !== null && Number.isFinite(id),
  });
}
