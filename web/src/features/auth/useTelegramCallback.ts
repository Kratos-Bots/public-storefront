import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { completeTelegramOidc } from '@/api/auth.ts';
import { classifyTelegramOidcError, takeBinding, type TelegramOidcFailure } from '@/features/auth/telegram-oidc.ts';
import { safeReturnTo, useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import type { LoginResult } from '@/types/auth.ts';
import { useSessionStore } from '@/stores/session.ts';

export type TelegramCallbackState = { status: 'working' } | { status: 'error'; reason: TelegramOidcFailure };

type SignIn = (result: LoginResult) => Promise<void>;

/**
 * One attempt per `state`, for the life of the page. The backend's `complete` consumes the attempt whatever
 * it answers and the binding is removed as it is read, so a second run (StrictMode's remount, or the route
 * mounting again) must join the first rather than start another, which would find no binding and flash
 * "expired" over a sign-in that is about to succeed.
 */
const attempts = new Map<string, Promise<TelegramCallbackState>>();

/** The newest mounted page's sign-in handler: the attempt outlives the instance that began it. */
let latestSignIn: SignIn | null = null;

/** For tests: forget every attempt. */
export function resetTelegramCallbackAttempts(): void {
  attempts.clear();
  latestSignIn = null;
}

async function runAttempt(code: string, state: string): Promise<TelegramCallbackState> {
  const binding = takeBinding();
  if (!binding) return { status: 'error', reason: 'expired' };
  let result;
  try {
    result = await completeTelegramOidc(code, state, binding);
  } catch (err) {
    return { status: 'error', reason: classifyTelegramOidcError(err) };
  }
  // The redirect left the tab, so the page the shopper was on is only known from the backend's echo.
  const returnTo = safeReturnTo(result.returnTo);
  if (returnTo) useSessionStore.getState().setReturnTo(returnTo);
  try {
    await latestSignIn?.({ token: result.token, customer: result.customer });
  } catch (err) {
    // The session is stored before anything that can fail, so a throw after that point is not a failed
    // sign-in: the shopper is in, and an error page here would send them back through Telegram for nothing.
    if (!useSessionStore.getState().token) return { status: 'error', reason: classifyTelegramOidcError(err) };
  }
  return { status: 'working' };
}

/**
 * `/auth/telegram/callback?code=…&state=…` (or `?error=…` when the shopper turned Telegram down).
 * The query is scrubbed from the address bar as soon as it is read, so a one-time code is never left in
 * history or a shared screenshot. Without a binding this tab did not start the sign-in (another browser,
 * or the link was forwarded), which is reported as expired and never sent.
 */
export function useTelegramCallback(): TelegramCallbackState {
  const [params] = useSearchParams();
  const onLogin = useLoginSuccess();
  const [state, setState] = useState<TelegramCallbackState>({ status: 'working' });
  const signIn = useRef(onLogin);
  useEffect(() => {
    signIn.current = onLogin;
    latestSignIn = onLogin;
  }, [onLogin]);

  useEffect(() => {
    const code = (params.get('code') ?? '').trim();
    const attempt = (params.get('state') ?? '').trim();
    const denied = params.get('error');
    // Replaces the entry without telling the router, so nothing re-renders or re-runs.
    window.history.replaceState(window.history.state, '', window.location.pathname);

    if (denied) {
      takeBinding();
      setState({ status: 'error', reason: 'cancelled' });
      return;
    }
    if (!code || !attempt) {
      takeBinding();
      setState({ status: 'error', reason: 'expired' });
      return;
    }

    latestSignIn = signIn.current;
    let pending = attempts.get(attempt);
    if (!pending) {
      pending = runAttempt(code, attempt);
      attempts.set(attempt, pending);
    }
    void pending.then(setState);
  }, [params]);

  return state;
}
