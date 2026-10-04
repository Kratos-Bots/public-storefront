import { useEffect, useRef, useState } from 'react';
import { Field } from '@/features/checkout/Field.tsx';
import { usePointSearch } from '@/features/checkout/usePointSearch.ts';
import type { ServicePoint } from '@/types/service-points.ts';
import { useText } from '@/text/runtime.tsx';
import fields from '@/features/checkout/Fields.module.css';

export interface PointPickerProps {
  country: string;
  /** The chosen point, if any. */
  value: ServicePoint | null;
  /** The postcode box, held by the form so it survives leaving the step. */
  postcode: string;
  error?: string;
  onPostcodeChange: (postcode: string) => void;
  onChoose: (point: ServicePoint) => void;
}

const pointAddress = (p: ServicePoint) =>
  [[p.street, p.houseNumber].map((s) => s.trim()).filter(Boolean).join(' '), p.city].filter(Boolean).join(', ');

/** One collection point's name, address, carrier and distance. */
function PointLines({ point }: { point: ServicePoint }) {
  const { t } = useText();
  return (
    <>
      <span className={fields.choiceBody}>
        <span className={fields.choiceName}>{point.name}</span>
        <span className={fields.choiceNote}>{pointAddress(point)}</span>
        <span className={fields.choiceNote}>{point.carrier}</span>
      </span>
      {point.distance !== null ? (
        <span className={fields.choiceFigure}>{t('checkout.address.pointDistance', { km: (point.distance / 1000).toFixed(1) })}</span>
      ) : null}
    </>
  );
}

/**
 * Find a carrier collection point by postcode and choose one. A postcode search
 * and a list, like the shop's Telegram address form: no map. With a point
 * already chosen it shows that point and a Change action instead of the search.
 */
export function PointPicker({ country, value, postcode, error, onPostcodeChange, onChoose }: PointPickerProps) {
  const { t, msg } = useText();
  const { state, search } = usePointSearch(country);
  // Open when there is nothing chosen yet, or when the shopper asked to change it.
  const [changing, setChanging] = useState(false);
  const searching = value === null || changing;

  // Swapping between the summary and the search unmounts whatever had focus, so
  // hand focus to the thing that replaces it: the summary after a choice, the
  // postcode box after Change. Never on first render, so the step does not steal focus.
  const root = useRef<HTMLDivElement>(null);
  const moveFocus = useRef<'summary' | 'search' | null>(null);
  useEffect(() => {
    const target = moveFocus.current;
    if (!target) return;
    moveFocus.current = null;
    const el = target === 'summary' ? root.current?.querySelector<HTMLElement>('[data-point-summary]') : root.current?.querySelector<HTMLElement>('input[type="text"]');
    el?.focus();
  }, [searching]);

  if (!searching && value) {
    return (
      <div className={fields.point} ref={root}>
        <p className={fields.label}>{t('checkout.address.pointChosen')}</p>
        <div className={fields.choices}>
          <div className={fields.pointChosen} data-point-summary tabIndex={-1}>
            <PointLines point={value} />
            <button
              type="button"
              className={fields.pointChange}
              onClick={() => {
                moveFocus.current = 'search';
                setChanging(true);
              }}
            >
              {t('checkout.address.pointChange')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={fields.point} ref={root}>
      <div className={fields.pointSearch}>
        <div
          className={fields.pointPostcode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search(postcode);
            }
          }}
        >
          <Field
            label={t('checkout.address.pointPostcode')}
            value={postcode}
            onChange={onPostcodeChange}
            autoComplete="postal-code"
            maxLength={16}
          />
        </div>
        <button
          type="button"
          className={fields.pointSearchButton}
          data-sf-part="button"
          data-variant="default"
          disabled={state.status === 'searching'}
          onClick={() => search(postcode)}
        >
          {t('checkout.address.pointSearch')}
        </button>
      </div>

      <div aria-live="polite">
        {state.status === 'idle' ? <p className={fields.hint}>{t('checkout.address.pointPrompt')}</p> : null}
        {state.status === 'searching' ? <p className={fields.hint}>{t('checkout.address.pointSearching')}</p> : null}
        {state.status === 'empty' ? <p className={fields.hint}>{t('checkout.address.pointEmpty')}</p> : null}
        {state.status === 'error' ? (
          <p className={fields.error}>{t(state.kind === 'busy' ? 'checkout.address.pointBusy' : 'checkout.address.pointFailed')}</p>
        ) : null}
      </div>

      {state.status === 'results' ? (
        <div className={`${fields.choices} ${fields.pointList}`} role="radiogroup" aria-label={t('checkout.address.pointList')}>
          {state.points.map((p) => (
            <label className={fields.choice} key={`${p.carrier}-${p.id}`}>
              <input
                type="radio"
                name="service-point"
                checked={value?.id === p.id && value.carrier === p.carrier}
                onChange={() => {
                  moveFocus.current = 'summary';
                  setChanging(false);
                  onChoose(p);
                }}
              />
              <span className={fields.marker} aria-hidden />
              <PointLines point={p} />
            </label>
          ))}
        </div>
      ) : null}

      {error ? <span className={fields.error}>{msg(error)}</span> : null}
    </div>
  );
}
