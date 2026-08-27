import { useState } from 'react';
import { Button, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { formatMoney } from '@/lib/format.ts';
import { redeem } from '@/api/profile.ts';
import {
  PROFILE_KEY,
  REDEEM_OPTIONS_KEY,
  useProfile,
  useRedeemOptions,
} from '@/features/account/queries.ts';
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
        message: `${formatMoney(result.creditAwarded, currency)} credit added — you now have ${result.newPointsBalance.toLocaleString()} points and ${formatMoney(result.newCreditBalance, currency)} in credit.`,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: PROFILE_KEY }),
        client.invalidateQueries({ queryKey: REDEEM_OPTIONS_KEY }),
      ]);
    },
    onError: (err) => {
      notifications.show({ message: errorMessage(err, "We couldn't redeem that"), color: 'red' });
    },
  });

  if (profile.isPending) return <PageSkeleton inline />;

  if (profile.isError) {
    return (
      <EmptyState
        eyebrow="Loyalty"
        title="We couldn't load your points"
        description="Your balance is safe — this was a hiccup between your browser and us."
        action={
          <Button variant="default" size="sm" onClick={() => void profile.refetch()}>
            Try again
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
        <span className={classes.meterFigure}>{profile.data.loyaltyPoints.toLocaleString()}</span>
        <span className={classes.meterUnit}>Points</span>
      </div>

      <div className={classes.row}>
        <span className={classes.rowLabel}>Store credit</span>
        <span className={classes.rowFigure}>
          <Money amount={profile.data.storeCreditBalance} />
        </span>
      </div>

      {profile.data.loyaltyPoints === 0 ? (
        <p className={classes.note}>Points land on your orders — they&rsquo;ll show up here.</p>
      ) : null}

      {ladder ? (
        <section className={classes.section} aria-label="Redeem points">
          {/* No balance repeated here: the meter states it three lines up, and the
              ladder's own copy of it can be a fetch behind the meter's. */}
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>Redeem</h3>
          </div>

          {ladder.options.length === 0 ? (
            <p className={classes.note}>There&rsquo;s nothing to redeem for right now.</p>
          ) : (
            <ul className={classes.options}>
              {ladder.options.map((option) => {
                const ratio = reachRatio(points, option.pointsCost);
                return (
                  <li key={option.id} className={classes.option}>
                    <div className={classes.optionHead}>
                      <span className={classes.optionLabel}>{option.label}</span>
                      <span className={classes.optionCost}>
                        {option.pointsCost.toLocaleString()} pts
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
                          ? `Worth ${formatMoney(option.creditValue, currency)}`
                          : `${(option.pointsCost - points).toLocaleString()} points to go`}
                      </span>
                      <button
                        type="button"
                        className={classes.ghost}
                        disabled={!option.affordable || mutation.isPending}
                        onClick={() => setConfirming(option)}
                      >
                        Redeem
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
        title="Confirm redemption"
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
              {confirming.label} costs {confirming.pointsCost.toLocaleString()} points, and adds{' '}
              {formatMoney(confirming.creditValue, currency)} of credit to your account. Credit is
              spent at checkout.
            </p>
            <div className={classes.modalActions}>
              <button
                type="button"
                className={classes.ghost}
                onClick={() => setConfirming(null)}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${classes.cta} ${classes.ctaFlush}`}
                onClick={() => mutation.mutate(confirming.id)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Redeeming' : 'Redeem'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
