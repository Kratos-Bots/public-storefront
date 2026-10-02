import { useSettings } from '@/app/settings.ts';
import { accessOf, showsLockoutCopy } from '@/app/access.ts';
import { AccessButtons } from '@/features/access/AccessButtons.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/auth/AccessNotice.module.css';

/**
 * Says, under the sign-in options, what the shop asks of a visitor: that they
 * sign in, that new accounts are closed, and where to ask the owner for access.
 * Renders nothing for an open shop, so a backend that predates shop access
 * looks exactly as before.
 */
export function AccessNotice({ placement }: { placement?: 'above' | 'below' } = {}) {
  const access = accessOf(useSettings());
  const { t } = useText();

  const needsSignIn = access.storefront !== 'public';
  const lockout = showsLockoutCopy(access);
  if (!needsSignIn && access.registration) return null;
  // Beside the sign-in cards the owner's words lead (on a phone the cards are a long scroll);
  // otherwise the short sign-in line stays where it always was, below them.
  if (placement === 'above' && !lockout) return null;
  if (placement === 'below' && lockout) return null;

  return (
    <div className={placement === 'above' ? `${classes.root} ${classes.above}` : classes.root}>
      {needsSignIn ? <p className={classes.lede}>{t('auth.access.signInLede')}</p> : null}
      {!access.registration ? <p className={classes.registration}>{t('auth.access.registrationClosed')}</p> : null}
      {lockout ? (
        <>
          <p className={classes.message}>{access.deniedMessage || t('auth.access.defaultMessage')}</p>
          <AccessButtons buttons={access.deniedButtons} ariaLabel={t('auth.access.contactAriaLabel')} />
        </>
      ) : null}
    </div>
  );
}
