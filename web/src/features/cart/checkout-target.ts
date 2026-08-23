/**
 * Where the Checkout button goes. A guest may only walk straight through when
 * the client has turned guest checkout on; otherwise the sign-in comes first and
 * carries the destination with it, so nobody has to find their way back.
 */
export function checkoutTarget(loggedIn: boolean, guestCheckout: boolean): string {
  if (loggedIn || guestCheckout) return '/checkout';
  return `/login?returnTo=${encodeURIComponent('/checkout')}`;
}
