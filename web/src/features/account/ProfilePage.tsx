import { useMemo, useState } from 'react';
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
import { ProfileFamily, type ProfileData, type ProfilePreview } from '@/builder/family-profile.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
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
function ClassicBotSwitch({ rootAttrs }: { rootAttrs?: PartViewProps['styleAttrs'] }) {
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
    <section className={classes.section} aria-label={t('account.profile.botAria')} {...rootAttrs}>
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

function DetailsView() {
  const { t } = useText();
  const { profile: data } = ProfileFamily.useData();
  return (
    <>
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
    </>
  );
}

function ChannelsView({ styleAttrs }: PartViewProps) {
  const { t, msg } = useText();
  const { profile: data } = ProfileFamily.useData();
  return (
    <section className={classes.section} aria-label={t('account.profile.channelsAria')} {...styleAttrs}>
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
  );
}

function ContactView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { showContact } = ProfileFamily.useData();
  if (!showContact) return null;
  return (
    <section className={classes.section} aria-label={t('account.profile.contactAria')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.profile.talkToUs')}</h3>
      </div>
      <ContactLinks variant="inline" />
    </section>
  );
}

function BotSwitchView({ styleAttrs }: PartViewProps) {
  const { showBotSwitch } = ProfileFamily.useData();
  return showBotSwitch ? <ClassicBotSwitch rootAttrs={styleAttrs} /> : null;
}

function SignOutView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { surface, signOut, signingOut } = ProfileFamily.useData();
  // Inside Telegram the identity is the Telegram account: signing out would
  // only sign straight back in on the next launch.
  if (surface === 'telegram') return null;
  return (
    <button
      type="button"
      className={classes.logout}
      onClick={() => signOut()}
      disabled={signingOut}
      {...styleAttrs}
    >
      {signingOut ? t('account.profile.signingOut') : t('account.profile.signOut')}
    </button>
  );
}

/** The profile tab's views (spec §5.4): the v0.7.0 JSX of each piece. */
export const PROFILE_VIEWS: FamilyValue<ProfileData>['views'] = {
  ProfileDetails: DetailsView, ProfileChannels: ChannelsView, ProfileContact: ContactView,
  ProfileBotSwitch: BotSwitchView, ProfileSignOut: SignOutView,
};

/**
 * Who the shop has you down as, and the way out. Signing out is a local act as
 * much as a server one: the token is revoked, the session and the account's cart
 * leave this browser, and the cart goes back to the local mode a guest shops in.
 * The server cart itself is never deleted — it belongs to the customer, not to
 * the browser they happened to sign out of.
 *
 * The Profile container: the query and the sign-out (session and cart clearing, hard
 * navigation) stay here; the `content` slot holds the parts. Without `slots` the default
 * arrangement is drawn.
 */
export function ProfilePage({ slots }: { slots?: { content: SlotRender } } = {}) {
  const { t } = useText();
  const fixture = usePreviewFixture<ProfilePreview>('Profile');
  // The editor previews from a fixture (spec §11.3). Its profile replaces the query, which then
  // never fires; a fixture without a profile still needs the query's.
  const preview = fixture !== null;
  const profile = useProfile(fixture?.profile === undefined);
  const [signingOut, setSigningOut] = useState(false);
  const settings = useSettings();
  const inTelegram = isTelegramWebApp();
  const webapp = useEffectiveLayout() === 'webapp';
  const hasChatLinks = Boolean(settings.brand.links.whatsapp || settings.brand.links.telegram);
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('Profile', 'storefront', {}, 'account.profile')), [slots]);
  const content = slots?.content ?? legacy!.content!;

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

  const usingFixture = preview && fixture.profile !== undefined;
  const data = usingFixture ? fixture.profile : profile.data;
  const surface: ProfileData['surface'] = preview ? fixture.surface : inTelegram ? 'telegram' : webapp ? 'webapp' : 'website';
  const showContact = preview ? fixture.surface === 'webapp' : webapp && hasChatLinks;
  const showBotSwitch = !preview && inTelegram && settings.telegramWebApp?.mode === 'beta';
  const value: FamilyValue<ProfileData> | null = useMemo(
    () => (data ? { data: { profile: data, signOut: () => void signOut(), signingOut, surface, showContact, showBotSwitch }, views: PROFILE_VIEWS } : null),
    // `signOut` only closes over `setSigningOut` and module state, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, signingOut, surface, showContact, showBotSwitch],
  );

  if (!usingFixture && profile.isPending) return <PageSkeleton inline />;

  if (!usingFixture && profile.isError) {
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

  return <ProfileFamily.Provider value={value!}>{content({ className: classes.body })}</ProfileFamily.Provider>;
}
