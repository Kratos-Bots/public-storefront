import { useId, useState, type ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/features/checkout/Fields.module.css';
import { useText } from '@/text/runtime.tsx';

/** The "Optional" chip beside a field label. */
function OptionalTag() {
  const { t } = useText();
  return <span className={classes.optional}>{t('checkout.field.optional')}</span>;
}

/** A field's error: a registered key (set by the checkout page) resolves; anything else (zod's resolved text, a backend message) shows as is. */
function ErrorNote({ id, error }: { id: string; error: string }) {
  const { msg } = useText();
  return (
    <span id={id} className={classes.error}>
      {msg(error)}
    </span>
  );
}

interface CommonProps {
  /** Names the control. Also set as `aria-label` so the visible "Optional" chip
   *  stays out of the accessible name. */
  label: string;
  error?: string;
  /** Marks the field optional in the label — the shop's contactModes decide this. */
  optional?: boolean;
  hint?: string;
}

export interface FieldProps extends CommonProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'password';
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
}

/** The eye that reveals a password; slashed while the text is showing. */
function EyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <svg className={classes.eye} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden focusable="false">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 22 12z" />
      <circle cx="12" cy="12" r="2.75" />
      {revealed ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}

/** One text input, labelled and error-aware. A password field carries a show/hide toggle on the same input. */
export function Field({
  label,
  value,
  onChange,
  error,
  optional,
  hint,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  placeholder,
}: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const { t } = useText();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const input = (
      <input
        id={id}
        className={isPassword ? `${classes.input} ${classes.hasToggle}` : classes.input}
        data-sf-part="input"
        type={isPassword && revealed ? 'text' : type}
        autoCapitalize={isPassword ? 'off' : undefined}
        autoCorrect={isPassword ? 'off' : undefined}
        spellCheck={isPassword ? false : undefined}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
      />
  );
  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {label}
        {optional ? <OptionalTag /> : null}
      </label>
      {isPassword ? (
        <span className={classes.control}>
          {input}
          <button
            type="button"
            className={classes.toggle}
            data-sf-part="button"
            data-variant="default"
            aria-pressed={revealed}
            aria-label={t(revealed ? 'auth.password.hide' : 'auth.password.show')}
            onClick={() => setRevealed((r) => !r)}
          >
            <EyeIcon revealed={revealed} />
          </button>
        </span>
      ) : (
        input
      )}
      {error ? (
        <ErrorNote id={noteId} error={error} />
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps extends CommonProps {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  /** Shorter text for the visible label; `label` still names the control. Use it
   *  where the full name would wrap a narrow column ("Code" over a dial-code picker). */
  labelText?: string;
  children: ReactNode;
}

/** A native select — a phone's own wheel beats any listbox we could draw. */
export function SelectField({
  label,
  value,
  onChange,
  error,
  optional,
  hint,
  autoComplete,
  labelText,
  children,
}: SelectFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {labelText ?? label}
        {optional ? <OptionalTag /> : null}
      </label>
      <span className={classes.selectWrap}>
        <select
          id={id}
          className={`${classes.input} ${classes.select}`}
          data-sf-part="input"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          autoComplete={autoComplete}
        >
          {children}
        </select>
        <span className={classes.caret} aria-hidden />
      </span>
      {error ? (
        <ErrorNote id={noteId} error={error} />
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TextareaFieldProps extends CommonProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  rootAttrs?: StyleAttrs;
}

export function TextareaField({
  label,
  value,
  onChange,
  error,
  optional,
  hint,
  maxLength,
  placeholder,
  rows = 3,
  rootAttrs,
}: TextareaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={classes.field} {...rootAttrs}>
      <label className={classes.label} htmlFor={id}>
        {label}
        {optional ? <OptionalTag /> : null}
      </label>
      <textarea
        id={id}
        className={`${classes.input} ${classes.textarea}`}
        data-sf-part="input"
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        maxLength={maxLength}
        placeholder={placeholder}
      />
      {error ? (
        <ErrorNote id={noteId} error={error} />
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
