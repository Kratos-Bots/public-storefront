// After a successful cancel the cancel control and the payment card unmount with the refetch, and the focus they
// held falls to the page. The payment card says a cancel just happened; the order page, once the order has come back
// cancelled, moves focus to its heading. Held outside React because the two live in different components.
let pendingFor: string | null = null;

/** The customer just cancelled this order from its page. */
export function wantTitleFocus(reference: string): void {
  pendingFor = reference;
}

/** True once, when `reference` was waiting for it. */
export function takeTitleFocus(reference: string): boolean {
  if (pendingFor !== reference) return false;
  pendingFor = null;
  return true;
}
