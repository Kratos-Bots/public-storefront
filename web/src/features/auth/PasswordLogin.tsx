import { useEffect, useRef, type ReactNode } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useText } from '@/text/runtime.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { Field } from '@/features/checkout/Field.tsx';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { AuthNote } from '@/features/auth/AuthCard.tsx';
import { usePasswordLogin, type PasswordLogin as PasswordForm } from '@/features/auth/usePasswordLogin.ts';
import classes from '@/features/auth/PasswordLogin.module.css';

/**
 * The email-or-phone card's body: sign in, create an account, or reset a password, all in one place so
 * the card never changes height class or position. Behaviour lives in `usePasswordLogin`; this is markup.
 * While a request is in the air the mode links and the Email | Phone switch are disabled, so a late
 * response can never land under a different mode.
 */
export function PasswordLogin() {
  const settings = useSettings();
  const { t } = useText();
  const turnstileRef = useRef<GuestTurnstileHandle | null>(null);
  const form = usePasswordLogin(turnstileRef);
  const root = useRef<HTMLDivElement>(null);
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
      autoComplete="username"
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

  const failure = errors.form ? (
    <div role="alert">
      <AuthNote tone="danger">{errors.form}</AuthNote>
    </div>
  ) : null;

  const submitButton = (label: string) => (
    <button type="submit" className={classes.cta} disabled={pending} data-sf-part="button" data-variant="filled">
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
        <h3 className={classes.title}>{t('auth.password.forgot.title')}</h3>
        {kindSwitch}
        {form.forgotRoute === 'whatsapp' ? (
          <>
            <p className={classes.body}>{t('auth.password.forgot.whatsappBody')}</p>
            <a className={classes.cta} href={form.whatsappHref ?? undefined} target="_blank" rel="noopener noreferrer" data-sf-part="button" data-variant="filled">
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
        <div className={classes.links}>{link(t('auth.password.backToSignIn'), 'signin')}</div>
      </div>
    );
  }

  const signup = mode === 'signup';
  return (
    <div className={classes.root} ref={root}>
      {kindSwitch}
      <form className={classes.form} noValidate onSubmit={onSubmit}>
        {identifier}
        <Field
          label={t(signup ? 'auth.password.createLabel' : 'auth.password.passwordLabel')}
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={(v) => form.setValue('password', v)}
          error={errors.password}
          hint={signup ? t('auth.password.rule') : undefined}
        />
        {turnstile}
        {failure}
        {submitButton(t(signup ? 'auth.password.submitSignUp' : 'auth.password.submitSignIn'))}
      </form>
      <div className={classes.links}>
        {signup ? link(t('auth.password.toSignIn'), 'signin') : (
          <>
            {link(t('auth.password.toForgot'), 'forgot')}
            {link(t('auth.password.toSignUp'), 'signup')}
          </>
        )}
      </div>
    </div>
  );
}
