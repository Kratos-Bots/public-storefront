import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { usePrimaryActionStore, type PrimaryAction } from '@/stores/primary-action.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';
import { formatMoney } from '@/lib/format.ts';
import { useBackAction } from '@/features/webapp/useTelegramChrome.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';
import { isTelegramWebApp, readableTextOn, setMainButton, setSecondaryButton, supportsSecondaryButton } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/webapp/PrimaryActionBar.module.css';

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

/**
 * Whether the in-page bar is on the page, so the shell can leave room under the content. A dialog hides the bar
 * but not this: the reserved space stays, so the page does not shift behind the dialog.
 */
export function usePrimaryBarShowing(): boolean {
  const action = useResolvedPrimaryAction();
  const back = useBackAction();
  return !isTelegramWebApp() && (action !== null || back !== null);
}

function primaryColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sf-primary').trim() || '#000000';
}

/** The quiet button's fill: one step off the bottom bar's own surface, so it reads as a button on it. */
function backColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--sf-surface-2').trim() || style.getPropertyValue('--sf-surface').trim() || '#1a1a1a';
}

export function PrimaryActionBar() {
  const action = useResolvedPrimaryAction();
  const back = useBackAction();
  const modalOpen = useModalOpen();
  const { theme } = useSettings();
  const { t } = useText();
  const native = isTelegramWebApp();
  const bottomBack = native && supportsSecondaryButton();

  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;
  const busy = action?.busy ?? false;
  const onClick = action?.onClick;

  // Telegram: drive the native MainButton in the shop's primary, never Telegram's theme.
  useEffect(() => {
    if (!native) return;
    if (label === null || !onClick || modalOpen) {
      setMainButton(null);
      return;
    }
    // The document theme is written by an effect above the router, which runs
    // after this one on the commit that mounts both — read the colour a tick later.
    const timer = window.setTimeout(() => {
      const color = primaryColor();
      setMainButton({ text: label, onClick, color, textColor: readableTextOn(color), disabled, busy });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [native, label, disabled, busy, onClick, theme, modalOpen]);

  useEffect(() => (native ? () => setMainButton(null) : undefined), [native]);

  // Back on the left of the bottom row, where Telegram has the SecondaryButton; older clients keep the header arrow.
  const backLabel = t('webapp.action.back');
  useEffect(() => {
    if (!bottomBack) return;
    if (!back || modalOpen) {
      setSecondaryButton(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const color = backColor();
      setSecondaryButton({ text: backLabel, onClick: back, color, textColor: readableTextOn(color) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bottomBack, back, backLabel, modalOpen, theme]);

  useEffect(() => (bottomBack ? () => setSecondaryButton(null) : undefined), [bottomBack]);

  if (native || modalOpen || (!action && !back)) return null;

  return (
    <div className={classes.bar} data-sf-part="primary-bar">
      <div className={classes.inner}>
        {back ? (
          <button
            type="button"
            className={action ? classes.back : `${classes.back} ${classes.backAlone}`}
            onClick={back}
            data-sf-part="button"
            data-variant="default"
          >
            {backLabel}
          </button>
        ) : null}
        {action ? (
          <button
            type="button"
            className={classes.action}
            onClick={action.onClick}
            disabled={action.disabled || action.busy}
            aria-busy={action.busy || undefined}
            data-sf-part="button"
            data-variant="filled"
            data-sf-cta="main"
          >
            {action.label}
            <Slot name="ButtonAdornment" variant="primary" cta busy={action.busy} />
          </button>
        ) : null}
      </div>
      <div className={classes.safe} />
    </div>
  );
}
