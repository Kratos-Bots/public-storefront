import { useEffect, useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { AuthNote } from '@/features/auth/AuthCard.tsx';
import { useWhatsappLogin } from '@/features/auth/useWhatsappLogin.ts';
import classes from '@/features/auth/WhatsappLogin.module.css';

/** A bare international number reads as a number once it has its plus. */
function dialable(number: string | null): string | null {
  if (!number) return null;
  const trimmed = number.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? `+${trimmed}` : trimmed;
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Milliseconds left on the open attempt, re-read once a second. Idle when there is no attempt. */
function useRemaining(deadline: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === undefined) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === undefined ? 0 : Math.max(0, deadline - now);
}

/**
 * Sign in by sending a message. The customer's credential here is a string they
 * carry into another app, so once an attempt is open the code is the largest
 * thing on the page — bigger than the heading — set on its own slip with the
 * number it goes to underneath.
 *
 * The button above it is the fast path (it opens WhatsApp with the message
 * already written); the slip is what makes the card work on a desktop with no
 * WhatsApp installed, or on a phone that opened the link in the wrong app.
 */
export function WhatsappLogin({ number }: { number: string | null }) {
  const { state, start, pending, data, deadline, error } = useWhatsappLogin();
  const remaining = useRemaining(state === 'started' ? deadline : undefined);
  const clipboard = useClipboard({ timeout: 1600 });
  const to = dialable(number);

  if (state === 'completed' || state === 'done') {
    return (
      <p className={classes.settled} role="status">
        <span className={classes.dot} aria-hidden />
        Message received — signing you in
      </p>
    );
  }

  if (state === 'expired') {
    return (
      <>
        <AuthNote tone="warn">That code expired</AuthNote>
        <p className={classes.lede}>
          A code is only good for a few minutes. Start a new one when you&rsquo;re ready to send it.
        </p>
        <button type="button" className={classes.cta} onClick={start} disabled={pending}>
          Start again
        </button>
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <AuthNote tone="danger">{error ?? 'Something went wrong'}</AuthNote>
        <button type="button" className={classes.cta} onClick={start} disabled={pending}>
          Try again
        </button>
      </>
    );
  }

  if (state === 'started' && data) {
    return (
      <>
        <a className={classes.cta} href={data.waLink} target="_blank" rel="noopener noreferrer">
          Open WhatsApp
        </a>

        <div className={classes.slip}>
          <span className={classes.slipLabel}>
            {to ? `Or send this code to ${to}` : 'Or send this code to us on WhatsApp'}
          </span>
          <div className={classes.slipRow}>
            <code className={classes.code}>{data.code}</code>
            <button
              type="button"
              className={classes.copy}
              onClick={() => clipboard.copy(data.code)}
              aria-label={`Copy the code ${data.code}`}
            >
              {clipboard.copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <p className={classes.waiting} role="status">
          <span className={classes.pulse} aria-hidden />
          Waiting for your message
          <span className={classes.clock} aria-hidden>
            {clock(remaining)}
          </span>
        </p>
      </>
    );
  }

  return (
    <>
      <p className={classes.lede}>
        Send us one message from WhatsApp and you&rsquo;re in. Nothing to remember, nothing to type
        back.
      </p>
      <button type="button" className={classes.cta} onClick={start} disabled={pending}>
        {pending ? 'Starting…' : 'Continue with WhatsApp'}
      </button>
    </>
  );
}
