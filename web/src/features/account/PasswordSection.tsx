import { useId, type FormEvent } from 'react';
import { Field } from '@/features/checkout/Field.tsx';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';
import { useAccountPassword } from '@/features/account/useAccountPassword.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import type { Profile } from '@/types/profile.ts';
import account from '@/features/account/Account.module.css';
import classes from '@/features/account/PasswordSection.module.css';

/**
 * The profile's Password section: which email or phone signs this account in, and a form to set or change the
 * password. Behaviour lives in `useAccountPassword`; this is markup. While a save is in the air the whole form is
 * one disabled fieldset, so nothing can change under the request.
 */
export function PasswordSection({ profile, resetByEmail, rootAttrs }: {
  profile: Profile;
  resetByEmail: boolean;
  rootAttrs?: PartViewProps['styleAttrs'];
}) {
  const { t } = useText();
  const form = useAccountPassword(profile, { resetByEmail });
  const { hasPassword, needsIdentifier, open, kind, values, errors, pending, saved, verification } = form;
  const info = profile.password;
  const identifiers = [
    info?.loginEmail ? { key: 'email', label: t('account.password.emailRow'), value: info.loginEmail, verified: info.emailVerified } : null,
    info?.loginPhone ? { key: 'phone', label: t('account.password.phoneRow'), value: info.loginPhone, verified: info.phoneVerified } : null,
  ].filter((row) => row !== null);
  const listId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void form.submit();
  };

  return (
    <section className={account.section} aria-label={t('account.password.aria')} {...rootAttrs}>
      <div className={account.sectionHead}>
        <h3 className={account.sectionTitle}>{t('account.password.title')}</h3>
      </div>
      <p className={account.note}>{hasPassword ? t('account.password.setNote') : t('account.password.unsetNote')}</p>

      {identifiers.length > 0 ? (
        <div className={classes.signIn}>
          <p className={classes.signInLabel} id={listId}>{t('account.password.signInWith')}</p>
          <ul className={classes.list} aria-labelledby={listId}>
            {identifiers.map((row) => (
              <li key={row.key} className={classes.identifier}>
                <span className={account.rowLabel}>{row.label}</span>
                <span className={classes.value}>{row.value}</span>
                <span
                  className={row.verified ? `${classes.marker} ${classes.markerOn}` : classes.marker}
                  data-state={row.verified ? 'verified' : 'unverified'}
                >
                  {row.verified ? t('account.password.verified') : t('account.password.unverified')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {verification.canSend ? (
        <div className={classes.verify}>
          <button type="button" className={classes.link} disabled={verification.sending} onClick={() => void verification.send()}>
            {verification.sending ? t('account.password.sendingVerification') : t('account.password.sendVerification')}
          </button>
          {verification.sent ? <p className={`${classes.status} ${FADE}`} role="status">{t('account.password.verificationSent')}</p> : null}
          {verification.error ? <p className={`${classes.problem} ${FADE}`} role="alert">{verification.error}</p> : null}
        </div>
      ) : null}

      {!open ? (
        <div className={`${classes.actions} ${FADE}`}>
          {saved ? <p className={classes.status} role="status">{t('account.password.saved')}</p> : null}
          <button type="button" className={classes.ghost} onClick={form.openForm}>
            {hasPassword ? t('account.password.changeCta') : t('account.password.setCta')}
          </button>
        </div>
      ) : (
        <form className={`${classes.form} ${FADE}`} noValidate onSubmit={onSubmit}>
          <fieldset className={classes.fields} disabled={pending}>
            {needsIdentifier ? (
              <>
                <p className={account.note}>{t('account.password.identifierHint')}</p>
                <div className={classes.kinds} role="group" aria-label={t('auth.password.kindAria')}>
                  <button type="button" className={classes.kind} aria-pressed={kind === 'email'} onClick={() => form.setKind('email')}>
                    {t('auth.password.byEmail')}
                  </button>
                  <button type="button" className={classes.kind} aria-pressed={kind === 'phone'} onClick={() => form.setKind('phone')}>
                    {t('auth.password.byPhone')}
                  </button>
                </div>
                {kind === 'email' ? (
                  <Field
                    label={t('auth.password.emailLabel')}
                    type="email"
                    autoComplete="email"
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
                )}
              </>
            ) : null}
            {hasPassword ? (
              <Field
                label={t('account.password.current')}
                type="password"
                autoComplete="current-password"
                value={values.current}
                onChange={(v) => form.setValue('current', v)}
                error={errors.current}
              />
            ) : null}
            <Field
              label={t('account.password.new')}
              type="password"
              autoComplete="new-password"
              hint={t('auth.password.rule')}
              value={values.next}
              onChange={(v) => form.setValue('next', v)}
              error={errors.next}
            />
            {errors.form ? <p className={classes.problem} role="alert">{errors.form}</p> : null}
            <div className={classes.buttons}>
              <button type="submit" className={classes.cta} data-sf-part="button" data-variant="filled">
                {pending ? t('account.password.saving') : t('account.password.save')}
              </button>
              <button type="button" className={classes.link} onClick={form.cancel}>
                {t('common.actions.cancel')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
