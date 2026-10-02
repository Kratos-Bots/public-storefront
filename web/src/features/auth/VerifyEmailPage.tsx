import { useMemo } from 'react';
import { Link } from 'react-router';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail.ts';
import { passwordErrorMessage } from '@/features/auth/password-errors.ts';
import { VerifyEmailFamily, type VerifyEmailData } from '@/builder/family-verify-email.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/auth/VerifyEmailPage.module.css';

function VerifyEmailHeadingView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  return (
    <div className={classes.head} {...styleAttrs}>
      <h1 className={classes.title}>{t('auth.verifyEmail.heading.title')}</h1>
    </div>
  );
}

function VerifyEmailStatusView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const data = VerifyEmailFamily.useData();
  const { phase } = data;
  if (phase === 'verifying') {
    return (
      <div className={classes.status} {...styleAttrs}>
        <p className={`${classes.body} ${FADE}`} role="status">{t('auth.verifyEmail.status.checking')}</p>
      </div>
    );
  }
  const toProfile = (
    <Link to="/account/profile" className={classes.cta} data-sf-part="button" data-variant="filled">
      {t('auth.verifyEmail.status.toProfile')}
    </Link>
  );
  return (
    <div className={classes.status} {...styleAttrs}>
      {phase === 'done' ? (
        <div className={`${classes.panel} ${FADE}`} data-tone="success">
          <h2 className={classes.panelTitle}>{t('auth.verifyEmail.status.doneTitle')}</h2>
          <p className={classes.body}>{t('auth.verifyEmail.status.doneBody')}</p>
          {toProfile}
        </div>
      ) : null}
      {phase === 'invalid' ? (
        <div className={`${classes.panel} ${FADE}`} data-tone="danger">
          <h2 className={classes.panelTitle}>{t('auth.verifyEmail.status.invalidTitle')}</h2>
          <p className={classes.body}>{t('auth.verifyEmail.status.invalidBody')}</p>
          {toProfile}
        </div>
      ) : null}
      {phase === 'otherAccount' ? (
        <div className={`${classes.panel} ${FADE}`} data-tone="warn">
          <h2 className={classes.panelTitle}>{t('auth.verifyEmail.status.otherTitle')}</h2>
          <p className={classes.body}>{t('auth.verifyEmail.status.otherBody')}</p>
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className={`${classes.panel} ${FADE}`} data-tone="warn">
          <h2 className={classes.panelTitle}>{t('auth.verifyEmail.status.errorTitle')}</h2>
          <p className={classes.body} role="alert">{passwordErrorMessage(data.error, 'verify')}</p>
          <button type="button" className={classes.link} onClick={data.onRetry}>{t('common.actions.tryAgain')}</button>
        </div>
      ) : null}
    </div>
  );
}

export const VERIFY_EMAIL_VIEWS: FamilyValue<VerifyEmailData>['views'] = {
  VerifyEmailHeading: VerifyEmailHeadingView,
  VerifyEmailStatus: VerifyEmailStatusView,
};

/**
 * `/verify-email?token=…`: a container of the heading and the status panel. The hook owns the one-shot
 * confirmation; the parts only draw its phase, so the owner can rearrange or restyle them freely.
 */
export function VerifyEmailPage({ slots }: { slots: { content: SlotRender } }) {
  const data = useVerifyEmail();
  const { phase, error } = data;
  // The hook returns a fresh retry handler every render; the value follows the phase and failure only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ data, views: VERIFY_EMAIL_VIEWS }), [phase, error]);
  return <VerifyEmailFamily.Provider value={value}>{slots.content({ className: classes.page })}</VerifyEmailFamily.Provider>;
}
