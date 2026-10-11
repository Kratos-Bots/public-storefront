import { useQuery } from '@tanstack/react-query';
import { fetchFaq } from '@/api/faq.ts';
import { ApiError } from '@/lib/errors.ts';

export const FAQ_KEY = ['faq'] as const;

/** A shopper who must sign in (401) or is not allowed (403) will not be let in by asking again; anything else gets one retry. */
const retryOther = (failures: number, error: unknown) =>
  !(error instanceof ApiError && (error.status === 401 || error.status === 403)) && failures < 1;

/** The FAQ sections. `enabled` is the shop's own "has an FAQ" flag: while it is off nothing is asked for. */
export function useFaq(enabled: boolean) {
  return useQuery({ queryKey: FAQ_KEY, queryFn: fetchFaq, staleTime: 60_000, enabled, retry: retryOther });
}
