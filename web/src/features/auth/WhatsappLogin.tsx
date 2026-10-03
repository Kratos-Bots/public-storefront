import { useEffect, useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { ArrowLeftIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { useWhatsappLogin } from '@/features/auth/useWhatsappLogin.ts';
import { useText } from '@/text/runtime.tsx';
import buttons from '@/features/auth/AuthButtons.module.css';
import classes from '@/features/auth/WhatsappLogin.module.css';

/** A bare international number reads as a number once it has its plus. */
function dialable(number: string | null): string | null {
  if (!number) return null;
  const trimmed = number.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? `+${trimmed}` : trimmed;
}

/**
 * The clipboard API is missing outside a secure context — a shop served over
 * plain http, which a self-hosted one can be. A Copy button that does nothing
 * when pressed is worse than no button, so the affordance falls back to the
 * code block itself, which selects whole on a click (`user-select: all`).
 */
function canCopy(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard;
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
 * Sign in by sending a message. Before anything happens it is one labelled
 * button; the explanation arrives only once the shopper has tapped it. The
 * customer's credential then is a string they carry into another app, so once an
 * attempt is open the code is the largest thing on the page, set on its own slip
 * with the number it goes to underneath.
 *
 * The button above the slip is the fast path (it opens WhatsApp with the message
 * already written); the slip is what makes this work on a desktop with no
 * WhatsApp installed, or on a phone that opened the link in the wrong app.
 *
 * `onWaiting` tells the page when an attempt is open, so it can step the other
 * ways in out of the way for the length of the wait.
 */
export function WhatsappLogin({ number, onWaiting }: { number: string | null; onWaiting?: (waiting: boolean) => void }) {
  const { state, start, cancel, pending, data, deadline, error } = useWhatsappLogin();
  const { t } = useText();
  const remaining = useRemaining(state === 'started' ? deadline : undefined);
  const clipboard = useClipboard({ timeout: 1600 });
  const to = dialable(number);
  // The other ways stay out of the way for the whole round trip, including the moment the
  // message has arrived and the session is being made.
  const waiting = (state === 'started' && Boolean(data)) || state === 'completed' || state === 'done';
  useEffect(() => {
    onWaiting?.(waiting);
  }, [waiting, onWaiting]);

  if (state === 'completed' || state === 'done') {
    return (
      <p className={classes.settled} role="status">
        <span className={classes.dot} aria-hidden />
        {t('auth.whatsapp.received')}
      </p>
    );
  }

  if (state === 'expired') {
    return (
      <>
        <AuthNote tone="warn">{t('auth.whatsapp.expiredNote')}</AuthNote>
        <p className={classes.lede}>
          {t('auth.whatsapp.expiredBody')}
        </p>
        <button
          type="button"
          className={buttons.primary}
          onClick={start}
          disabled={pending}
          data-sf-part="button"
          data-variant="filled"
        >
          {t('auth.whatsapp.startAgain')}
        </button>
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <AuthNote tone="danger">{error ?? t('errors.generic')}</AuthNote>
        <button
          type="button"
          className={buttons.primary}
          onClick={start}
          disabled={pending}
          data-sf-part="button"
          data-variant="filled"
        >
          {t('common.actions.tryAgain')}
        </button>
      </>
    );
  }

  if (state === 'started' && data) {
    return (
      <>
        <a
          className={buttons.primary}
          href={data.waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-sf-part="button"
          data-variant="filled"
        >
          <span className={buttons.icon}><WhatsAppIcon size={20} /></span>
          {t('auth.whatsapp.open')}
        </a>

        <div className={classes.slip}>
          <span className={classes.slipLabel}>
            {to ? t('auth.whatsapp.sendCodeTo', { number: to }) : t('auth.whatsapp.sendCodeToUs')}
          </span>
          <div className={classes.slipRow}>
            <code className={classes.code}>{data.code}</code>
            {canCopy() ? (
              <button
                type="button"
                className={classes.copy}
                onClick={() => clipboard.copy(data.code)}
                aria-label={t('auth.whatsapp.copyCode', { code: data.code })}
              >
                {clipboard.copied ? t('common.actions.copied') : t('common.actions.copy')}
              </button>
            ) : null}
          </div>
        </div>

        <p className={classes.waiting} role="status">
          <span className={classes.pulse} aria-hidden />
          {t('auth.whatsapp.waiting')}
          <span className={classes.clock} aria-hidden>
            {clock(remaining)}
          </span>
        </p>

        <button type="button" className={buttons.back} onClick={cancel}>
          <ArrowLeftIcon size={18} />
          {t('auth.whatsapp.back')}
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttons.quick}
        onClick={start}
        disabled={pending}
      >
        <span className={buttons.icon}><WhatsAppIcon size={20} /></span>
        {pending ? t('auth.whatsapp.starting') : t('auth.whatsapp.continue')}
      </button>
    </>
  );
}
