/**
 * Where the phone's bottom navigation bar never shows: the pages a visitor is paying, signing in or following a link
 * for one errand. This is deliberately not `promptAllowedOn` (the pop-ups' list), which also keeps out the order,
 * tracking and verify pages that the bar is perfectly at home on.
 */
const BLOCKED = [/^\/checkout(\/|$)/, /^\/payment\//, /^\/order-placed(\/|$)/, /^\/login(\/|$)/, /^\/auth\//, /^\/reset-password(\/|$)/, /^\/verify-email(\/|$)/, /^\/__builder/];

export function bottomNavAllowedOn(pathname: string): boolean {
  return !BLOCKED.some((re) => re.test(pathname));
}
