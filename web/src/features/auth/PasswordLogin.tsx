import { useEffect, useRef, type ReactNode } from 'react';
import { useAutofillAdvance } from '@/lib/use-autofill-advance.ts';
import { useSettings } from '@/app/settings.ts';
import { accessOf } from '@/app/access.ts';
import { useText } from '@/text/runtime.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { Field } from '@/features/checkout/Field.tsx';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { ArrowLeftIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { usePasswordLogin, type PasswordLogin as PasswordForm } from '@/features/auth/usePasswordLogin.ts';
import buttons from '@/features/auth/AuthButtons.module.css';
import classes from '@/features/auth/PasswordLogin.module.css';

/**
 * The email-or-phone form: sign in, create an account, or reset a password, all in one place so
 * the form never changes position. A step past sign-in opens with a way back and its own title. Behaviour lives in `usePasswordLogin`; this is markup.
 * While a request is in the air the mode links and the Email | Phone switch are disabled, so a late
 * response can never land under a different mode.
 */
export function PasswordLogin({ onSignInStep }: { onSignInStep?: (onSignIn: boolean) => void } = {}) {
  const settings = useSettings();
  // A refetch that closes registration while the form is in sign-up mode leaves it
  // there: the submit gets the mapped error instead of the form vanishing.
  const registration = accessOf(settings).registration;
  const { t } = useText();
  const turnstileRef = useRef<GuestTurnstileHandle | null>(null);
  const form = usePasswordLogin(turnstileRef);
  const root = useRef<HTMLDivElement>(null);
  // Email filled by the system: on to the password, or closed keyboard when both came in.
  useAutofillAdvance(root);
  const first = useRef(true);

  // After a mode or kind switch, focus moves to the first control of the new view (never on first paint).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    root.current?.querySelector<HTMLElement>('input, select, a[href]')?.focus();
  }, [form.mode, form.kind]);

  const { mode, kind, values, errors, pending } = form;
  useEffect(() => {
    onSignInStep?.(mode === 'signin');
  }, [mode, onSignInStep]);

  const kindSwitch = (
    <div className={classes.kinds} role="group" aria-label={t('auth.password.kindAria')}>
      <button type="button" className={classes.kind} aria-pressed={kind === 'email'} disabled={pending} onClick={() => form.setKind('email')}>
        {t('auth.password.byEmail')}
      </button>
      <button type="button" className={classes.kind} aria-pressed={kind === 'phone'} disabled={pending} onClick={() => form.setKind('phone')}>
        {t('auth.password.byPhone')}
      </button>
    </div>
  );

  const identifier = kind === 'email' ? (
    <Field
      label={t('auth.password.emailLabel')}
      type="email"
      autoComplete={form.mode === 'signup' ? 'email' : 'username'}
      inputMode="email"
      value={values.email}
      onChange={(v) => form.setValue('email', v)}
      error={errors.email}
    />
  ) : (
    <PhoneField
      prefix={values.prefix}
      phone={values.phone}
      optional={false}
      hideHint
      error={errors.phone}
      onPrefixChange={(v) => form.setValue('prefix', v)}
      onPhoneChange={(v) => form.setValue('phone', v)}
    />
  );

  const link = (label: string, next: PasswordForm['mode']): ReactNode => (
    <button type="button" className={classes.link} disabled={pending} onClick={() => form.setMode(next)}>
      {label}
    </button>
  );

  const back = (
    <button type="button" className={buttons.back} disabled={pending} onClick={() => form.setMode('signin')}>
      <ArrowLeftIcon size={18} />
      {t('auth.password.backToSignIn')}
    </button>
  );

  const failure = errors.form ? (
    <div role="alert">
      <AuthNote tone="danger">{errors.form}</AuthNote>
    </div>
  ) : null;

  const submitButton = (label: string) => (
    <button type="submit" className={buttons.primary} disabled={pending} data-sf-part="button" data-variant="filled">
      {pending ? t('auth.password.working') : label}
    </button>
  );

  const turnstile = form.needsTurnstile && settings.turnstile
    ? <GuestTurnstile ref={turnstileRef} siteKey={settings.turnstile.siteKey} />
    : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void form.submit();
  };

  if (mode === 'forgot') {
    return (
      <div className={classes.root} ref={root}>
        {back}
        <h2 className={classes.title}>{t('auth.password.forgot.title')}</h2>
        {kindSwitch}
        {form.forgotRoute === 'whatsapp' ? (
          <>
            <p className={classes.body}>{t('auth.password.forgot.whatsappBody')}</p>
            <a className={buttons.primary} href={form.whatsappHref ?? undefined} target="_blank" rel="noopener noreferrer" data-sf-part="button" data-variant="filled">
              {t('auth.password.forgot.whatsappCta')}
            </a>
          </>
        ) : null}
        {form.forgotRoute === 'email' ? (
          <form className={classes.form} noValidate onSubmit={onSubmit}>
            <p className={classes.body}>{t('auth.password.forgot.emailBody')}</p>
            {identifier}
            {turnstile}
            {failure}
            {form.sent ? <p className={classes.sent} role="status">{t('auth.password.forgot.sent')}</p> : null}
            {submitButton(t('auth.password.forgot.send'))}
          </form>
        ) : null}
        {form.forgotRoute === 'none' ? (
          <>
            <p className={classes.body}>{t('auth.password.forgot.noneBody')}</p>
            <ContactLinks />
            {settings.supportLinks.length > 0 ? (
              <ul className={classes.support}>
                {settings.supportLinks.map((l) => (
                  <li key={l.url}>
                    <a className={classes.link} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  const signup = mode === 'signup';
  return (
    <div className={classes.root} ref={root}>
      {signup ? (
        <>
          {back}
          <h2 className={classes.title}>{t('auth.password.signUpTitle')}</h2>
        </>
      ) : null}
      {kindSwitch}
      <form className={classes.form} noValidate onSubmit={onSubmit}>
        {identifier}
        <div className={classes.passwordGroup}>
        <Field
          label={t(signup ? 'auth.password.createLabel' : 'auth.password.passwordLabel')}
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={(v) => form.setValue('password', v)}
          error={errors.password}
          hint={signup ? t('auth.password.rule') : undefined}
        />
        {signup ? null : link(t('auth.password.toForgot'), 'forgot')}
        </div>
        {turnstile}
        {failure}
        {submitButton(t(signup ? 'auth.password.submitSignUp' : 'auth.password.submitSignIn'))}
      </form>
      {!signup && registration ? link(t('auth.password.toSignUp'), 'signup') : null}
    </div>
  );
}
