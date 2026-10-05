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

/** A page's own action if it claimed one, else the cart default for this route. */
export function useResolvedPrimaryAction(): PrimaryAction | null {
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

  return override ?? defaultAction;
}
