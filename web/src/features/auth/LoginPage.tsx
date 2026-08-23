import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore } from '@/stores/session.ts';
import { LoginOptions } from '@/features/auth/LoginOptions.tsx';
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
  const [params] = useSearchParams();
  const setReturnTo = useSessionStore((s) => s.setReturnTo);

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

  return (
    <div className={classes.page}>
      <div className={classes.head}>
        {/* No mark here on purpose: the shell's header already carries it, and a
            client with no logo uploaded gets the wordmark fallback — which would
            print the shop's name twice in a row, immediately above the heading
            that names it a third time. */}
        <h1 className={classes.title}>Sign in to {brand.name}</h1>
        <p className={classes.lede}>
          There&rsquo;s no password. Sign in from a chat app you already use, and your orders,
          points and referrals are waiting.
        </p>
      </div>

      <LoginOptions />
    </div>
  );
}
