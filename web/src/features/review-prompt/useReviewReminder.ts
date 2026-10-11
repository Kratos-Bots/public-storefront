import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { fetchReviewableOrders } from '@/api/reviews.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { reviewableKey } from '@/features/reviews/queries.ts';
import { useReviewSettings } from '@/features/reviews/settings.ts';
import { shouldFetchReviewable, type DecideInputs } from '@/features/review-prompt/rules.ts';
import { useShopRefused, useUnpaidState } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

const QUERY = { retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;

/** Everything the reminder's decision reads from the app, short of the clock, the stored map and the load flag. */
export type ReminderInputs = Omit<DecideInputs, 'stored' | 'now' | 'shownThisLoad'>;

/**
 * Reads the app state the reminder depends on and, only when it could show, the list of orders to remind about.
 * The unpaid-order pop-up is consulted first and its lookup is never repeated here: the list is not even requested
 * until the unpaid lookup has answered "nothing". Any failure of the list (an older backend answers 404) is no reminder.
 */
export function useReminderInputs(): ReminderInputs {
  const { pathname } = useLocation();
  const { enabled } = useReviewSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const customerId = useSessionStore((s) => s.customer?.id ?? null);
  const cartOpen = useUiStore((s) => s.cartOpen);
  const loginOpen = useUiStore((s) => s.loginOpen);
  const refused = useShopRefused(loggedIn);
  const unpaid = useUnpaidState(customerId);

  const base = { reviewsEnabled: enabled, customerId: loggedIn ? customerId : null, path: pathname, builder: isBuilderMode(), preview: isPreviewMode(), refused };
  const list = useQuery({
    // Keyed by customer: a different login without a reload never reads the previous one's list.
    queryKey: reviewableKey(base.customerId),
    queryFn: fetchReviewableOrders,
    enabled: shouldFetchReviewable(base) && unpaid === 'clear',
    ...QUERY,
  });

  const orders = list.isError || !Array.isArray(list.data?.orders) ? null : list.data.orders;
  return { ...base, cartOpen, loginOpen, unpaid, reviewable: orders };
}
