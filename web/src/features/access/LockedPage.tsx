import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';
import { accessGate } from '@/app/access-gate.ts';
import { Brand } from '@/components/Brand.tsx';
import { AccessButtons } from '@/features/access/AccessButtons.tsx';
import { signOutAndReload } from '@/features/auth/sign-out.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/access/LockedPage.module.css';

/**
 * Replaces the shop for someone it will not admit. `denied` is a signed-in
 * customer the owner has not allowed: their orders and a way to sign out stay
 * within reach. `closed` is a visitor nobody can sign in for (registration
 * refused, or accounts off), so there is nothing to offer but the owner's words.
 */
export function LockedPage({ variant }: { variant: 'denied' | 'closed' }) {
  const settings = useSettings();
  const { t } = useText();
  const client = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const access = accessOf(settings);

  const checkAgain = () => {
    // If the customer is still not allowed, the next API answer puts this screen back.
    accessGate.getState().setDenied(false);
    void client.invalidateQueries();
  };

  const signOut = async () => {
    setSigningOut(true);
    await signOutAndReload();
  };

  return (
    <main className={classes.root}>
      <div className={classes.panel}>
        <Brand size="lg" />
        <span className={classes.rule} aria-hidden />
        <p className={classes.eyebrow}>{t('auth.access.eyebrow')}</p>
        <p className={classes.message}>{access.deniedMessage || t('auth.access.defaultMessage')}</p>
        <AccessButtons buttons={access.deniedButtons} ariaLabel={t('auth.access.contactAriaLabel')} />
        {variant === 'denied' ? (
          <div className={classes.account}>
            <Link className={classes.accountAction} to="/account/orders">
              {t('auth.access.myOrders')}
            </Link>
            <button type="button" className={classes.accountAction} onClick={checkAgain}>
              {t('auth.access.checkAgain')}
            </button>
            <button type="button" className={classes.accountAction} onClick={() => void signOut()} disabled={signingOut}>
              {t('auth.access.signOut')}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
