import { useCallback, useEffect, useRef, useState } from 'react';
import { startTelegramOidc } from '@/api/auth.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { TelegramIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import {
  classifyTelegramOidcError,
  generateBinding,
  storeBinding,
} from '@/features/auth/telegram-oidc.ts';
import { safeReturnTo } from '@/features/auth/useLoginSuccess.ts';
import { errorMessage } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
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
  /** The bot's username, no `@`. Only the widget needs it. */
  botUsername: string;
  /** The widget's payload, to be posted verbatim — the backend rejects an edited one. */
  onAuth: (user: TelegramAuthPayload) => void;
  /** `login.telegram.oidc`: the shop has Telegram's OpenID Connect sign-in set up. Absent or false means the widget. */
  oidc?: boolean;
}

/**
 * "Continue with Telegram", in one of two forms:
 *
 * - with OpenID Connect set up (`oidc`), a real button in the shop's voice that sends the shopper to
 *   Telegram and back (see `OidcButton`);
 * - otherwise Telegram's own Login Widget, exactly as Telegram provides it (see `TelegramWidget`).
 *
 * In the page builder's frame neither runs (no third-party script, no redirect): a drawn button and a note
 * stand in.
 */
export function TelegramLogin(props: TelegramLoginProps) {
  const { t } = useText();
  if (isBuilderMode()) {
    return (
      <>
        <div className={buttons.quick}>
          <TelegramFace />
        </div>
        <AuthNote>{t('auth.telegram.previewNote')}</AuthNote>
      </>
    );
  }
  return props.oidc === true ? <OidcButton /> : <TelegramWidget {...props} />;
}

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
 * Starts the OpenID Connect sign-in. A fresh binding is kept in this tab's sessionStorage and sent with the
 * request; the backend only completes the sign-in for a browser that can send it back, so a callback link
 * forwarded to someone else signs nobody in. Then the whole page goes to Telegram.
 */
function OidcButton() {
  const { t } = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const starting = useRef(false);

  const start = useCallback(() => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        const binding = generateBinding();
        if (!storeBinding(binding)) throw new Error('storage unavailable');
        const returnTo = safeReturnTo(useSessionStore.getState().returnTo);
        const { url } = await startTelegramOidc(binding, returnTo);
        window.location.assign(url);
        // The page is leaving: stay busy rather than invite a second tap.
      } catch (err) {
        starting.current = false;
        setBusy(false);
        const reason = classifyTelegramOidcError(err);
        setError(
          reason === 'unavailable' ? t('auth.telegram.unavailable')
            : reason === 'rateLimited' ? errorMessage(err)
              : t('auth.telegram.startFailed'),
        );
      }
    })();
  }, [t]);

  return (
    <>
      <button type="button" className={buttons.quick} onClick={start} disabled={busy} aria-busy={busy}>
        {busy ? t('auth.telegram.starting') : <TelegramFace />}
      </button>
      {error ? <div role="alert"><AuthNote tone="danger">{error}</AuthNote></div> : null}
    </>
  );
}

/**
 * Telegram's official Login Widget. It renders itself into an iframe from Telegram's own script, so:
 *
 * - the callback is named in a `data-onauth` **attribute**, which means it has to exist as a global by that
 *   name; the global here only forwards to the current `onAuth`, so a re-render never leaves a stale closure
 *   holding the payload;
 * - the widget refuses to render unless the bot's `/setdomain` in BotFather matches this exact origin, which
 *   is why an iframe that never arrives is said out loud rather than left as an empty box.
 *
 * Nothing is drawn over it and its button is Telegram's own.
 */
function TelegramWidget({ botUsername, onAuth }: TelegramLoginProps) {
  const { t } = useText();
  const host = useRef<HTMLDivElement>(null);
  const handler = useRef(onAuth);
  const [absent, setAbsent] = useState(false);

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

    return () => {
      clearTimeout(timer);
      mount.replaceChildren();
    };
  }, [botUsername]);

  return (
    <>
      <div className={classes.widget} ref={host} />
      {absent ? <AuthNote tone="warn">{t('auth.telegram.widgetMissing')}</AuthNote> : null}
    </>
  );
}
