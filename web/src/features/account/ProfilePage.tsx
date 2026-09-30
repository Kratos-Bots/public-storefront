import { useState } from 'react';
import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { Money } from '@/components/Money.tsx';
import { formatDate } from '@/lib/format.ts';
import { logout } from '@/api/auth.ts';
import { setBotMode } from '@/api/profile.ts';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { errorMessage } from '@/lib/errors.ts';
import { isTelegramWebApp, tgClose } from '@/lib/telegram-webapp.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import { useProfile } from '@/features/account/queries.ts';
import type { Profile } from '@/types/profile.ts';
import classes from '@/features/account/Account.module.css';

const CHANNELS: Array<{ key: keyof Profile['identities']; label: string }> = [
  { key: 'telegram', label: textKey('common.contact.telegram') },
  { key: 'whatsapp', label: textKey('common.contact.whatsapp') },
  { key: 'email', label: textKey('account.profile.email') },
];

/**
 * Beta web app mode's way back to the classic bot. Two taps, not a dialog: the
 * first says what will happen, the second does it. The backend flips the flag,
 * resets this chat's menu button and drops a "back to the menu" message in the
 * chat; the Mini App then closes so the shopper lands on that message.
 */
function ClassicBotSwitch() {
  const { t } = useText();
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setStage('busy');
    setError(null);
    try {
      await setBotMode(true);
      tgClose();
    } catch (err) {
      setError(errorMessage(err, t('account.profile.botFailed')));
      setStage('confirm');
    }
  };

  return (
    <section className={classes.section} aria-label={t('account.profile.botAria')}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.profile.botTitle')}</h3>
      </div>
      <p className={classes.note}>
        {t('account.profile.botNote')}
      </p>
      {stage === 'idle' ? (
        <button type="button" className={classes.switchBot} onClick={() => setStage('confirm')}>
          {t('account.profile.botSwitch')}
        </button>
      ) : (
        <div className={classes.switchConfirm}>
          <button type="button" className={classes.switchBot} onClick={() => void confirm()} disabled={stage === 'busy'}>
            {stage === 'busy' ? t('account.profile.botSwitching') : t('account.profile.botConfirm')}
          </button>
          <button type="button" className={classes.logout} onClick={() => setStage('idle')} disabled={stage === 'busy'}>
            {t('common.actions.cancel')}
          </button>
        </div>
      )}
      {error ? <p className={classes.note} role="alert">{error}</p> : null}
    </section>
  );
}

/**
 * Who the shop has you down as, and the way out. Signing out is a local act as
 * much as a server one: the token is revoked, the session and the account's cart
 * leave this browser, and the cart goes back to the local mode a guest shops in.
 * The server cart itself is never deleted — it belongs to the customer, not to
 * the browser they happened to sign out of.
 */
export function ProfilePage() {
  const { t, msg } = useText();
  const profile = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const settings = useSettings();
  const inTelegram = isTelegramWebApp();
  const webapp = useEffectiveLayout() === 'webapp';
  const hasChatLinks = Boolean(settings.brand.links.whatsapp || settings.brand.links.telegram);

  const signOut = async () => {
    setSigningOut(true);
    // A revoke that fails still ends the session here: the token is useless to a
    // customer who has left, and refusing to sign them out would be the worse answer.
    await logout().catch(() => undefined);

    // The page builder's fixture session: the editor refused the call (and said so). Clearing or
    // reloading here would drop the editor frame out of builder mode.
    if (isBuilderMode()) {
      setSigningOut(false);
      return;
    }

    useSessionStore.getState().clear();
    useCartStore.getState().clear();
    useCartStore.getState().setMode('local');
    resetCartSync();

    // A real navigation, not a router one. Clearing the session re-renders the
    // route guard that is still mounted over this page, and its `<Navigate>` to
    // `/login?returnTo=/account/profile` lands *after* any `navigate('/')` this
    // handler makes — measured three ways (before the clear, after it, and
    // inside `flushSync`), because the guard re-renders from the external store
    // while React still holds the account tree. Reloading also drops every
    // cached query and in-memory store, so nothing personal survives the sign-out.
    window.location.assign('/');
  };

  if (profile.isPending) return <PageSkeleton inline />;

  if (profile.isError) {
    return (
      <EmptyState
        eyebrow={t('account.nav.profile')}
        title={t('account.profile.loadFailedTitle')}
        description={t('account.profile.loadFailedBody')}
        action={
          <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  }

  const data = profile.data;

  return (
    <div className={classes.body}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.profile.detailsTitle')}</h3>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('account.profile.name')}</span>
        <span className={classes.rowFigure}>{data.nickname ?? t('account.profile.nameNotSet')}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('account.profile.memberSince')}</span>
        <span className={classes.rowFigure}>{formatDate(data.memberSince)}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('account.profile.orders')}</span>
        <span className={classes.rowFigure}>{data.totalOrders}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('account.profile.totalSpend')}</span>
        <span className={classes.rowFigure}>
          <Money amount={data.totalSpend} />
        </span>
      </div>

      <section className={classes.section} aria-label={t('account.profile.channelsAria')}>
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>{t('account.profile.channelsTitle')}</h3>
        </div>
        <ul className={classes.identities}>
          {CHANNELS.map((channel) => {
            const linked = data.identities[channel.key];
            return (
              <li
                key={channel.key}
                className={linked ? `${classes.identity} ${classes.identityOn}` : classes.identity}
              >
                <span className={linked ? `${classes.dot} ${classes.dotOn}` : classes.dot} aria-hidden />
                {linked
                  ? t('account.profile.channelLinked', { channel: msg(channel.label) })
                  : t('account.profile.channelNotLinked', { channel: msg(channel.label) })}
              </li>
            );
          })}
        </ul>
        <p className={classes.note}>
          {t('account.profile.channelsNote')}
        </p>
      </section>

      {webapp && hasChatLinks ? (
        <section className={classes.section} aria-label={t('account.profile.contactAria')}>
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>{t('account.profile.talkToUs')}</h3>
          </div>
          <ContactLinks variant="inline" />
        </section>
      ) : null}

      {inTelegram && settings.telegramWebApp?.mode === 'beta' ? <ClassicBotSwitch /> : null}

      {/* Inside Telegram the identity is the Telegram account: signing out would
          only sign straight back in on the next launch. */}
      {inTelegram ? null : (
        <button
          type="button"
          className={classes.logout}
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {signingOut ? t('account.profile.signingOut') : t('account.profile.signOut')}
        </button>
      )}
    </div>
  );
}
