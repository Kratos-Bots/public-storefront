import { useState } from 'react';
import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { formatDate } from '@/lib/format.ts';
import { logout } from '@/api/auth.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { useProfile } from '@/features/account/queries.ts';
import type { Profile } from '@/types/profile.ts';
import classes from '@/features/account/Account.module.css';

const CHANNELS: Array<{ key: keyof Profile['identities']; label: string }> = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
];

/**
 * Who the shop has you down as, and the way out. Signing out is a local act as
 * much as a server one: the token is revoked, the session and the account's cart
 * leave this browser, and the cart goes back to the local mode a guest shops in.
 * The server cart itself is never deleted — it belongs to the customer, not to
 * the browser they happened to sign out of.
 */
export function ProfilePage() {
  const profile = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    // A revoke that fails still ends the session here: the token is useless to a
    // customer who has left, and refusing to sign them out would be the worse answer.
    await logout().catch(() => undefined);

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
        eyebrow="Profile"
        title="We couldn't load your profile"
        description="This was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const data = profile.data;

  return (
    <div className={classes.body}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>Your details</h3>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}>Name</span>
        <span className={classes.rowFigure}>{data.nickname ?? 'Not set'}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>Member since</span>
        <span className={classes.rowFigure}>{formatDate(data.memberSince)}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>Orders</span>
        <span className={classes.rowFigure}>{data.totalOrders}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>Total spend</span>
        <span className={classes.rowFigure}>
          <Money amount={data.totalSpend} />
        </span>
      </div>

      <section className={classes.section} aria-label="Sign-in channels">
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>Ways in</h3>
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
                {channel.label} {linked ? 'linked' : 'not linked'}
              </li>
            );
          })}
        </ul>
        <p className={classes.note}>
          Any linked channel signs you into this account — talk to us in a chat to add another.
        </p>
      </section>

      <button
        type="button"
        className={classes.logout}
        onClick={() => void signOut()}
        disabled={signingOut}
      >
        {signingOut ? 'Signing out' : 'Sign out'}
      </button>
    </div>
  );
}
