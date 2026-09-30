import { useState } from 'react';
import { Button } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { setReferralCode } from '@/api/profile.ts';
import { PROFILE_KEY, useProfile } from '@/features/account/queries.ts';
import { referralShareLinks, referralShareText } from '@/features/account/referral-share.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/account/Account.module.css';

/**
 * The clipboard API is missing outside a secure context — a shop served over
 * plain http, which a self-hosted one can be. A Copy button that does nothing
 * when pressed is worse than no button, so the affordance falls back to the code
 * itself, which selects whole on a click (`user-select: all`).
 */
function canCopy(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard;
}

function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * The referral tab: one code, the ways to pass it on, and what it has earned.
 * The share links open the shop's own chat with the invite written out — that
 * is where a customer's friends already talk to the shop, and it is the same
 * route the bot's referral entry point expects.
 */
export function ReferralsPage() {
  const { t } = useText();
  const { brand } = useSettings();
  const profile = useProfile();
  const client = useQueryClient();
  const clipboard = useClipboard({ timeout: 1600 });
  const [draft, setDraft] = useState('');

  const claim = useMutation({
    mutationFn: (code: string) => setReferralCode(code),
    onSuccess: async (result) => {
      setDraft('');
      notifications.show({ message: t('account.referrals.referredToast', { name: result.referrerNickname }) });
      await client.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });

  if (profile.isPending) return <PageSkeleton inline />;

  if (profile.isError) {
    return (
      <EmptyState
        eyebrow={t('account.nav.referrals')}
        title={t('account.referrals.loadFailedTitle')}
        description={t('account.referrals.loadFailedBody')}
        action={
          <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  }

  const data = profile.data;
  const links = referralShareLinks(data.referralCode, brand);
  const text = referralShareText(data.referralCode, brand.name);

  const share = () => {
    void navigator.share({ text }).catch(() => undefined);
  };

  return (
    <div className={classes.body}>
      <div className={classes.plate}>
        <span className={classes.plateLabel}>{t('account.referrals.yourCode')}</span>
        <div className={classes.plateRow}>
          <span className={classes.code}>{data.referralCode}</span>
          {canCopy() ? (
            <button
              type="button"
              className={classes.copy}
              onClick={() => clipboard.copy(data.referralCode)}
              aria-label={t('account.referrals.copyAria', { code: data.referralCode })}
            >
              {clipboard.copied ? t('common.actions.copied') : t('common.actions.copy')}
            </button>
          ) : null}
        </div>
      </div>

      {canShare() || links.whatsapp || links.telegram ? (
        <>
          <div className={classes.share}>
            {canShare() ? (
              <button type="button" className={classes.ghost} onClick={share}>
                {t('account.referrals.share')}
              </button>
            ) : null}
            {links.whatsapp ? (
              <a
                className={classes.ghost}
                href={links.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('common.contact.whatsapp')}
              </a>
            ) : null}
            {links.telegram ? (
              <a
                className={classes.ghost}
                href={links.telegram}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('common.contact.telegram')}
              </a>
            ) : null}
          </div>
          <p className={classes.note}>
            {t('account.referrals.shareNote')}
          </p>
        </>
      ) : null}

      <section className={classes.section} aria-label={t('account.referrals.broughtInAria')}>
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>{t('account.referrals.broughtInTitle')}</h3>
        </div>
        <div className={classes.counts}>
          <div className={classes.count}>
            <span className={classes.countFigure}>{data.referredPeopleCount}</span>
            <span className={classes.countLabel}>{t('account.referrals.peopleReferred')}</span>
          </div>
          <div className={classes.count}>
            <span className={classes.countFigure}>{data.referralsCount}</span>
            <span className={classes.countLabel}>{t('account.referrals.ordersEarned')}</span>
          </div>
        </div>
      </section>

      <section className={classes.section} aria-label={t('account.referrals.referrerAria')}>
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>{t('account.referrals.referrerTitle')}</h3>
        </div>

        {data.hasReferrer ? (
          <div className={classes.referrer}>
            <span className={classes.rowLabel}>{t('account.referrals.referredBy')}</span>
            <span className={classes.rowFigure}>{data.referrerNickname ?? t('account.referrals.someone')}</span>
          </div>
        ) : (
          <>
            <p className={classes.note}>
              {t('account.referrals.enterCodeNote')}
            </p>
            <form
              className={classes.form}
              onSubmit={(e) => {
                e.preventDefault();
                const code = draft.trim();
                if (code) claim.mutate(code);
              }}
            >
              <input
                className={classes.input}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                aria-label={t('account.referrals.codeAria')}
                aria-invalid={claim.isError ? true : undefined}
                placeholder={t('account.referrals.codePlaceholder')}
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
              />
              <button
                type="submit"
                className={classes.ghost}
                disabled={claim.isPending || draft.trim().length === 0}
              >
                {claim.isPending ? t('account.referrals.checking') : t('account.referrals.apply')}
              </button>
            </form>
            {claim.isError ? (
              <span className={classes.error}>
                {errorMessage(claim.error, t('account.referrals.codeFailed'))}
              </span>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
