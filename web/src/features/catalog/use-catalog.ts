import { useQuery } from '@tanstack/react-query';
import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';

export const CATALOG_KEY = ['catalog'] as const;

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: fetchCatalog,
    staleTime: 60_000,
  });
}

/**
 * One product. Takes `null` for "nothing selected" so the menu layout's detail
 * sheet can hold the hook while it is closed — an unparsed `?p=` fetches nothing
 * rather than requesting `/products/NaN`.
 */
export function useProduct(id: number | null) {
  return useQuery({
    queryKey: ['product', id] as const,
    queryFn: () => fetchProduct(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}
