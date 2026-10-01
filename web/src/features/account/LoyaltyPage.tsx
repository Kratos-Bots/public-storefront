import { useMemo, useState } from 'react';
import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { formatInteger, formatMoney } from '@/lib/format.ts';
import { redeem } from '@/api/profile.ts';
import {
  PROFILE_KEY,
  REDEEM_OPTIONS_KEY,
  useProfile,
  useRedeemOptions,
} from '@/features/account/queries.ts';
import { useText } from '@/text/runtime.tsx';
import type { RedeemOption } from '@/types/profile.ts';
import { LoyaltyFamily, type LoyaltyData, type LoyaltyPreview } from '@/builder/family-loyalty.ts';
import { usePreviewFixture, usePreviewState } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
import classes from '@/features/account/Account.module.css';

/** How full an option's reach rule runs: 0 at nothing saved, 1 the moment it is affordable. */
export function reachRatio(points: number, cost: number): number {
  if (cost <= 0) return 1;
  return Math.min(1, Math.max(0, points / cost));
}

function PointsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile } = LoyaltyFamily.useData();
  return (
    <div className={classes.meter} {...styleAttrs}>
      <span className={classes.meterFigure}>{formatInteger(profile.loyaltyPoints)}</span>
      <span className={classes.meterUnit}>{t('account.loyalty.points')}</span>
    </div>
  );
}

function CreditView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile } = LoyaltyFamily.useData();
  return (
    <div className={classes.row} {...styleAttrs}>
      <span className={classes.rowLabel}>{t('account.loyalty.storeCredit')}</span>
      <span className={classes.rowFigure}>
        <Money amount={profile.storeCreditBalance} />
      </span>
    </div>
  );
}

function NoPointsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { profile } = LoyaltyFamily.useData();
  if (profile.loyaltyPoints !== 0) return null;
  return <p className={classes.note} {...styleAttrs}>{t('account.loyalty.noPoints')}</p>;
}

function RewardsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { currency } = useSettings();
  const { options: ladder, points, confirm, redeeming } = LoyaltyFamily.useData();
  if (!ladder) return null;
  return (
    <section className={classes.section} aria-label={t('account.loyalty.redeemAria')} {...styleAttrs}>
      {/* No balance repeated here: the meter states it three lines up, and the
          ladder's own copy of it can be a fetch behind the meter's. */}
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.loyalty.redeemTitle')}</h3>
      </div>

      {ladder.options.length === 0 ? (
        <p className={classes.note}>{t('account.loyalty.nothingToRedeem')}</p>
      ) : (
        <ul className={classes.options}>
          {ladder.options.map((option) => {
            const ratio = reachRatio(points, option.pointsCost);
            return (
              <li key={option.id} className={classes.option}>
                <div className={classes.optionHead}>
                  <span className={classes.optionLabel}>{option.label}</span>
                  <span className={classes.optionCost}>
                    {t('account.loyalty.cost', { points: formatInteger(option.pointsCost) })}
                  </span>
                </div>

                <div className={classes.reach} aria-hidden>
                  <span
                    className={
                      option.affordable
                        ? `${classes.reachFill} ${classes.reachReady}`
                        : classes.reachFill
                    }
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>

                <div className={classes.optionFoot}>
                  <span className={classes.shortfall}>
                    {option.affordable
                      ? t('account.loyalty.worth', { credit: formatMoney(option.creditValue, currency) })
                      : t('account.loyalty.pointsToGo', { points: formatInteger(option.pointsCost - points) })}
                  </span>
                  <button
                    type="button"
                    className={classes.ghost}
                    disabled={!option.affordable || redeeming}
                    onClick={() => confirm(option)}
                  >
                    {t('account.loyalty.redeem')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The loyalty tab's views (spec §5.4): the v0.7.0 JSX of each piece. */
export const LOYALTY_VIEWS: FamilyValue<LoyaltyData>['views'] = {
  LoyaltyPoints: PointsView, LoyaltyCredit: CreditView, LoyaltyNoPoints: NoPointsView, LoyaltyRewards: RewardsView,
};

/**
 * Standing, read as a meter: the points balance is the one loud figure on the
 * whole account, and everything under it is quiet. Each redemption carries a
 * hairline showing how near the balance is to it — the same rule says "yours to
 * take" when it fills and "this far off" when it doesn't, so an option that is
 * out of reach still tells the customer something.
 *
 * The whole redemption block disappears when the shop has the feature off: the
 * backend answers `404` there, which the api layer reads as "no such section".
 *
 * The Loyalty container: the queries, the redeem mutation, the toast and the confirm dialog
 * stay here; the `content` slot holds the parts. Without `slots` the default arrangement is drawn.
 */
export function LoyaltyPage({ slots }: { slots?: { content: SlotRender } } = {}) {
  const { t } = useText();
  const { currency } = useSettings();
  const state = usePreviewState('Loyalty');
  const fixture = usePreviewFixture<LoyaltyPreview>('Loyalty');
  // The editor previews from a fixture (spec §11.3): the queries neither fire nor are read.
  const preview = fixture !== null;
  const profile = useProfile(!preview);
  const options = useRedeemOptions(!preview);
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<RedeemOption | null>(null);
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('Loyalty', 'storefront', {}, 'account.loyalty')), [slots]);
  const content = slots?.content ?? legacy!.content!;

  const mutation = useMutation({
    mutationFn: (optionId: number) => redeem(optionId),
    onSuccess: async (result) => {
      setConfirming(null);
      notifications.show({
        message: t('account.loyalty.redeemedToast', {
          credit: formatMoney(result.creditAwarded, currency),
          points: formatInteger(result.newPointsBalance),
          balance: formatMoney(result.newCreditBalance, currency),
        }),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: PROFILE_KEY }),
        client.invalidateQueries({ queryKey: REDEEM_OPTIONS_KEY }),
      ]);
    },
    onError: (err) => {
      notifications.show({ message: errorMessage(err, t('account.loyalty.redeemFailed')), color: 'red' });
    },
  });

  const profileData = useMemo(
    () => (preview ? { ...fixture.profile, ...(state === 'no-points' ? { loyaltyPoints: 0 } : {}) } : profile.data),
    [preview, state, fixture, profile.data],
  );
  const ladder = preview ? fixture.options : options.data ?? null;
  const redeeming = mutation.isPending;
  const value = useMemo<FamilyValue<LoyaltyData> | null>(
    () =>
      profileData
        ? {
            // The redemption view carries its own balance; it is the one the buttons were
            // gated on, so the ladder reads from it and the meter from the profile.
            data: { profile: profileData, options: ladder, points: ladder?.loyaltyPoints ?? profileData.loyaltyPoints, confirm: setConfirming, redeeming },
            views: LOYALTY_VIEWS,
          }
        : null,
    [profileData, ladder, redeeming],
  );

  if (!preview) {
    if (profile.isPending) return <PageSkeleton inline />;

    if (profile.isError) {
      return (
        <EmptyState
          eyebrow={t('account.nav.loyalty')}
          title={t('account.loyalty.loadFailedTitle')}
          description={t('account.loyalty.loadFailedBody')}
          action={
            <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
              {t('common.actions.tryAgain')}
            </Button>
          }
        />
      );
    }
  }

  return (
    <div className={classes.body}>
      <LoyaltyFamily.Provider value={value!}>{content()}</LoyaltyFamily.Provider>

      <Modal
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t('account.loyalty.confirmTitle')}
        centered
        size="sm"
        radius="var(--mantine-radius-default)"
        classNames={{
          content: classes.modalContent,
          header: classes.modalHeader,
          title: classes.modalTitle,
        }}
      >
        {confirming ? (
          <>
            <p className={classes.modalBody}>
              {t('account.loyalty.confirmBody', {
                reward: confirming.label,
                points: formatInteger(confirming.pointsCost),
                credit: formatMoney(confirming.creditValue, currency),
              })}
            </p>
            <div className={classes.modalActions}>
              <button
                type="button"
                className={classes.ghost}
                onClick={() => setConfirming(null)}
                disabled={mutation.isPending}
              >
                {t('common.actions.cancel')}
              </button>
              <button
                type="button"
                className={`${classes.cta} ${classes.ctaFlush}`}
                onClick={() => mutation.mutate(confirming.id)}
                disabled={mutation.isPending}
                data-sf-part="button"
                data-variant="filled"
              >
                {mutation.isPending ? t('account.loyalty.redeeming') : t('account.loyalty.redeem')}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
