import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitOrderCryptoTxid } from '@/api/orders.ts';
import { CheckIcon, ClockIcon } from '@/components/icons.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { formatCoinAmount, formatMoney } from '@/lib/format.ts';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { orderPaymentKey } from '@/features/order-status/queries.ts';
import {
  cardState,
  submittedTxidMask,
  type CardState,
  type TxidSubmission,
} from '@/features/order-status/payment-state.ts';
import { FADE } from '@/lib/motion.ts';
import type { PublicCryptoPayment } from '@/types/public-order.ts';
import type { StringKey } from '@/text/registry.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

/** A card that is still asking for money needs no pill: the page's status and the card's own title say so. */
const PILL: Record<Exclude<CardState, 'awaiting'>, { label: Extract<StringKey, `order.crypto.pill${string}`>; tone: string | null }> = {
  checking: { label: textKey('order.crypto.pillChecking'), tone: null },
  confirmed: { label: textKey('order.crypto.pillConfirmed'), tone: classes.pillSuccess },
  attention: { label: textKey('order.crypto.pillAttention'), tone: classes.pillWarn },
};

/** The heading once the card has left the form (the awaiting card names the coin instead). */
const TITLE: Record<Exclude<CardState, 'awaiting'>, Extract<StringKey, `order.crypto.title${string}`>> = {
  checking: textKey('order.crypto.titleChecking'),
  confirmed: textKey('order.crypto.titleConfirmed'),
  attention: textKey('order.crypto.titleAttention'),
};

/** The backend accepts 10–120 characters; the form says so before the round trip. */
const TXID_MIN = 10;
const TXID_MAX = 120;

export interface CryptoPaymentCardProps {
  payment: PublicCryptoPayment;
  reference: string;
  currency: string;
}

/**
 * A static-crypto payment, as three steps in the order they are done: the exact amount, the address it goes
 * to, and the transaction id that lets us find it on-chain. The amount is stated once, in the copyable row.
 * The card leaves the form the instant a txid is accepted — the order refetch then takes over as the source
 * of truth.
 */
export function CryptoPaymentCard({ payment, reference, currency }: CryptoPaymentCardProps) {
  const queryClient = useQueryClient();
  const [txid, setTxid] = useState('');
  const { t, tn } = useText();

  const submit = useMutation({
    mutationFn: (value: string) => submitOrderCryptoTxid(reference, payment.paymentId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderPaymentKey(reference) });
    },
  });

  const submission: TxidSubmission | null =
    submit.isSuccess && submit.data && submit.variables
      ? { verification: submit.data, txid: submit.variables }
      : null;
  const state = cardState(payment, submission);
  const masked = submittedTxidMask(payment, submission);

  const amount = formatCoinAmount(payment.coinAmount);
  const pill = state === 'awaiting' ? null : PILL[state];
  const trimmed = txid.trim();
  const valid = trimmed.length >= TXID_MIN && trimmed.length <= TXID_MAX;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || submit.isPending) return;
    submit.mutate(trimmed);
  };

  return (
    <section className={`${classes.face} ${FADE}`} aria-label={t('order.crypto.label')}>
      <div className={classes.faceHead}>
        <div className={classes.faceHeadBody}>
          <h3 className={classes.faceTitle}>
            {state === 'awaiting' ? t('order.crypto.payTitle', { coin: payment.coinLabel }) : t(TITLE[state])}
          </h3>
          <p className={classes.faceLead}>
            {tn('order.crypto.network', {
              network: payment.networkLabel,
              // The sign belongs to the figure — a line break between them reads as
              // an orphaned symbol.
              fiat: <span className={classes.nowrap}>≈ {formatMoney(payment.fiatAmount, currency)}</span>,
            })}
          </p>
        </div>
        {pill ? <span className={pill.tone ? `${classes.pill} ${pill.tone}` : classes.pill} data-sf-part="badge">{t(pill.label)}</span> : null}
      </div>

      {state === 'awaiting' ? (
        <div className={classes.steps}>
          <CopyRow
            step={1}
            label={t('order.crypto.amountToSend')}
            value={`${amount} ${payment.coinLabel}`}
            copyValue={amount}
          />
          <CopyRow
            step={2}
            label={t('order.crypto.addressLabel', { coin: payment.coinLabel, network: payment.networkLabel })}
            value={payment.address}
          />

          <p className={classes.note} data-tone="warn">
            {t('order.crypto.warning', { network: payment.networkLabel })}
          </p>

          <form className={classes.txidForm} onSubmit={onSubmit}>
            <div className={classes.stepHead}>
              <span className={classes.stepNum} aria-hidden>3</span>
              <div className={classes.stepBody}>
                <label className={classes.stepLabel} htmlFor={`txid-${payment.paymentId}`}>
                  {t('order.crypto.txidLabel')}
                </label>
                <p className={classes.txidBlurb}>{t('order.crypto.txidBlurb')}</p>
              </div>
            </div>
            <input
              id={`txid-${payment.paymentId}`}
              className={classes.txidInput}
              type="text"
              value={txid}
              onChange={(e) => setTxid(e.currentTarget.value)}
              placeholder={t('order.crypto.txidPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              maxLength={TXID_MAX}
              aria-invalid={submit.isError || undefined}
            />
            <button
              type="submit"
              className={classes.txidSubmit}
              disabled={!valid || submit.isPending}
              data-sf-part="button"
              data-variant={valid ? 'filled' : 'default'}
            >
              {submit.isPending ? t('order.crypto.sending') : t('order.crypto.submit')}
            </button>
            {submit.isError ? (
              <p className={classes.note} data-tone="danger">
                {errorMessage(submit.error, t('order.errors.txidRejected'))}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}

      {state !== 'awaiting' && masked ? (
        <div className={classes.copyRow}>
          <div className={classes.copyBody}>
            <p className={classes.copyLabel}>{t('order.crypto.txidLabel')}</p>
            <p className={classes.copyValue}>{masked}</p>
          </div>
        </div>
      ) : null}

      {state === 'checking' ? (
        <>
          <p className={classes.waitingNote}>{t('order.crypto.checkingNote')}</p>
          <div className={classes.waiting} aria-hidden />
        </>
      ) : null}

      {state === 'confirmed' ? (
        <p className={classes.note} data-tone="success">
          <CheckIcon size={11} /> {t('order.crypto.receivedInFull')}
        </p>
      ) : null}

      {state === 'attention' ? (
        <p className={classes.waitingNote}>
          <ClockIcon size={13} />
          {t('order.crypto.attentionNote')}
        </p>
      ) : null}
    </section>
  );
}
