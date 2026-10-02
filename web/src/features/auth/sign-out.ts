import { logout } from '@/api/auth.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { accessGate } from '@/app/access-gate.ts';

/**
 * Ends the session and reloads to the home page. Signing out is a local act as
 * much as a server one: the token is revoked, the session and the account's cart
 * leave this browser, and the cart goes back to the local mode a guest shops in.
 *
 * A real navigation, not a router one. Clearing the session re-renders the
 * route guard that is still mounted over the page, and its `<Navigate>` to
 * `/login?returnTo=/account/profile` lands *after* any `navigate('/')` this
 * handler makes — measured three ways (before the clear, after it, and
 * inside `flushSync`), because the guard re-renders from the external store
 * while React still holds the account tree. Reloading also drops every
 * cached query and in-memory store, so nothing personal survives the sign-out.
 */
export async function signOutAndReload(): Promise<void> {
  // A revoke that fails still ends the session here: the token is useless to a
  // customer who has left, and refusing to sign them out would be the worse answer.
  await logout().catch(() => undefined);
  useSessionStore.getState().clear();
  useCartStore.getState().clear();
  useCartStore.getState().setMode('local');
  resetCartSync();
  accessGate.getState().reset();
  window.location.assign('/');
}
