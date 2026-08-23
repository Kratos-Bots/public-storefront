import { useId, useMemo } from 'react';
import type { CryptoOption } from '@/types/checkout.ts';
import { formatMoney } from '@/lib/format.ts';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/CryptoComboPicker.module.css';

/** Stablecoins group after native coins — same-value coins cluster. */
const STABLECOIN_TICKERS = new Set([
  'usdt',
  'usdc',
  'dai',
  'busd',
  'tusd',
  'usdp',
  'pyusd',
  'fdusd',
  'usds',
]);

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

function groupOptions(options: CryptoOption[]): Array<{ label: string; options: CryptoOption[] }> {
  const coins = options.filter((o) => !STABLECOIN_TICKERS.has(o.coin));
  const stables = options.filter((o) => STABLECOIN_TICKERS.has(o.coin));
  // Within a group, cluster the networks of one coin together, in first-seen coin order.
  const cluster = (list: CryptoOption[]) => {
    const order = [...new Set(list.map((o) => o.coin))];
    return [...list].sort((a, b) => order.indexOf(a.coin) - order.indexOf(b.coin));
  };
  return [
    { label: 'Coins', options: cluster(coins) },
    { label: 'Stablecoins', options: cluster(stables) },
  ].filter((g) => g.options.length > 0);
}

/**
 * Which coin, on which network. The figure on each row is that combo's own
 * `chargeTotal` — networks of the same coin can carry different fees, so the
 * number a shopper compares has to be per-combo, not per-coin.
 */
export function CryptoComboPicker({ options, value, onChange, currency }: CryptoComboPickerProps) {
  const name = useId();
  const groups = useMemo(() => groupOptions(options), [options]);

  if (options.length === 0) return null;

  return (
    <div className={classes.picker}>
      {groups.map((group) => (
        <div key={group.label} className={classes.group}>
          {groups.length > 1 ? (
            <p className={classes.groupHead}>
              {group.label}
              <span className={classes.groupRule} aria-hidden />
            </p>
          ) : null}
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
                    <span className={fields.choiceName}>{o.coinLabel}</span>
                    <span className={fields.choiceNote}>
                      {o.networkLabel}
                      {o.feeRateText ? <span className={classes.fee}> · {o.feeRateText}</span> : null}
                    </span>
                  </span>
                  <span className={fields.choiceFigure}>{formatMoney(o.chargeTotal, currency)}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
