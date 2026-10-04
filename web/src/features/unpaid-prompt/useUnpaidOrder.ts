import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { fetchUnpaidOrders } from '@/api/orders.ts';
import { fetchPublicOrder, InvalidLinkError } from '@/api/public-order.ts';
import { accessGate } from '@/app/access-gate.ts';
import { accessOf } from '@/app/access.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { useSettings } from '@/app/settings.ts';
import { PROFILE_KEY } from '@/features/account/queries.ts';
import { fromPublic, fromUnpaid, guestCandidates, isTerminalStatus, promptAllowedOn, type PromptOrder } from '@/features/unpaid-prompt/rules.ts';
import { fetchProfile } from '@/api/profile.ts';
import { listSavedOrders, removeSavedOrder } from '@/stores/saved-orders.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

const SNOOZE_KEY = 'sf-unpaid-prompt-snoozed';

export function isSnoozed(): boolean {
  try { return sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { return false; }
}

export function snooze(): void {
  try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* private mode: it may ask again on the next page load */ }
}

const QUERY = { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } as const;

/**
 * The order to ask about, if any. Nothing is requested on pages where the pop-up never shows, in the builder or
 * the appearance preview, while access is refused, or once the customer has said "Not now" this visit. A failed
 * lookup (an older backend, a dropped connection) is simply "no order": the pop-up is a courtesy and never an error.
 *
 * Shop-closed and sign-in-required shops are decided above the router, but a customer the owner has refused
 * still reaches /account* (their orders must not be stranded), inside this frame. So on a restricted shop the
 * hook waits for the profile the account pages already load (read from the cache, never requested here) to say
 * `shopAccess: true`, and stays off once the access gate has been told "denied".
 */
export function useUnpaidOrder(): { order: PromptOrder | null; more: boolean } {
  const { pathname } = useLocation();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const customerId = useSessionStore((s) => s.customer?.id ?? null);
  // Never on top of the sign-in dialog or the cart drawer: it may appear once they close.
  const otherDialogOpen = useUiStore((s) => s.loginOpen || s.cartOpen);
  const denied = accessGate((s) => s.denied);
  const restricted = accessOf(useSettings()).storefront === 'restricted';
  // Disabled: this only subscribes to the cache entry the boundary / account layout fill; it never fetches.
  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile, enabled: false });
  const refused = denied || (restricted && loggedIn && profile.data?.shopAccess !== true);
  const active = promptAllowedOn(pathname) && !isBuilderMode() && !isPreviewMode() && !isSnoozed() && !otherDialogOpen && !refused;
  // A signed-in customer is only ever asked about their own orders. Saved order links belong to guests: they are
  // consulted only while signed out, so one customer's order is never offered to the next one on the same device.
  // Read once per activation: the lookup prunes storage, and a list that re-read it would change the query key mid-lookup.
  const guestActive = !loggedIn && active;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on activation only
  const candidates = useMemo(() => (guestActive ? guestCandidates(listSavedOrders(), new Date()) : []), [guestActive]);

  const signedIn = useQuery({
    // Keyed by customer: a different login without a reload never reads the previous one's list.
    queryKey: ['orders', 'unpaid', customerId],
    queryFn: fetchUnpaidOrders,
    enabled: active && loggedIn && customerId !== null,
    ...QUERY,
  });
  const guest = useQuery({
    queryKey: ['unpaid-prompt', 'guest', candidates.map((c) => c.reference).join(',')],
    enabled: candidates.length > 0,
    ...QUERY,
    queryFn: async () => {
      for (const saved of candidates) {
        try {
          const found = await fetchPublicOrder(saved.reference, saved.accessKey);
          // A cancelled or refunded order is over for good; the pop-up has nothing to offer and the link nothing to keep.
          if (isTerminalStatus(found.status)) removeSavedOrder(saved.reference);
          const order = fromPublic(saved, found);
          if (order) return order;
        } catch (err) {
          // Only a link the backend says is dead is forgotten; a dropped connection, a 5xx or a 429 may pass.
          if (err instanceof InvalidLinkError) removeSavedOrder(saved.reference);
        }
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
