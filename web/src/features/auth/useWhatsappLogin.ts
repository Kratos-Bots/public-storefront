import { useCallback, useEffect, useRef, useState } from 'react';
import { completeWhatsapp, pollAttempt, startWhatsapp } from '@/api/auth.ts';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import type { WhatsappStart } from '@/types/auth.ts';

/** Gap between attempt polls (spec §4.6). */
export const POLL_INTERVAL_MS = 2_000;
/** How long we watch one attempt before calling it stale, whatever its own expiry says. */
export const MAX_WAIT_MS = 5 * 60_000;

export type WhatsappLoginState = 'idle' | 'started' | 'completed' | 'done' | 'expired' | 'error';

export interface WhatsappLoginController {
  state: WhatsappLoginState;
  /** Open an attempt. Safe to call again from `expired` or `error` — it starts a fresh one. */
  start: () => void;
  /** True while the start request is in the air, so one tap can't open two attempts. */
  pending: boolean;
  /** The open attempt: its code, its `wa.me` link, its expiry. */
  data?: WhatsappStart;
  /** Epoch ms at which this attempt stops being watched — what the countdown counts to. */
  deadline?: number;
  error?: string;
}

/** The moment this attempt stops being watched: its own expiry, or our cap, whichever is sooner. */
function deadlineFor(attempt: WhatsappStart, now: number): number {
  const expiry = Date.parse(attempt.expiresAt);
  const cap = now + MAX_WAIT_MS;
  return Number.isNaN(expiry) ? cap : Math.min(expiry, cap);
}

/**
 * The WhatsApp sign-in, end to end: open an attempt, hand its code to the UI,
 * watch it, and turn a confirmed one into a session.
 *
 * The watch is a `setTimeout` chain rather than an interval so a slow response
 * can never stack requests on a struggling connection, and so the chain simply
 * stops instead of having to be cancelled on every outcome.
 *
 * `POST /auth/whatsapp/complete` is **single-use** — it consumes the attempt
 * whatever it answers — so it is called once, only after a poll has already
 * reported `completed`, and never on a guess.
 */
export function useWhatsappLogin(): WhatsappLoginController {
  const [state, setState] = useState<WhatsappLoginState>('idle');
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<WhatsappStart | undefined>();
  const [deadline, setDeadline] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  const onLogin = useLoginSuccess();
  const onLoginRef = useRef(onLogin);
  // Kept in a ref, written in an effect rather than during render: `start` is
  // created once and the watch chain it closes over outlives any single render,
  // so it has to reach the current handler rather than the one that existed
  // when the attempt opened.
  useEffect(() => {
    onLoginRef.current = onLogin;
  }, [onLogin]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  /**
   * Bumped by every `start()`. A response belonging to an attempt the customer
   * has already restarted past is dropped rather than allowed to overwrite the
   * new one — including the in-flight poll a restart cannot cancel.
   */
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (starting.current) return;
    const gen = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    /** Still the attempt the customer is looking at, on a page that still exists. */
    const current = () => mounted.current && gen === generation.current;

    const finish = async (attempt: WhatsappStart) => {
      setState('completed');
      try {
        const result = await completeWhatsapp(attempt.attemptId, attempt.attemptSecret);
        if (!current()) return;
        await onLoginRef.current(result);
        if (!current()) return;
        setState('done');
      } catch (err) {
        if (!current()) return;
        // The backend answers 401 for "expired, unknown, or wrong secret" with
        // no way to tell them apart — deliberately, so it gives no oracle. From
        // the customer's side all three are the code having run out, and the
        // expired state says so with the action that fixes it, rather than
        // showing them the word "Unauthorized" and a dead end.
        if (err instanceof ApiError && err.isUnauthorized) {
          setState('expired');
          return;
        }
        setError(errorMessage(err, "We couldn't finish signing you in"));
        setState('error');
      }
    };

    const watch = (attempt: WhatsappStart, until: number) => {
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!current()) return;
        if (Date.now() >= until) {
          setState('expired');
          return;
        }
        void (async () => {
          try {
            const { status } = await pollAttempt(attempt.attemptId);
            if (!current()) return;
            if (status === 'completed') {
              await finish(attempt);
              return;
            }
            if (status === 'expired') {
              setState('expired');
              return;
            }
          } catch {
            // A dropped poll is not a failed login — the attempt is still open on
            // the server. Keep watching until the deadline says otherwise.
            if (!current()) return;
          }
          watch(attempt, until);
        })();
      }, POLL_INTERVAL_MS);
    };

    starting.current = true;
    setPending(true);
    setError(undefined);
    setData(undefined);
    setDeadline(undefined);
    setState('idle');

    void (async () => {
      try {
        const attempt = await startWhatsapp();
        if (!current()) return;
        const until = deadlineFor(attempt, Date.now());
        setData(attempt);
        setDeadline(until);
        setState('started');
        watch(attempt, until);
      } catch (err) {
        if (!current()) return;
        setError(errorMessage(err, "We couldn't start a WhatsApp sign-in"));
        setState('error');
      } finally {
        if (gen === generation.current) starting.current = false;
        if (current()) setPending(false);
      }
    })();
  }, []);

  return { state, start, pending, data, deadline, error };
}
