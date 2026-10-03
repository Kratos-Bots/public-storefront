import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { completeTelegramOidc } from '@/api/auth.ts';
import { classifyTelegramOidcError, takeBinding, type TelegramOidcFailure } from '@/features/auth/telegram-oidc.ts';
import { safeReturnTo, useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { useSessionStore } from '@/stores/session.ts';

export type TelegramCallbackState = { status: 'working' } | { status: 'error'; reason: TelegramOidcFailure };

/**
 * `/auth/telegram/callback?code=…&state=…` (or `?error=…` when the shopper turned Telegram down).
 * The backend's `complete` consumes the attempt whatever it answers, so it is called exactly once: the ref
 * survives StrictMode's second mount, where a bare effect would post twice and report the second, already-used
 * answer. A binding is read and removed in the same breath for the same reason: this tab gets one try.
 * Without a binding this tab did not start the sign-in (another browser, or the link was forwarded), which is
 * reported as expired and never sent.
 */
export function useTelegramCallback(): TelegramCallbackState {
  const [params] = useSearchParams();
  const onLogin = useLoginSuccess();
  const [state, setState] = useState<TelegramCallbackState>({ status: 'working' });
  const started = useRef(false);
  const login = useRef(onLogin);
  useEffect(() => {
    login.current = onLogin;
  }, [onLogin]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const binding = takeBinding();
    const code = (params.get('code') ?? '').trim();
    const attempt = (params.get('state') ?? '').trim();
    if (params.get('error')) {
      setState({ status: 'error', reason: 'cancelled' });
      return;
    }
    if (!code || !attempt || !binding) {
      setState({ status: 'error', reason: 'expired' });
      return;
    }

    void (async () => {
      try {
        const result = await completeTelegramOidc(code, attempt, binding);
        // The redirect left the tab, so the page the shopper was on is only known from the backend's echo.
        const returnTo = safeReturnTo(result.returnTo);
        if (returnTo) useSessionStore.getState().setReturnTo(returnTo);
        await login.current({ token: result.token, customer: result.customer });
      } catch (err) {
        setState({ status: 'error', reason: classifyTelegramOidcError(err) });
      }
    })();
  }, [params]);

  return state;
}
