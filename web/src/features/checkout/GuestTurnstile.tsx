import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

const MINT_TIMEOUT_MS = 30_000;
/** How long an unclaimed token is worth sending. Cloudflare expires tokens after
 *  five minutes; well inside that, a fresh challenge is cheaper than a `422`. */
const STASH_TTL_MS = 120_000;
const FAILED = "We couldn't verify your browser — please try again";

export interface GuestTurnstileHandle {
  /**
   * Run the invisible widget and resolve with a fresh token. Every guest call
   * — each quote and the final place-order — needs its own: Cloudflare consumes
   * a token on verification, so a reused one is a guaranteed
   * `422 Verification failed` (STOREFRONT.md §3.5a).
   */
  mint: () => Promise<string>;
}

interface Pending {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The guest checkout's bot check, kept invisible. The page never touches the
 * widget: it awaits a token from `mint()`, sends it, and forgets it. Two things
 * this has to get right, both of which cost a stuck "Verifying…" if missed:
 *
 * - **A mint asked for before the widget exists is queued, not dropped.** The
 *   first quote is asked for as soon as the shopper has an address, which on a
 *   warm page is well before Cloudflare's script has finished loading — calling
 *   `execute()` then does nothing at all (the library logs "Turnstile has not
 *   been loaded" and returns). `onWidgetLoad` is the signal that there is
 *   actually a widget to execute.
 * - **A token the widget produces unasked is kept, not thrown away.** Despite
 *   `execution: 'execute'`, a widget can solve on render (the always-pass test
 *   key does) and call `onSuccess` while no mint is outstanding. Dropping that
 *   token strands the next `mint()`, because `execute()` on an already-solved
 *   widget is a no-op and no second `onSuccess` ever comes. So it is stashed and
 *   handed to the next caller instead — once, and only while it is fresh.
 */
export const GuestTurnstile = forwardRef<GuestTurnstileHandle, { siteKey: string }>(
  function GuestTurnstile({ siteKey }, ref) {
    const widget = useRef<TurnstileInstance | undefined>(undefined);
    const pending = useRef<Pending | null>(null);
    const ready = useRef(false);
    const queued = useRef(false);
    const used = useRef(false);
    const stash = useRef<{ token: string; at: number } | null>(null);

    // These only ever touch refs, so the identities captured by the handle and the
    // callbacks below stay correct for the life of the component.
    function settle(apply: (p: Pending) => void) {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      clearTimeout(p.timer);
      apply(p);
    }

    function fire() {
      // Reset only between runs: a freshly rendered widget has nothing to clear.
      if (used.current) widget.current?.reset();
      used.current = true;
      widget.current?.execute();
    }

    function takeStash(): string | null {
      const held = stash.current;
      stash.current = null;
      if (!held) return null;
      return Date.now() - held.at <= STASH_TTL_MS ? held.token : null;
    }

    useImperativeHandle(
      ref,
      () => ({
        mint: () =>
          new Promise<string>((resolve, reject) => {
            // A mint still waiting is superseded, not left dangling — its caller
            // is no longer the one asking.
            settle((p) => p.reject(new Error('Verification restarted')));

            const inHand = takeStash();
            if (inHand) {
              used.current = true; // the next mint must reset before executing
              resolve(inHand);
              return;
            }

            const timer = setTimeout(
              () => settle((p) => p.reject(new Error(FAILED))),
              MINT_TIMEOUT_MS,
            );
            pending.current = { resolve, reject, timer };
            if (ready.current) fire();
            else queued.current = true;
          }),
      }),
      [],
    );

    useEffect(() => () => settle((p) => p.reject(new Error('Verification cancelled'))), []);

    return (
      <Turnstile
        ref={widget}
        siteKey={siteKey}
        options={{ size: 'invisible', execution: 'execute' }}
        onWidgetLoad={() => {
          ready.current = true;
          if (!queued.current) return;
          queued.current = false;
          fire();
        }}
        onSuccess={(token) => {
          if (pending.current) {
            settle((p) => p.resolve(token));
            return;
          }
          stash.current = { token, at: Date.now() };
        }}
        onError={() => {
          stash.current = null;
          settle((p) => p.reject(new Error(FAILED)));
        }}
        onExpire={() => {
          stash.current = null;
          settle((p) => p.reject(new Error('Verification expired — please try again')));
        }}
      />
    );
  },
);
