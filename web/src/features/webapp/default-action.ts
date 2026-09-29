export interface DefaultActionInput {
  pathname: string;
  count: number;
  /** The cart subtotal, already formatted in the store's currency. */
  subtotalLabel: string;
  /** `checkoutTarget(loggedIn, guestCheckout)` — /checkout, or login first. */
  checkoutTo: string;
  ordering: boolean;
  wholesale: boolean;
  /** A line the server has withdrawn or that breaks an order limit is on the order. */
  blocked: boolean;
}

export interface DefaultAction {
  label: string;
  to: string;
  disabled: boolean;
}

/** Routes that are the end of a purchase: nothing to push the shopper towards. */
const TERMINAL = ['/checkout', '/order-placed', '/order/', '/payment/'];

/**
 * The web app's standing primary action, when no page has claimed one: the way
 * into the cart from anywhere, and the way out of the cart into checkout. The
 * wholesale sheet flies its own tab, and a shop that isn't taking orders has
 * nothing to put behind the button.
 */
export function defaultPrimaryAction(input: DefaultActionInput): DefaultAction | null {
  const { pathname, count, subtotalLabel, checkoutTo, ordering, wholesale, blocked } = input;
  if (!ordering || wholesale || count === 0) return null;
  if (TERMINAL.some((p) => pathname === p || (p.endsWith('/') && pathname.startsWith(p)))) return null;
  if (pathname === '/cart') return { label: `Checkout · ${subtotalLabel}`, to: checkoutTo, disabled: blocked };
  return { label: `View cart · ${subtotalLabel}`, to: '/cart', disabled: false };
}
