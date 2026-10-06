import { useId, useMemo } from 'react';
import type { CryptoOption } from '@/types/checkout.ts';
import { formatMoney } from '@/lib/format.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import { groupByNetwork, namesNetworkAsCoin } from '@/features/checkout/crypto-groups.ts';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/CryptoComboPicker.module.css';

export interface CryptoCombo {
  coin: string;
  network: string;
}

export interface CryptoComboPickerProps {
  options: CryptoOption[];
  value: CryptoCombo | null;
  onChange: (combo: CryptoCombo) => void;
  currency: string;
}

/**
 * Which coin, on which network. Sending a coin down the wrong network loses it, so the network is the
 * organising idea: one headed group per network, and every row repeats its network as a tag so a chosen row
 * still says where to send even when its heading has scrolled away. The figure on each row is that combo's
 * own `chargeTotal` — networks of the same coin can carry different fees, so the number a shopper compares
 * has to be per-combo, not per-coin.
 */
export function CryptoComboPicker({ options, value, onChange, currency }: CryptoComboPickerProps) {
  const { t } = useText();
  const name = useId();
  const groups = useMemo(() => groupByNetwork(options), [options]);

  if (options.length === 0) return null;

  return (
    <div className={classes.picker}>
      {groups.map((group) => {
        const headId = `${name}-${group.network}`;
        return (
          <div key={group.network} className={classes.group} role="group" aria-labelledby={headId} data-sf-part="crypto-network">
            <p id={headId} className={classes.groupHead}>
              {t(textKey('checkout.crypto.networkHeading'), { network: group.label })}
              <span className={classes.groupRule} aria-hidden />
            </p>
            <div className={`${fields.choices} ${classes.list}`}>
              {group.options.map((o) => {
                const selected = value?.coin === o.coin && value?.network === o.network;
                return (
                  <label className={fields.choice} key={`${o.coin}:${o.network}`}>
                    <input
                      type="radio"
                      name={name}
                      checked={selected}
                      onChange={() => onChange({ coin: o.coin, network: o.network })}
                    />
                    <span className={fields.marker} aria-hidden />
                    <span className={fields.choiceBody}>
                      <span className={classes.nameLine}>
                        <span className={fields.choiceName}>{o.coinLabel}</span>
                        {/* A real space, so the row's accessible name reads "USDT on Polygon". */}{' '}
                        <span className={classes.network} data-sf-part="crypto-network-tag">
                          {namesNetworkAsCoin(o)
                            ? t(textKey('checkout.crypto.networkHeading'), { network: o.networkLabel })
                            : t(textKey('checkout.crypto.onNetwork'), { network: o.networkLabel })}
                        </span>
                      </span>
                      {o.feeRateText ? <span className={`${fields.choiceNote} ${classes.fee}`}>{o.feeRateText}</span> : null}
                    </span>
                    <span className={fields.choiceFigure}>{formatMoney(o.chargeTotal, currency)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
