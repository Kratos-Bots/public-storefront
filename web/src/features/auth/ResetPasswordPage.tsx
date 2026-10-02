import { useMemo } from 'react';
import { Link } from 'react-router';
import { Field } from '@/features/checkout/Field.tsx';
import { useResetPassword } from '@/features/auth/useResetPassword.ts';
import { ResetPasswordFamily, type ResetPasswordData } from '@/builder/family-reset-password.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/auth/ResetPasswordPage.module.css';

function ResetPasswordHeadingView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { phase, mode } = ResetPasswordFamily.useData();
  const title = phase === 'expired'
    ? t('auth.reset.expired.title')
    : mode === 'set' ? t('auth.reset.heading.titleSet') : t('auth.reset.heading.title');
  return (
    <div className={classes.head} {...styleAttrs}>
      <h1 className={classes.title}>{title}</h1>
      {phase === 'expired' || phase === 'banned' ? null : <p className={classes.lede}>{t('auth.reset.heading.lede')}</p>}
    </div>
  );
}

function ResetPasswordFormView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const data = ResetPasswordFamily.useData();
  const { phase } = data;
  return (
    <div className={classes.panel} {...styleAttrs}>
      {phase === 'checking' ? (
        <p className={`${classes.body} ${FADE}`} role="status">{t('auth.reset.form.checking')}</p>
      ) : null}
      {phase === 'form' ? (
        <form className={`${classes.form} ${FADE}`} noValidate onSubmit={data.onSubmit}>
          <Field
            label={t('auth.reset.form.label')}
            type="password"
            autoComplete="new-password"
            hint={t('auth.password.rule')}
            error={data.error ?? undefined}
            value={data.password}
            onChange={data.onPasswordChange}
          />
          <button type="submit" className={classes.cta} disabled={data.pending} data-sf-part="button" data-variant="filled">
            {data.pending ? t('auth.reset.form.saving') : t('auth.reset.form.submit')}
          </button>
        </form>
      ) : null}
      {phase === 'expired' ? (
        <div className={`${classes.stack} ${FADE}`}>
          <p className={classes.body}>{t('auth.reset.expired.body')}</p>
          <Link to="/login" className={classes.cta} data-sf-part="button" data-variant="filled">
            {t('auth.password.backToSignIn')}
          </Link>
        </div>
      ) : null}
      {phase === 'banned' ? (
        <div className={`${classes.stack} ${FADE}`}>
          <p className={classes.body} role="alert">{data.error}</p>
          <Link to="/login" className={classes.cta} data-sf-part="button" data-variant="filled">
            {t('auth.password.backToSignIn')}
          </Link>
        </div>
      ) : null}
      {phase === 'unreachable' ? (
        <div className={`${classes.stack} ${FADE}`}>
          <p className={classes.body} role="alert">{t('auth.reset.form.unreachable')}</p>
          <button type="button" className={classes.link} onClick={data.onRetry}>{t('common.actions.tryAgain')}</button>
        </div>
      ) : null}
    </div>
  );
}

export const RESET_PASSWORD_VIEWS: FamilyValue<ResetPasswordData>['views'] = {
  ResetPasswordHeading: ResetPasswordHeadingView,
  ResetPasswordForm: ResetPasswordFormView,
};

/**
 * `/reset-password?token=…`: a container of the heading and the form. The hook owns the token check and
 * the submit; the parts only draw its state, so the owner can rearrange or restyle them freely.
 */
export function ResetPasswordPage({ slots }: { slots: { content: SlotRender } }) {
  const data = useResetPassword();
  const { phase, mode, password, pending, error } = data;
  // The hook returns fresh handlers every render; the value follows the data's fields only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ data, views: RESET_PASSWORD_VIEWS }), [phase, mode, password, pending, error]);
  return <ResetPasswordFamily.Provider value={value}>{slots.content({ className: classes.page })}</ResetPasswordFamily.Provider>;
}
