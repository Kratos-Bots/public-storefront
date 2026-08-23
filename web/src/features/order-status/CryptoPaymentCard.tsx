import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitCryptoTxid } from '@/api/public-order.ts';
import { CheckIcon, ClockIcon } from '@/components/icons.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { formatCoinAmount, formatMoney } from '@/lib/format.ts';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { publicOrderKey } from '@/features/order-status/queries.ts';
import {
  cardState,
  submittedTxidMask,
  type CardState,
  type TxidSubmission,
} from '@/features/order-status/payment-state.ts';
import type { PublicCryptoPayment } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

const PILL: Record<CardState, { label: string; tone: string | null }> = {
  awaiting: { label: 'Awaiting payment', tone: null },
  checking: { label: 'Verifying', tone: null },
  confirmed: { label: 'Confirmed', tone: classes.pillSuccess },
  attention: { label: 'In review', tone: classes.pillWarn },
};

const TITLE: Record<CardState, string> = {
  awaiting: '',
  checking: 'Verifying your payment',
  confirmed: 'Payment confirmed',
  attention: 'Payment in review',
};

/** The backend accepts 10–120 characters; the form says so before the round trip. */
const TXID_MIN = 10;
const TXID_MAX = 120;

export interface CryptoPaymentCardProps {
  payment: PublicCryptoPayment;
  reference: string;
  accessKey: string;
  currency: string;
}

/**
 * A static-crypto payment: the exact amount, the address it goes to, and the
 * transaction id that lets us find it on-chain. The card leaves the form the
 * instant a txid is accepted — the order refetch then takes over as the source
 * of truth.
 */
export function CryptoPaymentCard({ payment, reference, accessKey, currency }: CryptoPaymentCardProps) {
  const queryClient = useQueryClient();
  const [txid, setTxid] = useState('');

  const submit = useMutation({
    mutationFn: (value: string) => submitCryptoTxid(reference, accessKey, payment.paymentId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicOrderKey(reference, accessKey) });
    },
  });

  const submission: TxidSubmission | null =
    submit.isSuccess && submit.data && submit.variables
      ? { verification: submit.data, txid: submit.variables }
      : null;
  const state = cardState(payment, submission);
  const masked = submittedTxidMask(payment, submission);

  const amount = formatCoinAmount(payment.coinAmount);
  const pill = PILL[state];
  const trimmed = txid.trim();
  const valid = trimmed.length >= TXID_MIN && trimmed.length <= TXID_MAX;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || submit.isPending) return;
    submit.mutate(trimmed);
  };

  return (
    <section
      className={state === 'awaiting' ? `${classes.card} ${classes.cardAction}` : classes.card}
      aria-label="Crypto payment"
    >
      <div className={classes.cardHead}>
        <div className={classes.cardHeadBody}>
          <p
            className={
              state === 'awaiting'
                ? `${classes.cardEyebrow} ${classes.cardEyebrowAction}`
                : classes.cardEyebrow
            }
          >
            {state === 'awaiting' ? 'Payment required' : 'Crypto payment'}
          </p>
          <h2 className={classes.cardTitle}>
            {state === 'awaiting' ? `Send ${amount} ${payment.coinLabel}` : TITLE[state]}
          </h2>
          <p className={classes.cardFigure}>
            {payment.coinLabel} · {payment.networkLabel} network ·{' '}
            {/* The sign belongs to the figure — a line break between them reads as
                an orphaned symbol. */}
            <span className={classes.nowrap}>≈ {formatMoney(payment.fiatAmount, currency)}</span>
          </p>
        </div>
        <span className={pill.tone ? `${classes.pill} ${pill.tone}` : classes.pill}>{pill.label}</span>
      </div>

      {state === 'awaiting' ? (
        <>
          <CopyRow
            label="Amount to send"
            value={`${amount} ${payment.coinLabel}`}
            copyValue={amount}
          />
          <CopyRow
            label={`${payment.coinLabel} address (${payment.networkLabel})`}
            value={payment.address}
          />

          <p className={classes.note} data-tone="warn">
            Send exactly {amount} {payment.coinLabel} on the {payment.networkLabel} network. A
            different amount or network can delay or lose your payment.
          </p>

          <form className={classes.txidForm} onSubmit={onSubmit}>
            <label className={classes.txidLabel} htmlFor={`txid-${payment.paymentId}`}>
              Transaction ID
            </label>
            <p className={classes.txidBlurb}>
              Once you&rsquo;ve sent it, paste the transaction ID from your wallet and we&rsquo;ll
              verify it on-chain.
            </p>
            <div className={classes.txidRow}>
              <input
                id={`txid-${payment.paymentId}`}
                className={classes.txidInput}
                type="text"
                value={txid}
                onChange={(e) => setTxid(e.currentTarget.value)}
                placeholder="Paste transaction ID"
                autoComplete="off"
                spellCheck={false}
                maxLength={TXID_MAX}
                aria-invalid={submit.isError || undefined}
              />
              <button
                type="submit"
                className={`${classes.ghost} ${classes.txidSubmit}`}
                disabled={!valid || submit.isPending}
              >
                {submit.isPending ? 'Sending…' : 'Submit'}
              </button>
            </div>
            {submit.isError ? (
              <p className={classes.note} data-tone="danger">
                {errorMessage(submit.error, 'That transaction ID was not accepted. Check it and try again.')}
              </p>
            ) : null}
          </form>
        </>
      ) : null}

      {state !== 'awaiting' && masked ? (
        <div className={classes.copyRow}>
          <div className={classes.copyBody}>
            <p className={classes.copyLabel}>Transaction ID</p>
            <p className={classes.copyValue}>{masked}</p>
          </div>
        </div>
      ) : null}

      {state === 'checking' ? (
        <>
          <div className={classes.waiting} aria-hidden />
          <p className={classes.waitingNote}>
            Reading it off the chain — this can take a few minutes. The page updates on its own.
          </p>
        </>
      ) : null}

      {state === 'confirmed' ? (
        <p className={classes.note} data-tone="success">
          <CheckIcon size={11} /> Payment received in full
        </p>
      ) : null}

      {state === 'attention' ? (
        <p className={classes.waitingNote}>
          <ClockIcon size={13} />
          We&rsquo;re taking a closer look at this payment — nothing more is needed from you. Message
          us if it stays here.
        </p>
      ) : null}
    </section>
  );
}
