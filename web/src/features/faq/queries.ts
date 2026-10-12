import { useQuery } from '@tanstack/react-query';
import { fetchFaq } from '@/api/faq.ts';
import { ApiError } from '@/lib/errors.ts';
import { useWarehouseId } from '@/features/warehouses/use-warehouse.ts';

export const FAQ_KEY = ['faq'] as const;

/** The FAQ query key. Like the catalogue's: a chosen warehouse is part of it, no choice is exactly the plain key. */
export const faqKey = (warehouse: number | null = null) =>
  (warehouse === null ? FAQ_KEY : [...FAQ_KEY, warehouse]) as readonly unknown[];

/** A shopper who must sign in (401) or is not allowed (403) will not be let in by asking again; anything else gets one retry. */
const retryOther = (failures: number, error: unknown) =>
  !(error instanceof ApiError && (error.status === 401 || error.status === 403)) && failures < 1;

/**
 * The FAQ sections a shopper at the selected warehouse reads. `enabled` is the "has an FAQ" flag (see `useFaqAvailable`):
 * while it is off nothing is asked for. The warehouse travels as `?warehouse=` exactly as the catalogue reads send it.
 */
export function useFaq(enabled: boolean) {
  const warehouse = useWarehouseId();
  return useQuery({
    queryKey: faqKey(warehouse),
    queryFn: () => (warehouse === null ? fetchFaq() : fetchFaq(warehouse)),
    staleTime: 60_000,
    enabled,
    retry: retryOther,
  });
}
