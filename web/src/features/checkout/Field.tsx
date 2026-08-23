import { useId, type ReactNode } from 'react';
import classes from '@/features/checkout/Fields.module.css';

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
  type?: 'text' | 'email' | 'tel';
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
}

/** One text input, labelled and error-aware. */
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
  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {label}
        {optional ? <span className={classes.optional}>Optional</span> : null}
      </label>
      <input
        id={id}
        className={classes.input}
        type={type}
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
      {error ? (
        <span id={noteId} className={classes.error}>
          {error}
        </span>
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
        {optional ? <span className={classes.optional}>Optional</span> : null}
      </label>
      <span className={classes.selectWrap}>
        <select
          id={id}
          className={`${classes.input} ${classes.select}`}
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
        <span id={noteId} className={classes.error}>
          {error}
        </span>
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
}: TextareaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {label}
        {optional ? <span className={classes.optional}>Optional</span> : null}
      </label>
      <textarea
        id={id}
        className={`${classes.input} ${classes.textarea}`}
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
        <span id={noteId} className={classes.error}>
          {error}
        </span>
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
