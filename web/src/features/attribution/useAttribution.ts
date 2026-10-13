import { useEffect } from 'react';
import { markActivity, trackPageLoad } from '@/features/attribution/tracker.ts';

/**
 * Reports the visit once per page load, then keeps it alive while the shopper navigates.
 * No "started" guard: under StrictMode the effect runs, cleans up and runs again, and the
 * subscription must survive that. A repeat trackPageLoad() is harmless, it finds the state the
 * first call saved, so it only refreshes the activity time and cannot report a second visit.
 */
export function useAttribution(router: { subscribe: (listener: () => void) => () => void }) {
  useEffect(() => {
    trackPageLoad();
    return router.subscribe(() => markActivity());
  }, [router]);
}
