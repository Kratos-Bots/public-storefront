import { useEffect, useRef, useState } from 'react';
import { AuthNote } from '@/features/auth/AuthCard.tsx';
import type { TelegramAuthPayload } from '@/types/auth.ts';
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
 */
export function TelegramLogin({ botUsername, onAuth }: TelegramLoginProps) {
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
      <div className={classes.mount} ref={host} />
      {absent ? (
        <AuthNote tone="warn">Telegram sign-in isn&rsquo;t loading on this address</AuthNote>
      ) : null}
    </>
  );
}
