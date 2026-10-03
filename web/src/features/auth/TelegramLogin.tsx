import { useEffect, useRef, useState } from 'react';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { TelegramIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { useText } from '@/text/runtime.tsx';
import type { TelegramAuthPayload } from '@/types/auth.ts';
import buttons from '@/features/auth/AuthButtons.module.css';
import classes from '@/features/auth/TelegramLogin.module.css';

export const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';
/** How long the widget gets to put its iframe on the page before we admit it isn't coming. */
export const WIDGET_TIMEOUT_MS = 5_000;

declare global {
  interface Window {
    /** The widget's callback, wired by name because `data-onauth` is a string of source. */
    onSfTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

export interface TelegramLoginProps {
  /** The bot's username, no `@`. */
  botUsername: string;
  /** The widget's payload, to be posted verbatim — the backend rejects an edited one. */
  onAuth: (user: TelegramAuthPayload) => void;
}

/**
 * Telegram's official Login Widget. It renders itself into an iframe from
 * Telegram's own script, which means two things worth knowing:
 *
 * - the callback is named in a `data-onauth` **attribute**, so it has to exist
 *   as a global by that name; the global here only forwards to the current
 *   `onAuth`, so a re-render never leaves a stale closure holding the payload;
 * - the widget refuses to render at all unless the bot's `/setdomain` in
 *   BotFather matches this exact origin — which is why an iframe that never
 *   arrives is a state this component has to be able to say out loud, rather
 *   than an empty box the customer stares at.
 *
 * The iframe's own button is Telegram's to draw, so it is not what the shopper
 * sees: a button in the shop's voice ("Continue with Telegram") is drawn instead,
 * and the real iframe lies over it, invisible and stretched to cover it. A tap
 * lands on Telegram's own control, so the signed payload and the popup are exactly
 * the widget's.
 *
 * In the page builder's frame the widget is never loaded (no third-party script runs there):
 * a note stands in its place.
 */
export function TelegramLogin(props: TelegramLoginProps) {
  const { t } = useText();
  if (isBuilderMode()) {
    return (
      <>
        <div className={`${buttons.quick} ${classes.slot}`}>
          <TelegramFace />
        </div>
        <AuthNote>{t('auth.telegram.previewNote')}</AuthNote>
      </>
    );
  }
  return <TelegramWidget {...props} />;
}

/** The drawn button. Not interactive by itself: in the live shop the widget iframe covers it. */
function TelegramFace() {
  const { t } = useText();
  return (
    <>
      <span className={buttons.icon}><TelegramIcon size={20} /></span>
      {t('auth.telegram.continue')}
    </>
  );
}

/**
 * Stretch the (invisible) iframe over the whole drawn button so any tap on it is a tap on Telegram's control.
 * Returns whether the iframe exists yet. A scale is used rather than a resize because the widget sizes its own
 * iframe and re-asserts it whenever it redraws.
 */
function coverWith(mount: HTMLElement, label: string): boolean {
  const frame = mount.querySelector('iframe');
  if (!frame) return false;
  frame.setAttribute('title', label);
  const w = frame.offsetWidth;
  const h = frame.offsetHeight;
  if (w > 0 && h > 0 && mount.clientWidth > 0) {
    frame.style.transform = `scale(${mount.clientWidth / w}, ${mount.clientHeight / h})`;
  }
  return true;
}

function TelegramWidget({ botUsername, onAuth }: TelegramLoginProps) {
  const { t } = useText();
  const host = useRef<HTMLDivElement>(null);
  const handler = useRef(onAuth);
  const [absent, setAbsent] = useState(false);
  const [ready, setReady] = useState(false);
  const label = t('auth.telegram.continue');

  useEffect(() => {
    handler.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    window.onSfTelegramAuth = (user) => handler.current(user);
    return () => {
      delete window.onSfTelegramAuth;
    };
  }, []);

  useEffect(() => {
    const mount = host.current;
    if (!mount || !botUsername) return;
    setAbsent(false);
    setReady(false);
    mount.replaceChildren();

    const script = document.createElement('script');
    script.async = true;
    script.src = TELEGRAM_WIDGET_SRC;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onSfTelegramAuth(user)');
    mount.appendChild(script);

    const timer = setTimeout(() => {
      if (!mount.querySelector('iframe')) setAbsent(true);
    }, WIDGET_TIMEOUT_MS);

    const fit = () => {
      if (coverWith(mount, label)) setReady(true);
    };
    // The iframe arrives after the script runs, and the widget resizes it once its content has drawn.
    const arrivals = new MutationObserver(fit);
    arrivals.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'width', 'height'] });
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    sizes?.observe(mount);

    return () => {
      clearTimeout(timer);
      arrivals.disconnect();
      sizes?.disconnect();
      mount.replaceChildren();
    };
  }, [botUsername, label]);

  return (
    <>
      <div className={`${buttons.quick} ${classes.slot}`} data-ready={ready}>
        <TelegramFace />
        <div className={classes.mount} ref={host} />
      </div>
      {absent ? (
        <AuthNote tone="warn">{t('auth.telegram.widgetMissing')}</AuthNote>
      ) : null}
    </>
  );
}
