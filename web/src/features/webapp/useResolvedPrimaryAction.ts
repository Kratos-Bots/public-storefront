import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { usePrimaryActionStore, type PrimaryAction } from '@/stores/primary-action.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';
import { formatMoney } from '@/lib/format.ts';
import { useText } from '@/text/runtime.tsx';

interface ActionParts {
  override: PrimaryAction | null;
  /** The cart default for this route, as a button for Telegram's MainButton or the in-page bar. */
  defaultAction: PrimaryAction | null;
  /**
   * The default is the browsing one ("View cart"), no page has claimed an action of its own, and the shop is not in
   * wholesale mode (whose sheet is its own tab): the running-tab bar stands in for it, so no native button shows.
   */
  cartBar: boolean;
}

function useActionParts(): ActionParts {
  const override = usePrimaryActionStore((s) => s.override);
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const { issues } = useServerCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useText();

  const fallback = defaultPrimaryAction({
    pathname,
    count,
    subtotalLabel: formatMoney(subtotal, currency),
    checkoutTo: checkoutTarget(loggedIn, features.guestCheckout),
    ordering: features.ordering,
    blocked: issues.some((i) => i.inactive || i.belowMin || i.aboveMax),
  }, t);
  const label = fallback?.label ?? null;
  const to = fallback?.to ?? null;
  const disabled = fallback?.disabled ?? false;

  // One identity per (label, target, disabled): Telegram's MainButton is only
  // re-hooked when what it shows or where it goes changes, not on every render.
  const defaultAction = useMemo<PrimaryAction | null>(
    () => (label !== null && to !== null ? { label, disabled, onClick: () => navigate(to) } : null),
    [label, to, disabled, navigate],
  );

  // On /cart the default is "Checkout", which stays a single button; anywhere else it is "View cart".
  const cartBar = override === null && fallback !== null && pathname !== '/cart' && !features.wholesale;
  return { override, defaultAction, cartBar };
}

/**
 * A page's own action if it claimed one, else the cart default for this route — except while the running-tab bar
 * (see `useWebAppCartBar`) stands in for the browsing default, when there is no single-button action at all.
 */
export function useResolvedPrimaryAction(): PrimaryAction | null {
  const { override, defaultAction, cartBar } = useActionParts();
  return override ?? (cartBar ? null : defaultAction);
}

/** Whether the web app shows the running-tab bar (subtotal, items, Checkout) in place of a "View cart" button. */
export function useWebAppCartBar(): boolean {
  return useActionParts().cartBar;
}
