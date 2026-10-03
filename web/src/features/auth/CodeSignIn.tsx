import { useEffect, useRef } from 'react';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';
import { MailIcon, PhoneIcon } from '@/components/icons.tsx';
import { FADE } from '@/lib/motion.ts';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { AccessNotice } from '@/features/auth/AccessNotice.tsx';
import { CodeStep } from '@/features/auth/CodeStep.tsx';
import { EmailStep, ForgotStep, PasswordStep } from '@/features/auth/EmailSteps.tsx';
import { PhoneStep } from '@/features/auth/PhoneStep.tsx';
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
 * applies. Each button is shown only when the shop has it working.
 */
export function CodeSignIn({ rootAttrs }: { rootAttrs?: StyleAttrs } = {}) {
  const settings = useSettings();
  const { t } = useText();
  const { login } = settings;
  const registration = accessOf(settings).registration;
  const turnstile = useRef<GuestTurnstileHandle | null>(null);
  const form = useCodeLogin(turnstile);
  useReportChoice(form.view === 'choose');
  const root = useRef<HTMLDivElement>(null);
  const lastView = useRef(form.view);
  // Coming back to the list of ways: the button that was clicked is gone, so put focus on the first one.
  useEffect(() => {
    if (form.view === 'choose' && lastView.current !== 'choose') root.current?.querySelector<HTMLElement>('button')?.focus();
    lastView.current = form.view;
  }, [form.view]);

  const phone = login.phone?.available === true && login.phone.mode !== null ? login.phone : null;
  const emailCodes = login.email?.available === true && login.email.mode !== null;
  const passwords = login.password?.available === true;
  // Email is offered only when a code or a password can follow it: with both off, `submitEmail` has nowhere to go.
  const email = emailCodes || passwords;
  const telegramOn = telegramAvailability(login).on;

  if (!phone && !email && !telegramOn) return <SignInUnavailable rootAttrs={rootAttrs} />;

  const choose = (
    <>
      <AccessNotice placement="above" />
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
      {form.view === 'choose' ? choose : null}
      {form.view === 'phone' && phone ? <PhoneStep form={form} phone={phone} /> : null}
      {form.view === 'email' ? <EmailStep form={form} codes={emailCodes} /> : null}
      {form.view === 'password' ? <PasswordStep form={form} offerCode={emailCodes} /> : null}
      {form.view === 'forgot' ? <ForgotStep form={form} /> : null}
      {form.view === 'code' ? <CodeStep form={form} /> : null}
      {/* Loaded only once the shopper is on a step that sends, and kept for all of them. */}
      {form.view !== 'choose' && settings.turnstile ? <GuestTurnstile ref={turnstile} siteKey={settings.turnstile.siteKey} /> : null}
    </div>
  );
}
