import { useLocation } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { useCoreOptions } from '@/templates/hooks.ts';

/**
 * Where the phone's bottom navigation bar never shows: the pages a visitor is paying, signing in or following a link
 * for one errand. This is deliberately not `promptAllowedOn` (the pop-ups' list), which also keeps out the order,
 * tracking and verify pages that the bar is perfectly at home on.
 */
const BLOCKED = [/^\/checkout(\/|$)/, /^\/payment\//, /^\/order-placed(\/|$)/, /^\/login(\/|$)/, /^\/auth\//, /^\/reset-password(\/|$)/, /^\/verify-email(\/|$)/, /^\/__builder/];

export function bottomNavAllowedOn(pathname: string): boolean {
  return !BLOCKED.some((re) => re.test(pathname));
}

/** Mantine's `md` breakpoint: from here the header carries everything and the bar stands down. */
const DESKTOP = '(min-width: 62em)';

/**
 * Whether the bottom navigation bar is on screen right now: the option is on, the viewport is a phone, the page is
 * one the bar belongs on, and this is neither the page builder's canvas nor a theme preview. The bar mounts on this
 * and the header drops the buttons the bar repeats on it, so the two can never disagree.
 */
export function useBottomNavShown(): boolean {
  const { showMobileBottomNav } = useCoreOptions();
  const { pathname } = useLocation();
  // Read synchronously: a deferred match would flash the bar on a desktop first paint.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  return showMobileBottomNav && !desktop && bottomNavAllowedOn(pathname) && !isBuilderMode() && !isPreviewMode();
}
