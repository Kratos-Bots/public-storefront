import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { CodeInput } from '@/features/auth/CodeInput.tsx';
import { formatClock } from '@/features/auth/code-attempt.ts';
import { useSecondsLeft } from '@/features/auth/useSecondsLeft.ts';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
import { useText } from '@/text/runtime.tsx';
import type { CodeChannel } from '@/types/auth.ts';
import buttons from '@/features/auth/AuthButtons.module.css';
import password from '@/features/auth/PasswordLogin.module.css';
import classes from '@/features/auth/CodeSignIn.module.css';

/**
 * "Enter the 6-digit code we sent to …". One box that submits itself at six digits; quiet links for resend (greyed
 * with a countdown for the first minute) and, for a phone, the other channel. A verify that did not sign in clears
 * the box and puts the cursor back in it once the request is over. A code that expired locks the box, drops the
 * resend links and offers one button for a fresh code. "Too many tries" (which a rate-limited resend also causes)
 * leaves the box usable, because the code the shopper holds may still be good, and offers the same button.
 */
export function CodeStep({ form }: { form: CodeLogin }) {
  const { t } = useText();
  const { attempt, failure, sent, pending, verifyAttempts } = form;
  const [value, setValue] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const sendNew = useRef<HTMLButtonElement>(null);
  const refocused = useRef(verifyAttempts);
  const errorId = useId();
  const seconds = useSecondsLeft(attempt ? attempt.resendAt : null);
  const attemptId = attempt?.attemptId;

  // A new code (or the same one sent again) starts with an empty box under the cursor.
  useEffect(() => {
    setValue('');
    box.current?.focus();
  }, [attemptId, sent]);

  // Every verify that did not sign in empties the box: `CodeInput` only submits when its value changes, so a full
  // code left behind could never be sent again.
  useEffect(() => { setValue(''); }, [verifyAttempts]);

  // The cursor goes back only once the box is enabled again: a mobile keyboard closes if a focused input is disabled.
  useEffect(() => {
    if (pending || refocused.current === verifyAttempts) return;
    refocused.current = verifyAttempts;
    box.current?.focus();
  }, [pending, verifyAttempts]);

  const expired = failure?.kind === 'expired';
  // The box is locked and the old code is useless, so the one thing left to do is the one thing to land on.
  useEffect(() => {
    if (expired) sendNew.current?.focus();
  }, [expired]);

  if (!attempt) return null;

  const word = (channel: CodeChannel) => (channel === 'whatsapp' ? t('auth.code.channel.whatsapp') : channel === 'sms' ? t('auth.code.channel.sms') : t('auth.code.channel.email'));
  const isPhone = attempt.kind === 'phone';
  const offerNew = expired || failure?.kind === 'tooMany';

  return (
    <div className={password.root}>
      <button type="button" className={buttons.back} disabled={pending} onClick={() => form.go(isPhone ? 'phone' : 'email')}>
        <ArrowLeftIcon size={18} />
        {isPhone ? t('auth.code.differentNumber') : t('auth.code.differentEmail')}
      </button>
      <h2 className={password.title}>{t('auth.code.enter.title')}</h2>
      <p className={password.body}>{t('auth.code.enter.body', { to: attempt.maskedTo, channel: word(attempt.channel) })}</p>
      <CodeInput
        ref={box}
        value={value}
        onChange={setValue}
        onComplete={(code) => { void form.verify(code); }}
        disabled={pending || expired}
        invalid={failure?.kind === 'incorrect'}
        describedBy={failure ? errorId : undefined}
      />
      {pending ? <p className={password.body} role="status">{t('auth.password.working')}</p> : null}
      {failure ? <div id={errorId} role="alert"><AuthNote tone="danger">{failure.message}</AuthNote></div> : null}
      {sent && !failure ? <p className={password.sent} role="status">{t('auth.code.sentAgain')}</p> : null}
      {offerNew ? (
        <button ref={sendNew} type="button" className={buttons.primary} disabled={pending} onClick={() => { void form.sendNewCode(); }} data-sf-part="button" data-variant="filled">
          {t('auth.code.error.sendNew')}
        </button>
      ) : null}
      {expired ? null : <div className={classes.help}>
        <button type="button" className={password.link} disabled={pending || seconds > 0} onClick={() => { void form.resend(); }}>
          {seconds > 0 ? t('auth.code.resendIn', { time: formatClock(seconds) }) : t('auth.code.resend')}
        </button>
        {isPhone ? (
          <button type="button" className={password.link} disabled={pending} onClick={() => { void form.switchChannel(); }}>
            {attempt.channel === 'sms' ? t('auth.code.switchWhatsapp') : t('auth.code.switchSms')}
          </button>
        ) : null}
      </div>}
    </div>
  );
}
