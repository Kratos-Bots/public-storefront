import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { fetchUnpaidOrders } from '@/api/orders.ts';
import { accessGate } from '@/app/access-gate.ts';
import { accessOf } from '@/app/access.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { useSettings } from '@/app/settings.ts';
import { PROFILE_KEY } from '@/features/account/queries.ts';
import { fromUnpaid, promptAllowedOn, type PromptOrder } from '@/features/unpaid-prompt/rules.ts';
import { fetchProfile } from '@/api/profile.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

// "Not now" lasts until the page is loaded again: a module variable dies with the document, so every fresh
// arrival (a reload, a new tab, reopening the Telegram Mini App) asks again, and moving around the shop does not.
// It is the customer who said it: another one signing in within the same load (a session that expired, a Telegram
// account switch; neither reloads) is asked for themselves.
let dismissedFor: number | null = null;
// Who the pop-up has actually been put in front of during this load: the review reminder stays away for the whole load.
let shownFor: number | null = null;
export const isDismissed = (customerId: number | null) => customerId !== null && dismissedFor === customerId;
export const dismissForThisLoad = (customerId: number | null) => { if (customerId !== null) dismissedFor = customerId; };
/** Tests stand in for a page load. */
export const resetDismissalForTests = () => { dismissedFor = null; shownFor = null; };

const unpaidKey = (customerId: number | null) => ['orders', 'unpaid', customerId] as const;
const QUERY = { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } as const;

/**
 * The order to ask about, if any, for a signed-in customer only: the order page the pop-up leads to lives in the
 * account, so a guest has nowhere to be sent. Nothing is requested on pages where the pop-up never shows, in the
 * builder or the appearance preview, while access is refused, or once the customer has said "Not now" since the
 * page loaded. A failed lookup (an older backend, a dropped connection) is simply "no order": the pop-up is a
 * courtesy and never an error.
 *
 * Shop-closed and sign-in-required shops are decided above the router, but a customer the owner has refused
 * still reaches /account* (their orders must not be stranded), inside this frame. So on a restricted shop the
 * hook waits for the profile the account pages already load (read from the cache, never requested here) to say
 * `shopAccess: true`, and stays off once the access gate has been told "denied".
 */
/** Whether the shop has refused this customer (a restricted shop that has not allowed them). */
export function useShopRefused(loggedIn: boolean): boolean {
  const denied = accessGate((s) => s.denied);
  const restricted = accessOf(useSettings()).storefront === 'restricted';
  // Disabled: this only subscribes to the cache entry the boundary / account layout fill; it never fetches.
  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile, enabled: false });
  return denied || (restricted && loggedIn && profile.data?.shopAccess !== true);
}

export function useUnpaidOrder(): { order: PromptOrder | null; more: boolean } {
  const { pathname } = useLocation();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const customerId = useSessionStore((s) => s.customer?.id ?? null);
  // Never on top of the sign-in dialog or the cart drawer: it may appear once they close.
  const otherDialogOpen = useUiStore((s) => s.loginOpen || s.cartOpen);
  const refused = useShopRefused(loggedIn);
  const active = loggedIn && promptAllowedOn(pathname) && !isBuilderMode() && !isPreviewMode() && !isDismissed(customerId) && !otherDialogOpen && !refused;

  const signedIn = useQuery({
    // Keyed by customer: a different login without a reload never reads the previous one's list.
    queryKey: unpaidKey(customerId),
    queryFn: fetchUnpaidOrders,
    enabled: active && customerId !== null,
    ...QUERY,
  });

  const list = signedIn.isError || !Array.isArray(signedIn.data) ? [] : signedIn.data;
  const order = active && list[0] ? fromUnpaid(list[0]) : null;
  useEffect(() => {
    if (order && customerId !== null) shownFor = customerId;
  }, [order, customerId]);
  if (!active) return { order: null, more: false };
  return { order, more: list.length > 1 };
}

export type UnpaidState = 'waiting' | 'blocked' | 'clear';

/**
 * Where the unpaid-order pop-up stands for this customer in this page load, for whatever must not share a load with it
 * (the review reminder). `waiting`: its lookup has not answered yet; `blocked`: it is showing, was shown, or the customer
 * was dealt with (dismissed it, or opened an order they owe on); `clear`: nothing unpaid, or the lookup failed.
 * It only reads the lookup's cache entry, so it never asks the backend itself.
 */
export function useUnpaidState(customerId: number | null): UnpaidState {
  const query = useQuery({ queryKey: unpaidKey(customerId), queryFn: fetchUnpaidOrders, enabled: false, ...QUERY });
  if (customerId !== null && (isDismissed(customerId) || shownFor === customerId)) return 'blocked';
  if (query.isError) return 'clear';
  if (query.status === 'pending' || query.data === undefined) return 'waiting';
  return Array.isArray(query.data) && query.data.length > 0 ? 'blocked' : 'clear';
}
