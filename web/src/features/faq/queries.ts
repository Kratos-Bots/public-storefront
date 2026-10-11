import { useQuery } from '@tanstack/react-query';
import { fetchFaq } from '@/api/faq.ts';

export const FAQ_KEY = ['faq'] as const;

/** The FAQ sections. `enabled` is the shop's own "has an FAQ" flag: while it is off nothing is asked for. */
export function useFaq(enabled: boolean) {
  return useQuery({ queryKey: FAQ_KEY, queryFn: fetchFaq, staleTime: 60_000, enabled });
}
