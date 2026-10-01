import { useMemo, useState } from 'react';
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
import { ReferralsFamily, type ReferralsData, type ReferralsPreview } from '@/builder/family-referrals.ts';
import { usePreviewFixture, usePreviewState } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
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

function CodeView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile, canCopy: copyable, copied, copy } = ReferralsFamily.useData();
  return (
    <div className={classes.plate} {...styleAttrs}>
      <span className={classes.plateLabel}>{t('account.referrals.yourCode')}</span>
      <div className={classes.plateRow}>
        <span className={classes.code}>{profile.referralCode}</span>
        {copyable ? (
          <button
            type="button"
            className={classes.copy}
            onClick={copy}
            aria-label={t('account.referrals.copyAria', { code: profile.referralCode })}
          >
            {copied ? t('common.actions.copied') : t('common.actions.copy')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ShareView() {
  const { t } = useText();
  const { links, canShare: shareable, share } = ReferralsFamily.useData();
  if (!(shareable || links.whatsapp || links.telegram)) return null;
  return (
    <>
      <div className={classes.share}>
        {shareable ? (
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
  );
}

function StatsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile } = ReferralsFamily.useData();
  return (
    <section className={classes.section} aria-label={t('account.referrals.broughtInAria')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.referrals.broughtInTitle')}</h3>
      </div>
      <div className={classes.counts}>
        <div className={classes.count}>
          <span className={classes.countFigure}>{profile.referredPeopleCount}</span>
          <span className={classes.countLabel}>{t('account.referrals.peopleReferred')}</span>
        </div>
        <div className={classes.count}>
          <span className={classes.countFigure}>{profile.referralsCount}</span>
          <span className={classes.countLabel}>{t('account.referrals.ordersEarned')}</span>
        </div>
      </div>
    </section>
  );
}

function ReferrerView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile, draft, setDraft, claim } = ReferralsFamily.useData();
  return (
    <section className={classes.section} aria-label={t('account.referrals.referrerAria')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.referrals.referrerTitle')}</h3>
      </div>

      {profile.hasReferrer ? (
        <div className={classes.referrer}>
          <span className={classes.rowLabel}>{t('account.referrals.referredBy')}</span>
          <span className={classes.rowFigure}>{profile.referrerNickname ?? t('account.referrals.someone')}</span>
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
              if (code) claim.submit(code);
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
              disabled={claim.pending || draft.trim().length === 0}
            >
              {claim.pending ? t('account.referrals.checking') : t('account.referrals.apply')}
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
  );
}

/** The referral tab's views (spec §5.4): the v0.7.0 JSX of each piece. */
export const REFERRALS_VIEWS: FamilyValue<ReferralsData>['views'] = {
  ReferralCode: CodeView, ReferralShare: ShareView, ReferralStats: StatsView, ReferralReferrer: ReferrerView,
};

/**
 * The referral tab: one code, the ways to pass it on, and what it has earned.
 * The share links open the shop's own chat with the invite written out — that
 * is where a customer's friends already talk to the shop, and it is the same
 * route the bot's referral entry point expects.
 *
 * The Referrals container: the profile query, the claim mutation, the clipboard and the share
 * handler stay here; the `content` slot holds the parts. Without `slots` the default arrangement is drawn.
 */
export function ReferralsPage({ slots }: { slots?: { content: SlotRender } } = {}) {
  const { t } = useText();
  const { brand } = useSettings();
  const profile = useProfile();
  const client = useQueryClient();
  const clipboard = useClipboard({ timeout: 1600 });
  const [draft, setDraft] = useState('');
  const state = usePreviewState('Referrals');
  const fixture = usePreviewFixture<ReferralsPreview>('Referrals');
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('Referrals', 'storefront', {}, 'account.referrals')), [slots]);
  const content = slots?.content ?? legacy!.content!;

  const claim = useMutation({
    mutationFn: (code: string) => setReferralCode(code),
    onSuccess: async (result) => {
      setDraft('');
      notifications.show({ message: t('account.referrals.referredToast', { name: result.referrerNickname }) });
      await client.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });

  // The editor previews a state from a fixture and never touches the query (spec §11.3).
  const preview = state !== null && fixture !== null;
  const data = useMemo(
    () => (preview ? { ...fixture.info, hasReferrer: state === 'referred', referrerNickname: state === 'referred' ? fixture.info.referrerNickname ?? 'Ada' : null } : profile.data),
    [preview, state, fixture, profile.data],
  );
  const copied = clipboard.copied;
  const copy = clipboard.copy;
  const claimPending = claim.isPending;
  const claimError = claim.error;
  const claimIsError = claim.isError;
  const claimMutate = claim.mutate;
  const value = useMemo<FamilyValue<ReferralsData> | null>(() => {
    if (!data) return null;
    const links = referralShareLinks(data.referralCode, brand);
    const text = referralShareText(data.referralCode, brand.name);
    return {
      data: {
        profile: data,
        links,
        canCopy: canCopy(),
        canShare: canShare(),
        copied,
        copy: () => copy(data.referralCode),
        share: () => {
          void navigator.share({ text }).catch(() => undefined);
        },
        draft,
        setDraft,
        claim: { pending: claimPending, error: claimError, isError: claimIsError, submit: (code: string) => claimMutate(code) },
      },
      views: REFERRALS_VIEWS,
    };
  }, [data, brand, t, copied, copy, draft, claimPending, claimError, claimIsError, claimMutate]);

  if (!preview) {
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
  }

  return <ReferralsFamily.Provider value={value!}>{content({ className: classes.body })}</ReferralsFamily.Provider>;
}
