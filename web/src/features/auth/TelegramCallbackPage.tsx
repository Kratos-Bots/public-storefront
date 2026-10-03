import { Link } from 'react-router';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { useTelegramCallback } from '@/features/auth/useTelegramCallback.ts';
import type { TelegramOidcFailure } from '@/features/auth/telegram-oidc.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import buttons from '@/features/auth/AuthButtons.module.css';
import classes from '@/features/auth/TelegramCallbackPage.module.css';

type Translate = ReturnType<typeof useText>['t'];

/** What to tell the shopper for each way the return trip can fail. */
function reasonText(reason: TelegramOidcFailure, t: Translate): string {
  switch (reason) {
    case 'expired': return t('auth.telegram.callback.expired');
    case 'failed': return t('auth.telegram.callback.failed');
    case 'unavailable': return t('auth.telegram.unavailable');
    case 'closed': return t('errors.registrationClosed');
    case 'banned': return t('auth.password.banned');
    case 'cancelled': return t('auth.telegram.callback.cancelled');
    case 'rateLimited': return t('errors.rateLimited');
    case 'generic': return t('auth.telegram.callback.generic');
  }
}

/**
 * `/auth/telegram/callback`: where Telegram's sign-in sends the browser back. A bare page (no catalogue, no
 * shop frame), because a private shop must be able to show it to someone who is not signed in yet. On success
 * the hook navigates away; what is drawn here is the wait and the failures.
 */
export function TelegramCallbackPage() {
  const { t } = useText();
  const state = useTelegramCallback();

  if (state.status === 'working') {
    return (
      <div className={`${classes.page} ${FADE}`}>
        <h1 className={classes.title}>{t('auth.telegram.callback.title')}</h1>
        <p className={classes.status} role="status">{t('auth.telegram.callback.checking')}</p>
      </div>
    );
  }

  return (
    <div className={`${classes.page} ${FADE}`}>
      <h1 className={classes.title}>{t('auth.telegram.callback.errorTitle')}</h1>
      <div className={classes.stack}>
        <div role="alert">
          <AuthNote tone="danger">{reasonText(state.reason, t)}</AuthNote>
        </div>
        <Link to="/login" className={buttons.primary}>{t('auth.password.backToSignIn')}</Link>
      </div>
    </div>
  );
}
