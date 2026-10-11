import { useId, useRef, useState } from 'react';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/reviews/Stars.module.css';

export const MAX_STARS = 5;
const STARS = [1, 2, 3, 4, 5] as const;

/** One star, drawn: sharp points read in every template, and the accent token fills it. */
function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg className={classes.glyph} data-filled={filled ? 'true' : 'false'} viewBox="0 0 24 24" width="28" height="28" aria-hidden focusable="false">
      <path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4 6 20.7l1.3-6.6-4.9-4.6 6.7-.8z" strokeLinejoin="round" />
    </svg>
  );
}

/** A rating shown, not chosen: five stars with the first `value` filled, named for assistive technology. */
export function StarsReadOnly({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const { tp } = useText();
  const rounded = Math.max(0, Math.min(MAX_STARS, Math.round(value)));
  return (
    <span className={classes.row} data-size={size} role="img" aria-label={tp('reviews.stars.outOf', rounded, { max: MAX_STARS })}>
      {STARS.map((n) => <StarGlyph key={n} filled={n <= rounded} />)}
    </span>
  );
}

export interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
  /** The group's visible name. */
  label: string;
  disabled?: boolean;
  /** Lets the page move focus to the group (the `?review=1` link). */
  groupRef?: React.Ref<HTMLDivElement>;
}

/**
 * A real radio group: five native radios, so the arrow keys, Tab and screen readers behave as the platform
 * does, with the stars drawn on the labels. Focus shows on the star, hover previews one on a pointer device.
 */
export function StarPicker({ value, onChange, label, disabled, groupRef }: StarPickerProps) {
  const { tp } = useText();
  const name = useId();
  const [hover, setHover] = useState(0);
  const local = useRef<HTMLDivElement>(null);
  const shown = hover || value;
  return (
    <div
      ref={(el) => {
        local.current = el;
        if (typeof groupRef === 'function') groupRef(el);
        else if (groupRef) (groupRef as React.RefObject<HTMLDivElement | null>).current = el;
      }}
      className={classes.picker}
      role="radiogroup"
      aria-label={label}
      onPointerLeave={() => setHover(0)}
    >
      {STARS.map((n) => (
        <span key={n} className={classes.choice} onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !disabled) setHover(n); }}>
          <input
            className={classes.input}
            type="radio"
            name={name}
            id={`${name}-${n}`}
            value={n}
            checked={value === n}
            disabled={disabled}
            onChange={() => onChange(n)}
          />
          <label className={classes.label} htmlFor={`${name}-${n}`}>
            <StarGlyph filled={n <= shown} />
            <span className={classes.srOnly}>{tp('reviews.stars.count', n)}</span>
          </label>
        </span>
      ))}
    </div>
  );
}

/** Five filled stars as decoration only (the reminder dialog): hidden from assistive technology. */
export function StarsDecor() {
  return (
    <span className={classes.row} aria-hidden>
      {STARS.map((n) => <StarGlyph key={n} filled />)}
    </span>
  );
}
