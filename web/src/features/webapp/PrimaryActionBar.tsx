import { useEffect } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useBackControls } from '@/features/webapp/useBackControls.ts';
import { useResolvedPrimaryAction, useWebAppCartBar } from '@/features/webapp/useResolvedPrimaryAction.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';
import { isTelegramWebApp, readableTextOn, setMainButton, setSecondaryButton, supportsSecondaryButton } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/webapp/PrimaryActionBar.module.css';

/**
 * Whether an in-page bar is on the page, so the shell can leave room under the content: the single-button bar of
 * a browser tab (it exists only for a primary action, Back rides inside it), or the running-tab bar, which is in the
 * page inside Telegram too. A dialog hides the bar but not this, so the reserved space stays and the page does not
 * shift behind the dialog.
 */
export function usePrimaryBarShowing(): boolean {
  const action = useResolvedPrimaryAction();
  const cartBar = useWebAppCartBar();
  return cartBar || (!isTelegramWebApp() && action !== null);
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
  const { back, showBottomBack } = useBackControls();
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
    if (!back || !showBottomBack) {
      setSecondaryButton(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const color = backColor();
      setSecondaryButton({ text: backLabel, onClick: back, color, textColor: readableTextOn(color) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bottomBack, back, showBottomBack, backLabel, theme]);

  useEffect(() => (bottomBack ? () => setSecondaryButton(null) : undefined), [bottomBack]);

  if (native || modalOpen || !action) return null;

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
