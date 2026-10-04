import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PaymentConflictError,
  fetchPaymentOptions,
  selectPaymentMethod,
  type PaymentSelection,
} from '@/api/public-order.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { methodName } from '@/lib/method-name.ts';
import { orderChatMessage } from '@/lib/chat-links.ts';
import { formatAmountPlain, formatMoney } from '@/lib/format.ts';
import { CryptoComboPicker, type CryptoCombo } from '@/features/checkout/CryptoComboPicker.tsx';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { paymentOptionsKey, publicOrderKey } from '@/features/order-status/queries.ts';
import {
  isManual,
  settlementQuote,
  slotLabel,
  type SettlementQuote,
} from '@/features/order-status/payment-state.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import type { PublicOrder, SelectPaymentResult } from '@/types/public-order.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface MethodPickerProps {
  order: PublicOrder;
  reference: string;
  accessKey: string;
  /** Called once a payment has been created — lets the change panel fold away. */
  onSelected?: () => void;
}

/**
 * How the customer pays. The methods come from the order's own
 * `payment-options`, so the shop's fee rules, country rules and minimums are
 * the same ones checkout applied — this page never re-derives them.
 *
 * Three kinds of row, three different things to do:
 *  - a hosted checkout opens in a new tab (opened on the click itself, so the
 *    popup blocker allows it, and pointed at the session once it exists);
 *  - crypto opens its coin/network combos, and the payment appears on this page;
 *  - a bank transfer opens its details. It is not created here: the backend
 *    refuses every manual gateway on the public payment route, so offering to
 *    "select" one would be a guaranteed error. The details are the answer.
 */
export function MethodPicker({ order, reference, accessKey, onSelected }: MethodPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [combo, setCombo] = useState<CryptoCombo | null>(null);
  const { t } = useText();

  const options = useQuery({
    // Keyed on the reference alone: the access key is a credential, not an
    // input, and the backend re-derives the country and total from the order.
    queryKey: paymentOptionsKey(reference),
    queryFn: () => fetchPaymentOptions(reference, accessKey),
    enabled: !!order.payment?.canPay,
    staleTime: 60_000,
  });

  const refetchOrder = () =>
    queryClient.invalidateQueries({ queryKey: publicOrderKey(reference, accessKey) });

  const select = useMutation({
    mutationFn: (selection: PaymentSelection) => selectPaymentMethod(reference, accessKey, selection),
    onSuccess: () => {
      void refetchOrder();
      onSelected?.();
    },
    onError: (err: Error) => {
      // 409: the order moved under us (paid, cancelled, no longer pending).
      // The new state is the answer, so re-render reality instead of an error.
      if (err instanceof PaymentConflictError) void refetchOrder();
    },
  });

  const busy = select.isPending;

  // `isLoading`, not `isPending`: a disabled query is pending forever, and this
  // must never sit on "Loading…" with nothing in flight.
  if (options.isLoading) {
    return <p className={classes.cardNote}>{t('order.method.loading')}</p>;
  }

  if (options.isError) {
    return (
      <>
        <p className={classes.note} data-tone="danger">
          {errorMessage(options.error, t('order.errors.loadMethods'))}
        </p>
        <button
          type="button"
          className={`${classes.ghost} ${classes.ghostWide}`}
          onClick={() => void options.refetch()}
        >
          {t('common.actions.tryAgain')}
        </button>
      </>
    );
  }

  const methods = options.data ?? [];
  if (methods.length === 0) {
    return (
      <>
        <p className={classes.cardNote}>{t('order.method.none')}</p>
        <div className={classes.chatLinks}>
          <ContactLinks prefill={orderChatMessage(order.reference)} />
        </div>
      </>
    );
  }

  /* A hosted checkout has to open on the click itself or the popup blocker eats
     it, so the tab is opened blank and pointed at the session once it exists. */
  const openHostedCheckout = (method: PaymentMethod) => {
    if (busy) return;
    // In the page builder the mutation is refused in the frame: no blank tab to strand.
    const tab = isBuilderMode() ? null : window.open('', '_blank');
    if (tab) tab.opener = null;
    select.mutate(
      { method: method.method },
      {
        onSuccess: (result: SelectPaymentResult) => {
          if (!result.checkoutUrl) {
            tab?.close();
            return;
          }
          if (tab) tab.location.href = result.checkoutUrl;
          else window.open(result.checkoutUrl, '_blank', 'noopener');
        },
        onError: () => tab?.close(),
      },
    );
  };

  const onPick = (method: PaymentMethod) => {
    if (busy) return;
    const combos = method.cryptoOptions ?? [];
    if (combos.length > 0 || isManual(method)) {
      setCombo(null);
      setOpen((current) => (current === method.method ? null : method.method));
      return;
    }
    openHostedCheckout(method);
  };

  return (
    <div className={classes.picker}>
      <div className={classes.pickerList}>
        {methods.map((method) => {
          const combos = method.cryptoOptions ?? [];
          // A row either opens something on this page or leaves for a hosted
          // checkout, and it says which before it is pressed: a square marker
          // for the first, the shop's "opens elsewhere" arrow for the second.
          const opensHere = combos.length > 0 || isManual(method);
          const expanded = open === method.method;
          const inFlight = busy && select.variables?.method === method.method;
          // Only a row that opens a hosted checkout may say so. A static-crypto
          // submit is in flight on the row too, but the drawer's own button is
          // already narrating it ("Preparing payment...") and no checkout opens.
          const opening = inFlight && !opensHere;

          return (
            <div key={method.method}>
              <button
                type="button"
                className={classes.pickerRow}
                onClick={() => onPick(method)}
                disabled={busy}
                aria-expanded={opensHere ? expanded : undefined}
              >
                {opensHere ? (
                  <span
                    className={expanded ? `${classes.pickerMark} ${classes.pickerMarkOn}` : classes.pickerMark}
                    aria-hidden
                  >
                    {expanded ? <span className={classes.pickerMarkCore} /> : null}
                  </span>
                ) : (
                  <span className={classes.pickerSpacer} aria-hidden />
                )}
                <span className={classes.pickerLabel}>
                  {opening ? t('order.method.opening') : slotLabel(method)}
                </span>
                <span className={classes.pickerFigure}>
                  {formatMoney(method.chargeTotal, order.currency)}
                </span>
                {opensHere ? null : (
                  <span className={classes.pickerAway} aria-hidden>
                    <ArrowUpRightIcon size={12} />
                  </span>
                )}
              </button>

              {expanded && combos.length > 0 ? (
                <div className={classes.pickerDrawer}>
                  <CryptoComboPicker
                    options={combos}
                    value={combo}
                    onChange={setCombo}
                    currency={order.currency}
                  />
                  <button
                    type="button"
                    className={classes.cta}
                    disabled={!combo || busy}
                    onClick={() =>
                      combo &&
                      select.mutate({
                        method: method.method,
                        coin: combo.coin,
                        network: combo.network,
                      })
                    }
                    data-sf-part="button"
                    data-variant="filled"
                  >
                    {busy
                      ? t('order.method.preparing')
                      : combo
                        ? t('order.method.payWith', { coin: comboLabel(combos, combo) })
                        : t('order.method.chooseCoin')}
                  </button>
                  <p className={classes.txidBlurb}>{t('order.method.coinBlurb')}</p>
                </div>
              ) : null}

              {expanded && isManual(method) ? (
                <div className={classes.pickerDrawer}>
                  <TransferDetails
                    method={method}
                    reference={order.reference}
                    settlement={settlementQuote(order, method)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {select.isError && !(select.error instanceof PaymentConflictError) ? (
        <p className={classes.note} data-tone="danger">
          {errorMessage(select.error, t('order.errors.methodUnavailable'))}
        </p>
      ) : null}
    </div>
  );
}

/** The chosen combo, named the way the picker rows name it. */
function comboLabel(options: PaymentMethod['cryptoOptions'], combo: CryptoCombo): string {
  const match = (options ?? []).find((o) => o.coin === combo.coin && o.network === combo.network);
  return match ? `${match.coinLabel} · ${match.networkLabel}` : combo.coin.toUpperCase();
}

/**
 * A bank transfer's details. These come from the payment-options response —
 * the public order view carries no instructions — and are shown as copy rows,
 * because every one of them has to be typed into a banking app. When the account
 * settles in another currency than the shop's, the amount to send is quoted in
 * that currency: shown with its symbol, copied as the bare number an amount
 * field accepts.
 */
function TransferDetails({
  method,
  reference,
  settlement,
}: {
  method: PaymentMethod;
  reference: string;
  settlement: SettlementQuote | null;
}) {
  const { t } = useText();
  const details = Object.entries(method.details ?? {});

  return (
    <>
      <p className={classes.pickerHead}>
        {t('order.method.transferHead', { method: methodName(method) })}
        <span className={classes.pickerHeadRule} aria-hidden />
      </p>
      {details.length > 0 ? (
        <>
          {details.map(([label, value]) => (
            <CopyRow key={label} label={label} value={value} />
          ))}
          {settlement ? (
            <CopyRow
              label={t('order.crypto.amountToSend')}
              value={formatMoney(settlement.amount, settlement.currency)}
              copyValue={formatAmountPlain(settlement.amount, settlement.currency)}
            />
          ) : null}
          <CopyRow label={t('order.method.paymentReference')} value={reference} />
          <p className={classes.txidBlurb}>{t('order.method.transferBlurb')}</p>
        </>
      ) : (
        <p className={classes.txidBlurb}>{t('order.method.noDetails', { reference })}</p>
      )}
      <div className={classes.chatLinks}>
        <ContactLinks prefill={orderChatMessage(reference)} />
      </div>
    </>
  );
}
