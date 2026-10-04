import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { fetchUnpaidOrders } from '@/api/orders.ts';
import { fetchPublicOrder } from '@/api/public-order.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { fromPublic, fromUnpaid, guestCandidates, promptAllowedOn, type PromptOrder } from '@/features/unpaid-prompt/rules.ts';
import { listSavedOrders } from '@/stores/saved-orders.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';

const SNOOZE_KEY = 'sf-unpaid-prompt-snoozed';

export function isSnoozed(): boolean {
  try { return sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { return false; }
}

export function snooze(): void {
  try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* private mode: it may ask again on the next page load */ }
}

const QUERY = { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } as const;

/**
 * The order to ask about, if any. Nothing is requested on pages where the pop-up never shows, in the builder,
 * or once the customer has said "Not now" this visit. A failed lookup (an older backend, a dropped connection)
 * is simply "no order": the pop-up is a courtesy and never an error.
 *
 * The shop-closed and access-refused gates sit above the router and above these frames, so a frame only mounts
 * for a visitor who is let in; the hook does not repeat them.
 */
export function useUnpaidOrder(): { order: PromptOrder | null; more: boolean } {
  const { pathname } = useLocation();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const active = promptAllowedOn(pathname) && !isBuilderMode() && !isSnoozed();
  // A signed-in customer is only ever asked about their own orders. Saved order links belong to guests: they are
  // consulted only while signed out, so one customer's order is never offered to the next one on the same device.
  const candidates = !loggedIn && active ? guestCandidates(listSavedOrders(), new Date()) : [];

  const signedIn = useQuery({
    queryKey: ['orders', 'unpaid'],
    queryFn: fetchUnpaidOrders,
    enabled: active && loggedIn,
    ...QUERY,
  });
  const guest = useQuery({
    queryKey: ['unpaid-prompt', 'guest', candidates.map((c) => c.reference).join(',')],
    enabled: candidates.length > 0,
    ...QUERY,
    queryFn: async () => {
      for (const saved of candidates) {
        try {
          const order = fromPublic(saved, await fetchPublicOrder(saved.reference, saved.accessKey));
          if (order) return order;
        } catch { /* a link that no longer resolves is skipped */ }
      }
      return null;
    },
  });

  if (!active) return { order: null, more: false };
  if (loggedIn) {
    const list = signedIn.isError || !Array.isArray(signedIn.data) ? [] : signedIn.data;
    return { order: list[0] ? fromUnpaid(list[0]) : null, more: list.length > 1 };
  }
  return { order: guest.data ?? null, more: false };
}
