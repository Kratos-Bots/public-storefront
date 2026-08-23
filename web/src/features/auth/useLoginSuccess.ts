import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { fetchCart, putCart } from '@/api/cart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { errorMessage } from '@/lib/errors.ts';
import type { LoginResult } from '@/types/auth.ts';
import type { CartLineInput, ServerCartLine } from '@/types/cart.ts';

/** Where a customer lands when nothing said otherwise. */
export const DEFAULT_LANDING = '/account';

/**
 * A return path is only ever an in-app one. It arrives from a `?returnTo=`
 * query string, so anything that could resolve to another origin — a scheme, a
 * protocol-relative `//host`, the backslash browsers fold into a slash — is
 * refused rather than sanitised: an open redirect out of a shop that has just
 * minted a session token is worth being blunt about.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

/**
 * The cart the customer ends up with: everything the account already held, plus
 * everything this browser was carrying, quantities summed where they overlap.
 * Neither side loses a line — a phone picked up mid-shop and a laptop cart left
 * open last week are the same order.
 *
 * The server's lines keep their order and the browser-only ones follow, so the
 * cart a returning customer knows doesn't reshuffle at sign-in.
 */
export function unionCartLines(server: ServerCartLine[], local: CartLineInput[]): CartLineInput[] {
  const quantities = new Map<number, number>();
  for (const item of server) quantities.set(item.productId, item.quantity);
  for (const item of local) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Everything that happens the moment a login token comes back, whichever
 * provider produced it: store the session, fold the guest cart into the
 * account's, then hand the customer back to whatever they were doing.
 *
 * The cart work is deliberately not allowed to fail the login. A shopper who
 * has just proved who they are is signed in; if the merge breaks they are told
 * plainly and keep every line they picked, in local mode, rather than being
 * dropped back at a sign-in page they have already passed.
 */
export function useLoginSuccess(): (result: LoginResult) => Promise<void> {
  const navigate = useNavigate();
  const client = useQueryClient();

  return useCallback(
    async (result: LoginResult) => {
      // Read where they were headed before writing anything: `setSession` swaps
      // the whole state object, so a snapshot taken before it is stale after it.
      const destination = safeReturnTo(useSessionStore.getState().returnTo) ?? DEFAULT_LANDING;
      // The api client reads the token from the store to sign the cart calls below,
      // so the session has to be in place before the first of them goes out.
      useSessionStore.getState().setSession(result.token, result.customer);

      // A previous session in this tab can have left a debounce timer armed and a
      // stale server cart cached; neither belongs to the customer signing in now.
      resetCartSync();

      try {
        const local = useCartStore.getState().mergeForLogin();
        const server = await fetchCart();
        const merged =
          local.length === 0 ? server : await putCart(unionCartLines(server.items, local));
        useCartStore.getState().replaceFromServer(merged);
        await client.invalidateQueries({ queryKey: ['cart'] });
      } catch (err) {
        // Left in local mode on purpose: adopting the server cart here would
        // quietly discard the lines the merge failed to save.
        notifications.show({
          message: errorMessage(err, "We couldn't add your basket to your account"),
          color: 'red',
        });
      }

      useSessionStore.getState().setReturnTo(null);
      navigate(destination, { replace: true });
    },
    [navigate, client],
  );
}
