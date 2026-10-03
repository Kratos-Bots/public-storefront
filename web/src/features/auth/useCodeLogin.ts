import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useSettings } from '@/app/settings.ts';
import { queryClient, SETTINGS_KEY } from '@/lib/query-client.ts';
import { codeEmail, codeEmailSend, codePhone, codeResend, codeVerify, passwordForgot, passwordLogin } from '@/api/auth.ts';
import type { GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { otherPhoneChannel, toAttempt, type CodeAttempt, type CodeKind } from '@/features/auth/code-attempt.ts';
import { codeFailure, incorrectFailure, isLoginUnavailable, type CodeFailure } from '@/features/auth/code-errors.ts';
import { passwordErrorMessage } from '@/features/auth/password-errors.ts';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import type { CodeSent } from '@/types/auth.ts';

export type CodeView = 'choose' | 'phone' | 'email' | 'password' | 'forgot' | 'code';

export interface CodeLogin {
  view: CodeView;
  /** Move to a view; clears the failure, the "sent" note and, leaving the code screen, the attempt. */
  go: (view: 'choose' | 'phone' | 'email' | 'password' | 'forgot') => void;
  attempt: CodeAttempt | null;
  /** The address typed on the email step, kept for the password and forgot views. */
  email: string;
  failure: CodeFailure | null;
  /** A resend, a channel switch or a reset link just went out. */
  sent: boolean;
  pending: boolean;
  /**
   * Counts verify calls that did not sign in: a wrong code, a failed request, a rate limit, or a call the
   * busy guard dropped. The screen owns the typed code and clears it whenever this changes: `CodeInput`
   * only fires `onComplete` when the value changes, so a full code left in the box could never be re-submitted.
   */
  verifyAttempts: number;
  sendPhone: (phone: string, channel: 'whatsapp' | 'sms') => Promise<void>;
  submitEmail: (email: string) => Promise<void>;
  emailMeCode: () => Promise<void>;
  passwordSignIn: (password: string) => Promise<void>;
  sendReset: () => Promise<void>;
  resend: () => Promise<void>;
  switchChannel: () => Promise<void>;
  sendNewCode: () => Promise<void>;
  verify: (code: string) => Promise<void>;
}

/** The request that opened the current attempt, so an expired code can be replaced by repeating it. */
interface Opener { kind: CodeKind; start: () => Promise<CodeSent>; /** The typed number, for a phone attempt, so a channel switch can rebuild `start`. */ phone?: string }

/**
 * Sign in with a code, end to end. One request at a time: a second call while one is in the air is dropped,
 * which is what stops a double tap and the sixth digit landing during a resend from sending twice. A
 * Turnstile token is minted per call that can send and never for `verify`. `go()` ends whatever is in the air:
 * a late answer writes no state and does not hold the new screen's `busy` flag. Every success goes through
 * `useLoginSuccess` (basket merge, `returnTo`). Every send carries the active text locale so the message is
 * worded in it; it is read when the call is made, not during render.
 */
export function useCodeLogin(turnstile: RefObject<GuestTurnstileHandle | null>): CodeLogin {
  const settings = useSettings();
  const onLogin = useLoginSuccess();
  const hasTurnstile = Boolean(settings.turnstile);
  const emailCodes = settings.login.email?.available === true;
  const passwords = settings.login.password?.available === true;

  const [view, setView] = useState<CodeView>('choose');
  const [email, setEmail] = useState('');
  const [attempt, setAttempt] = useState<CodeAttempt | null>(null);
  const [failure, setFailure] = useState<CodeFailure | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const busy = useRef(false);
  /** Bumped by `go()`: a request that started in an earlier generation is stale and must not touch state. */
  const generation = useRef(0);
  const mounted = useRef(true);
  const opener = useRef<Opener | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** A token is spent by the call that carries it: mint one per send, never reuse. */
  const mint = useCallback(async (): Promise<string | undefined> => {
    if (!hasTurnstile) return undefined;
    // A widget that is not mounted yet is the same as a failed mint: no request without a token.
    if (!turnstile.current) throw new Error(textSnapshot().t('checkout.errors.verifyFailed'));
    return turnstile.current.mint();
  }, [hasTurnstile, turnstile]);

  const run = useCallback(async (work: (live: () => boolean) => Promise<void>, describe: (err: unknown) => CodeFailure = (err) => codeFailure(err)) => {
    if (busy.current) return;
    busy.current = true;
    const mine = generation.current;
    const live = () => mounted.current && generation.current === mine;
    setPending(true);
    setFailure(null);
    setSent(false);
    try {
      await work(live);
    } catch (err) {
      // The shop switched this mode off under the visitor: the settings they hold are stale.
      if (isLoginUnavailable(err)) void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      if (live()) setFailure(describe(err));
    } finally {
      // After `go()` the new screen owns both flags.
      if (generation.current === mine) {
        busy.current = false;
        if (mounted.current) setPending(false);
      }
    }
  }, []);

  const open = useCallback((kind: CodeKind, result: CodeSent) => {
    setAttempt(toAttempt(kind, result));
    setView('code');
  }, []);

  /** Run an opening request, remember it for "Send a new code", and open the code screen. */
  const begin = useCallback(async (next: Opener, live: () => boolean) => {
    const result = await next.start();
    if (!live()) return;
    opener.current = next;
    open(next.kind, result);
  }, [open]);

  const phoneOpener = useCallback((phone: string, channel: 'whatsapp' | 'sms'): Opener => ({
    kind: 'phone',
    phone,
    start: async () => codePhone(phone, channel, await mint(), { language: textSnapshot().locale }),
  }), [mint]);

  const go = useCallback((next: 'choose' | 'phone' | 'email' | 'password' | 'forgot') => {
    generation.current += 1;
    busy.current = false;
    setPending(false);
    setFailure(null);
    setSent(false);
    setAttempt(null);
    setView(next);
  }, []);

  const sendPhone = useCallback((phone: string, channel: 'whatsapp' | 'sms') => run(
    (live) => begin(phoneOpener(phone, channel), live),
    (err) => codeFailure(err, { channel }),
  ), [run, begin, phoneOpener]);

  const submitEmail = useCallback((value: string) => run(async (live) => {
    setEmail(value);
    const sendCode = async () => codeEmailSend(value, await mint(), { language: textSnapshot().locale });
    if (!emailCodes) {
      // No codes to offer: the password screen is the only way in.
      setView('password');
      return;
    }
    const answer = await codeEmail(value, await mint(), { language: textSnapshot().locale });
    if (!live()) return;
    if (answer.next === 'password') {
      if (passwords) { setView('password'); return; }
      await begin({ kind: 'email', start: sendCode }, live);
      return;
    }
    opener.current = { kind: 'email', start: sendCode };
    open('email', answer);
  }), [run, begin, open, mint, emailCodes, passwords]);

  const emailMeCode = useCallback(() => run(
    (live) => begin({ kind: 'email', start: async () => codeEmailSend(email, await mint(), { language: textSnapshot().locale }) }, live),
  ), [run, begin, mint, email]);

  const passwordSignIn = useCallback((password: string) => run(
    async () => { await onLogin(await passwordLogin({ email }, password)); },
    (err) => ({ kind: 'other', message: passwordErrorMessage(err, 'signin') }),
  ), [run, onLogin, email]);

  const sendReset = useCallback(() => run(
    async (live) => {
      await passwordForgot(email, await mint());
      if (live()) setSent(true);
    },
    (err) => ({ kind: 'other', message: passwordErrorMessage(err, 'forgot') }),
  ), [run, mint, email]);

  const resend = useCallback(() => {
    if (!attempt) return Promise.resolve();
    return run(
      async (live) => {
        const result = await codeResend(attempt.attemptId, { turnstileToken: await mint(), language: textSnapshot().locale });
        if (!live()) return;
        open(attempt.kind, result);
        setSent(true);
      },
      (err) => codeFailure(err, { channel: attempt.channel }),
    );
  }, [run, open, mint, attempt]);

  const switchChannel = useCallback(() => {
    if (!attempt || attempt.kind !== 'phone') return Promise.resolve();
    const to = otherPhoneChannel(attempt.channel);
    return run(
      async (live) => {
        const result = await codeResend(attempt.attemptId, { channel: to, turnstileToken: await mint(), language: textSnapshot().locale });
        if (!live()) return;
        // "Send a new code" after an expiry must go the way this one just went, not back to the first channel.
        const phone = opener.current?.phone;
        if (phone !== undefined) opener.current = phoneOpener(phone, to);
        open('phone', result);
        setSent(true);
      },
      (err) => codeFailure(err, { channel: to, switching: true }),
    );
  }, [run, open, mint, attempt, phoneOpener]);

  const sendNewCode = useCallback(() => {
    const last = opener.current;
    if (!last) return Promise.resolve();
    return run(
      (live) => begin(last, live),
      (err) => codeFailure(err, { channel: attempt?.channel }),
    );
  }, [run, begin, attempt]);

  const verify = useCallback((code: string) => {
    if (!attempt) return Promise.resolve();
    // Dropped by the busy guard: the box still holds the full code, so it has to be cleared all the same.
    if (busy.current) {
      setVerifyAttempts((n) => n + 1);
      return Promise.resolve();
    }
    return run(
      async (live) => {
        const result = await codeVerify(attempt.attemptId, code);
        if (result.status === 'incorrect') {
          if (live()) {
            setFailure(incorrectFailure(result.attemptsRemaining));
            setVerifyAttempts((n) => n + 1);
          }
          return;
        }
        await onLogin({ token: result.token, customer: result.customer });
      },
      // Only called for a live request: a failed verify clears the box like a wrong code does.
      (err) => {
        setVerifyAttempts((n) => n + 1);
        return codeFailure(err, { channel: attempt.channel });
      },
    );
  }, [run, onLogin, attempt]);

  return { view, go, attempt, email, failure, sent, pending, verifyAttempts, sendPhone, submitEmail, emailMeCode, passwordSignIn, sendReset, resend, switchChannel, sendNewCode, verify };
}
