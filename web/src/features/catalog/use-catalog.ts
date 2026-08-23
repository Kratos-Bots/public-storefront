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

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id] as const,
    queryFn: () => fetchProduct(id),
  });
}
