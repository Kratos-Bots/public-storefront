import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { FADE } from '@/lib/motion.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/features/tracking/Tracking.module.css';

/** Same shape the backend accepts, so a reference it would reject never costs a request. */
const REFERENCE_RE = /^[A-Z0-9_-]{1,64}$/;

export interface LookupFormProps {
  initial?: string;
  /** The builder's style attributes for this part (spread on the root element). */
  rootAttrs?: StyleAttrs;
}

/**
 * Type a reference, go to its page. Nothing is fetched here: the URL is the
 * source of truth for what is being tracked, so this only validates the shape
 * and navigates — which also means a lookup can be shared, bookmarked and
 * reloaded.
 */
export function LookupForm({ initial = '', rootAttrs }: LookupFormProps) {
  const { t, msg } = useText();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const reference = value.trim().toUpperCase();
    if (!REFERENCE_RE.test(reference)) {
      setError(textKey('tracking.lookup.invalidReference'));
      return;
    }
    navigate(`/tracking/${encodeURIComponent(reference)}`);
  };

  return (
    <form className={`${classes.form} ${FADE}`} onSubmit={submit} {...rootAttrs}>
      {/* The error sits beside the label rather than inside it: in the label it
          would become part of the field's accessible name. */}
      <div className={classes.fieldHead}>
        <label htmlFor={inputId}>{t('tracking.lookup.label')}</label>
        {error ? (
          <span id={errorId} className={classes.fieldError} role="alert">
            {msg(error)}
          </span>
        ) : null}
      </div>
      <input
        id={inputId}
        className={classes.input}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        placeholder={t('tracking.lookup.placeholder')}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : hintId}
      />

      <p className={classes.hint} id={hintId}>
        {t('tracking.lookup.hint')}
      </p>

      <button
        className={classes.submit}
        type="submit"
        data-sf-part="button"
        data-variant="filled"
      >
        {t('tracking.lookup.submit')}
      </button>
    </form>
  );
}
