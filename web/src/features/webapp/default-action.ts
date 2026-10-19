import { isTicketConversationPath } from '@/features/support/paths.ts';
import { textSnapshot, type TextApi } from '@/text/snapshot.ts';

export interface DefaultActionInput {
  pathname: string;
  count: number;
  /** The cart subtotal, already formatted in the store's currency. */
  subtotalLabel: string;
  /** `checkoutTarget(loggedIn, guestCheckout)` — /checkout, or login first. */
  checkoutTo: string;
  ordering: boolean;
  /** A line the server has withdrawn or that breaks an order limit is on the order. */
  blocked: boolean;
  /**
   * Inside Telegram: "View cart" is offered on the catalogue only (home and category listings). Every other page
   * has no default action, so nothing sits at the bottom there and Back is the header arrow. Off in a browser.
   */
  browseOnCatalogOnly?: boolean;
}

export interface DefaultAction {
  label: string;
  to: string;
  disabled: boolean;
}

/** The catalogue: the home page and a category listing. */
const isCatalogue = (pathname: string) => pathname === '/' || pathname.startsWith('/c/');

/** Routes that are the end of a purchase: nothing to push the shopper towards. */
const TERMINAL = ['/checkout', '/order-placed', '/payment/'];

/**
 * The web app's standing primary action, when no page has claimed one: the way
 * into the cart from anywhere, and the way out of the cart into checkout. The
 * wholesale sheet uses it too (its own tab stands down in the web app), and a
 * shop that isn't taking orders has nothing to put behind the button.
 */
export function defaultPrimaryAction(input: DefaultActionInput, t: TextApi['t'] = textSnapshot().t): DefaultAction | null {
  const { pathname, count, subtotalLabel, checkoutTo, ordering, blocked, browseOnCatalogOnly = false } = input;
  if (!ordering || count === 0) return null;
  if (TERMINAL.some((p) => pathname === p || (p.endsWith('/') && pathname.startsWith(p)))) return null;
  // A ticket's conversation keeps the foot of the phone for its composer.
  if (isTicketConversationPath(pathname)) return null;
  if (pathname === '/cart') return { label: t('webapp.action.checkout', { subtotal: subtotalLabel }), to: checkoutTo, disabled: blocked };
  if (browseOnCatalogOnly && !isCatalogue(pathname)) return null;
  return { label: t('webapp.action.viewCart', { subtotal: subtotalLabel }), to: '/cart', disabled: false };
}
