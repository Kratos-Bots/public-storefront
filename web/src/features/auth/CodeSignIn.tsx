import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';
import { MailIcon, PhoneIcon } from '@/components/icons.tsx';
import { FADE } from '@/lib/motion.ts';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { AccessNotice } from '@/features/auth/AccessNotice.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { CodeStep } from '@/features/auth/CodeStep.tsx';
import { EmailStep, ForgotStep, PasswordStep } from '@/features/auth/EmailSteps.tsx';
import { PhoneStep, type PhoneDraft } from '@/features/auth/PhoneStep.tsx';
import { SignInUnavailable } from '@/features/auth/SignInUnavailable.tsx';
import { TelegramSignInBlock, telegramAvailability } from '@/features/auth/TelegramSignInBlock.tsx';
import { useReportChoice } from '@/features/auth/LoginStep.ts';
import { useCodeLogin } from '@/features/auth/useCodeLogin.ts';
import { useText } from '@/text/runtime.tsx';
import type { StyleAttrs } from '@/builder/define.ts';
import buttons from '@/features/auth/AuthButtons.module.css';
import options from '@/features/auth/LoginOptions.module.css';
import classes from '@/features/auth/CodeSignIn.module.css';

/**
 * Sign in with a code: three big buttons (phone number, Telegram, email), and behind the first and last a short
 * step each. The customer never chooses between "sign in" and "create an account": a correct code does whichever
 * applies. Each button is shown only when the shop has it working. The settings can change under the shopper (a
 * "sign-in by code is off" answer refetches them): a step whose way is no longer offered gives way to the list,
 * with the sentence it was showing, so the screen is never blank.
 */
export function CodeSignIn({ rootAttrs }: { rootAttrs?: StyleAttrs } = {}) {
  const settings = useSettings();
  const { t } = useText();
  const { login } = settings;
  const registration = accessOf(settings).registration;
  const turnstile = useRef<GuestTurnstileHandle | null>(null);
  const form = useCodeLogin(turnstile);
  const root = useRef<HTMLDivElement>(null);
  // Kept so "Use a different number" comes back to what was typed, as `EmailStep` does with `form.email`.
  const [phoneDraft, setPhoneDraft] = useState<PhoneDraft | undefined>();
  // The sentence a step was showing when it was replaced by the list.
  const [notice, setNotice] = useState<string | null>(null);

  const phone = login.phone?.available === true && login.phone.mode !== null ? login.phone : null;
  const emailCodes = login.email?.available === true && login.email.mode !== null;
  const passwords = login.password?.available === true;
  // Email is offered only when a code or a password can follow it: with both off, `submitEmail` has nowhere to go.
  const email = emailCodes || passwords;
  const telegramOn = telegramAvailability(login).on;

  const { view, attempt } = form;
  const stale =
    (view === 'phone' && !phone)
    || ((view === 'email' || view === 'password' || view === 'forgot') && !email)
    || (view === 'code' && (attempt?.kind === 'phone' ? !phone : !emailCodes));
  // While the effect below moves the hook back to the list, the list is what shows.
  const shown = stale ? 'choose' : view;
  useReportChoice(shown === 'choose');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the flip only; `go` is stable
  useEffect(() => {
    if (!stale) return;
    setNotice(form.failure?.message ?? null);
    form.go('choose');
  }, [stale]);
  useEffect(() => {
    if (view !== 'choose' && !stale) setNotice(null);
  }, [view, stale]);

  const lastView = useRef(shown);
  // Coming back to the list of ways: the button that was clicked is gone, so put focus on the first one.
  useEffect(() => {
    if (shown === 'choose' && lastView.current !== 'choose') root.current?.querySelector<HTMLElement>('button')?.focus();
    lastView.current = shown;
  }, [shown]);

  if (!phone && !email && !telegramOn) return <SignInUnavailable rootAttrs={rootAttrs} />;

  const choose = (
    <>
      <AccessNotice placement="above" />
      {notice ? <div role="alert"><AuthNote tone="danger">{notice}</AuthNote></div> : null}
      <div className={options.quick}>
        {phone ? (
          <button type="button" className={buttons.quick} onClick={() => form.go('phone')}>
            <span className={buttons.icon}><PhoneIcon size={20} /></span>
            {t('auth.code.choose.phone')}
          </button>
        ) : null}
        {telegramOn ? <TelegramSignInBlock login={login} /> : null}
        {email ? (
          <button type="button" className={buttons.quick} onClick={() => form.go('email')}>
            <span className={buttons.icon}><MailIcon size={20} /></span>
            {t('auth.code.choose.email')}
          </button>
        ) : null}
      </div>
      {registration ? <p className={classes.newHere}>{t('auth.code.choose.newHere')}</p> : null}
      <AccessNotice placement="below" />
    </>
  );

  return (
    <div className={`${options.options} ${FADE}`} ref={root} {...rootAttrs}>
      {shown === 'choose' ? choose : null}
      {shown === 'phone' && phone ? <PhoneStep form={form} phone={phone} draft={phoneDraft} onDraft={setPhoneDraft} /> : null}
      {shown === 'email' ? <EmailStep form={form} codes={emailCodes} /> : null}
      {shown === 'password' ? <PasswordStep form={form} offerCode={emailCodes} /> : null}
      {shown === 'forgot' ? <ForgotStep form={form} /> : null}
      {shown === 'code' ? <CodeStep form={form} /> : null}
      {/* Loaded only once the shopper is on a step that sends, and kept for all of them. */}
      {shown !== 'choose' && settings.turnstile ? <GuestTurnstile ref={turnstile} siteKey={settings.turnstile.siteKey} /> : null}
    </div>
  );
}
