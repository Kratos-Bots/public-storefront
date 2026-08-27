import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { listSavedOrders } from '@/stores/saved-orders.ts';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/tracking/Tracking.module.css';

/** Same shape the backend accepts, so a reference it would reject never costs a request. */
const REFERENCE_RE = /^[A-Z0-9_-]{1,64}$/;

/** How many previously opened references are worth offering back. */
const RECENT_LIMIT = 4;

export interface LookupFormProps {
  initial?: string;
}

/**
 * Type a reference, go to its page. Nothing is fetched here: the URL is the
 * source of truth for what is being tracked, so this only validates the shape
 * and navigates — which also means a lookup can be shared, bookmarked and
 * reloaded.
 */
export function LookupForm({ initial = '' }: LookupFormProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  // Read once on mount: references this browser has already opened, newest first.
  const [recent] = useState(() => listSavedOrders().slice(0, RECENT_LIMIT));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const reference = value.trim().toUpperCase();
    if (!REFERENCE_RE.test(reference)) {
      setError('Check that reference');
      return;
    }
    navigate(`/tracking/${encodeURIComponent(reference)}`);
  };

  return (
    <form className={`${classes.form} ${FADE}`} onSubmit={submit}>
      {/* The error sits beside the label rather than inside it: in the label it
          would become part of the field's accessible name. */}
      <div className={classes.fieldHead}>
        <label htmlFor={inputId}>Order number</label>
        {error ? (
          <span id={errorId} className={classes.fieldError} role="alert">
            {error}
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
        placeholder="A7K2QM"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : hintId}
      />

      <p className={classes.hint} id={hintId}>
        Six characters, on your order confirmation.
      </p>

      <button className={classes.submit} type="submit">
        Track order
      </button>

      {recent.length > 0 ? (
        <div className={classes.recent}>
          <p className={classes.recentLabel}>Recent</p>
          <div className={classes.chips}>
            {recent.map((o) => (
              <button
                key={o.reference}
                className={classes.chip}
                type="button"
                onClick={() => navigate(`/tracking/${encodeURIComponent(o.reference)}`)}
              >
                {o.reference}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
