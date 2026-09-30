import { useState } from 'react';
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
import classes from '@/features/account/Account.module.css';

/** How full an option's reach rule runs: 0 at nothing saved, 1 the moment it is affordable. */
export function reachRatio(points: number, cost: number): number {
  if (cost <= 0) return 1;
  return Math.min(1, Math.max(0, points / cost));
}

/**
 * Standing, read as a meter: the points balance is the one loud figure on the
 * whole account, and everything under it is quiet. Each redemption carries a
 * hairline showing how near the balance is to it — the same rule says "yours to
 * take" when it fills and "this far off" when it doesn't, so an option that is
 * out of reach still tells the customer something.
 *
 * The whole redemption block disappears when the shop has the feature off: the
 * backend answers `404` there, which the api layer reads as "no such section".
 */
export function LoyaltyPage() {
  const { t } = useText();
  const { currency } = useSettings();
  const profile = useProfile();
  const options = useRedeemOptions();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<RedeemOption | null>(null);

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

  // The redemption view carries its own balance; it is the one the buttons were
  // gated on, so the ladder reads from it and the meter from the profile.
  const ladder = options.data ?? null;
  const points = ladder?.loyaltyPoints ?? profile.data.loyaltyPoints;

  return (
    <div className={classes.body}>
      <div className={classes.meter}>
        <span className={classes.meterFigure}>{formatInteger(profile.data.loyaltyPoints)}</span>
        <span className={classes.meterUnit}>{t('account.loyalty.points')}</span>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('account.loyalty.storeCredit')}</span>
        <span className={classes.rowFigure}>
          <Money amount={profile.data.storeCreditBalance} />
        </span>
      </div>

      {profile.data.loyaltyPoints === 0 ? (
        <p className={classes.note}>{t('account.loyalty.noPoints')}</p>
      ) : null}

      {ladder ? (
        <section className={classes.section} aria-label={t('account.loyalty.redeemAria')}>
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
                        disabled={!option.affordable || mutation.isPending}
                        onClick={() => setConfirming(option)}
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
      ) : null}

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
