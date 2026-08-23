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
  const { brand } = useSettings();
  const profile = useProfile();
  const client = useQueryClient();
  const clipboard = useClipboard({ timeout: 1600 });
  const [draft, setDraft] = useState('');

  const claim = useMutation({
    mutationFn: (code: string) => setReferralCode(code),
    onSuccess: async (result) => {
      setDraft('');
      notifications.show({ message: `You're now referred by ${result.referrerNickname}.` });
      await client.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });

  if (profile.isPending) return <PageSkeleton inline />;

  if (profile.isError) {
    return (
      <EmptyState
        eyebrow="Referrals"
        title="We couldn't load your referrals"
        description="Your code hasn't gone anywhere — this was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
            Try again
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
        <span className={classes.plateLabel}>Your referral code</span>
        <div className={classes.plateRow}>
          <span className={classes.code}>{data.referralCode}</span>
          {canCopy() ? (
            <button
              type="button"
              className={classes.copy}
              onClick={() => clipboard.copy(data.referralCode)}
              aria-label={`Copy your referral code ${data.referralCode}`}
            >
              {clipboard.copied ? 'Copied' : 'Copy'}
            </button>
          ) : null}
        </div>
      </div>

      {canShare() || links.whatsapp || links.telegram ? (
        <>
          <div className={classes.share}>
            {canShare() ? (
              <button type="button" className={classes.ghost} onClick={share}>
                Share
              </button>
            ) : null}
            {links.whatsapp ? (
              <a
                className={classes.ghost}
                href={links.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            ) : null}
            {links.telegram ? (
              <a
                className={classes.ghost}
                href={links.telegram}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
            ) : null}
          </div>
          <p className={classes.note}>
            The invite goes out with your code already in it — send it to whoever you want to bring
            in.
          </p>
        </>
      ) : null}

      <section className={classes.section} aria-label="Your referrals">
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>What it has brought in</h3>
        </div>
        <div className={classes.counts}>
          <div className={classes.count}>
            <span className={classes.countFigure}>{data.referredPeopleCount}</span>
            <span className={classes.countLabel}>People referred</span>
          </div>
          <div className={classes.count}>
            <span className={classes.countFigure}>{data.referralsCount}</span>
            <span className={classes.countLabel}>Orders earned on</span>
          </div>
        </div>
      </section>

      <section className={classes.section} aria-label="Who referred you">
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>Were you referred?</h3>
        </div>

        {data.hasReferrer ? (
          <div className={classes.referrer}>
            <span className={classes.rowLabel}>Referred by</span>
            <span className={classes.rowFigure}>{data.referrerNickname ?? 'Someone at the shop'}</span>
          </div>
        ) : (
          <>
            <p className={classes.note}>
              Enter their code once and it stays on your account. You can&rsquo;t change it later.
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
                aria-label="Referral code"
                aria-invalid={claim.isError ? true : undefined}
                placeholder="Their code"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
              />
              <button
                type="submit"
                className={classes.ghost}
                disabled={claim.isPending || draft.trim().length === 0}
              >
                {claim.isPending ? 'Checking' : 'Apply'}
              </button>
            </form>
            {claim.isError ? (
              <span className={classes.error}>
                {errorMessage(claim.error, "That code didn't work")}
              </span>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
