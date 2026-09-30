import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { TelegramSignInError } from '@/features/auth/TelegramSignInError.tsx';
import { LoginOptions } from '@/features/auth/LoginOptions.tsx';
import { useText } from '@/text/runtime.tsx';
import { DEFAULT_LANDING, safeReturnTo } from '@/features/auth/useLoginSuccess.ts';
import classes from '@/features/auth/LoginPage.module.css';

/**
 * The sign-in page. One column, a card per way in — and a guarded route sends
 * its own path here as `?returnTo=`, which is
 * parked in the session store so whichever provider answers first can hand the
 * customer back to what they were doing.
 */
export function LoginPage() {
  const { brand } = useSettings();
  const { t } = useText();
  const [params] = useSearchParams();
  const setReturnTo = useSessionStore((s) => s.setReturnTo);
  const telegramStatus = useTelegramAuthStore((s) => s.status);

  // Read once, at mount: a login that succeeds while this page is open navigates
  // on its own, and re-reading the store here would race that with a redirect of
  // our own to a destination we have just cleared.
  const [entry] = useState(() => {
    const session = useSessionStore.getState();
    return { signedIn: session.token !== null, parked: session.returnTo };
  });

  const requested = safeReturnTo(params.get('returnTo'));

  useEffect(() => {
    if (requested) setReturnTo(requested);
  }, [requested, setReturnTo]);

  if (entry.signedIn) {
    return <Navigate to={requested ?? safeReturnTo(entry.parked) ?? DEFAULT_LANDING} replace />;
  }

  // Inside Telegram the account comes from Telegram or not at all: the widget and
  // WhatsApp options would only sign the shopper into something other than the
  // account that opened the shop. A successful exchange never lands here (the
  // signed-in redirect above catches it), so anything else is a failure.
  if (telegramStatus !== 'none') {
    return (
      <div className={classes.page}>
        <TelegramSignInError />
      </div>
    );
  }

  return (
    <div className={classes.page}>
      <div className={classes.head}>
        {/* No mark here on purpose: the shell's header already carries it, and a
            client with no logo uploaded gets the wordmark fallback — which would
            print the shop's name twice in a row, immediately above the heading
            that names it a third time. */}
        <h1 className={classes.title}>{t('auth.page.title', { name: brand.name })}</h1>
        <p className={classes.lede}>
          {t('auth.page.lede')}
        </p>
      </div>

      <LoginOptions />
    </div>
  );
}
