import { useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { ArrowLeftIcon, MailIcon } from '@/components/icons.tsx';
import { Field } from '@/features/checkout/Field.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { buildIdentifier, checkCurrentPassword } from '@/features/auth/password-identifier.ts';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
import { useText } from '@/text/runtime.tsx';
import buttons from '@/features/auth/AuthButtons.module.css';
import classes from '@/features/auth/PasswordLogin.module.css';

function Failure({ form }: { form: CodeLogin }) {
  return form.failure ? <div role="alert"><AuthNote tone="danger">{form.failure.message}</AuthNote></div> : null;
}

/** One email field and Continue. A password account is sent on to `PasswordStep`; anyone else gets a code. */
export function EmailStep({ form }: { form: CodeLogin }) {
  const { t } = useText();
  const [value, setValue] = useState(form.email);
  const [error, setError] = useState<string | undefined>();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = buildIdentifier({ kind: 'email', email: value, phone: '', prefix: '' });
    if (!id.ok || !('email' in id.identifier)) {
      setError(id.ok ? undefined : id.message);
      return;
    }
    setError(undefined);
    void form.submitEmail(id.identifier.email);
  };

  return (
    <div className={classes.root}>
      <button type="button" className={buttons.back} disabled={form.pending} onClick={() => form.go('choose')}>
        <ArrowLeftIcon size={18} />
        {t('auth.code.back')}
      </button>
      <h2 className={classes.title}>{t('auth.code.email.title')}</h2>
      <form className={classes.form} noValidate onSubmit={onSubmit}>
        <Field
          label={t('auth.password.emailLabel')}
          type="email"
          inputMode="email"
          autoComplete="username"
          value={value}
          onChange={(v) => { setValue(v); setError(undefined); }}
          error={error}
        />
        <Failure form={form} />
        <button type="submit" className={buttons.primary} disabled={form.pending} data-sf-part="button" data-variant="filled">
          {form.pending ? t('auth.password.working') : t('auth.code.email.continue')}
        </button>
      </form>
    </div>
  );
}

/** The password account's first screen: password, Sign in, Forgot, and a way to skip it ("Email me a code instead"). */
export function PasswordStep({ form, offerCode }: { form: CodeLogin; offerCode: boolean }) {
  const { t } = useText();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = checkCurrentPassword(value);
    if (missing) {
      setError(missing);
      return;
    }
    setError(undefined);
    void form.passwordSignIn(value);
  };

  return (
    <div className={classes.root}>
      <button type="button" className={buttons.back} disabled={form.pending} onClick={() => form.go('email')}>
        <ArrowLeftIcon size={18} />
        {t('auth.code.differentEmail')}
      </button>
      <h2 className={classes.title}>{t('auth.code.password.title')}</h2>
      <p className={classes.body}>{t('auth.code.password.body', { email: form.email })}</p>
      <form className={classes.form} noValidate onSubmit={onSubmit}>
        <div className={classes.passwordGroup}>
          <Field
            label={t('auth.password.passwordLabel')}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(v) => { setValue(v); setError(undefined); }}
            error={error}
          />
          <button type="button" className={classes.link} disabled={form.pending} onClick={() => form.go('forgot')}>
            {t('auth.password.toForgot')}
          </button>
        </div>
        <Failure form={form} />
        <button type="submit" className={buttons.primary} disabled={form.pending} data-sf-part="button" data-variant="filled">
          {form.pending ? t('auth.password.working') : t('auth.password.submitSignIn')}
        </button>
      </form>
      {offerCode ? (
        <button type="button" className={buttons.quick} disabled={form.pending} onClick={() => { void form.emailMeCode(); }}>
          <span className={buttons.icon}><MailIcon size={20} /></span>
          {t('auth.code.password.emailCode')}
        </button>
      ) : null}
    </div>
  );
}

/** Forgot password: a reset link by email when the shop can send one, otherwise a way to ask the shop. */
export function ForgotStep({ form }: { form: CodeLogin }) {
  const settings = useSettings();
  const { t } = useText();
  const byEmail = settings.login.password?.resetByEmail === true;

  return (
    <div className={classes.root}>
      <button type="button" className={buttons.back} disabled={form.pending} onClick={() => form.go('password')}>
        <ArrowLeftIcon size={18} />
        {t('auth.password.backToSignIn')}
      </button>
      <h2 className={classes.title}>{t('auth.password.forgot.title')}</h2>
      {byEmail ? (
        <>
          <p className={classes.body}>{t('auth.code.forgot.body', { email: form.email })}</p>
          <Failure form={form} />
          {form.sent ? <p className={classes.sent} role="status">{t('auth.password.forgot.sent')}</p> : null}
          <button type="button" className={buttons.primary} disabled={form.pending} onClick={() => { void form.sendReset(); }} data-sf-part="button" data-variant="filled">
            {form.pending ? t('auth.password.working') : t('auth.password.forgot.send')}
          </button>
        </>
      ) : (
        <>
          <p className={classes.body}>{t('auth.password.forgot.noneBody')}</p>
          <ContactLinks />
        </>
      )}
    </div>
  );
}
