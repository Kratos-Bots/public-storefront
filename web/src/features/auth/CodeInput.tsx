import { forwardRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/auth/CodeInput.module.css';

export const CODE_LENGTH = 6;

/** The first six digits of whatever was typed, pasted or autofilled. */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the value reaches six digits (not again for further typing into a full box). */
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** The id of the message that explains what is wrong with the code (an error), read out with the box. */
  describedBy?: string;
}

/**
 * One input for the whole code, so a phone can autofill it from the message (`one-time-code`) and a paste
 * lands in one piece. No `maxLength`: the browser would cut "123 456" to "123 45" before we saw it; the value
 * is cleaned here instead. A paste replaces what was typed.
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { value, onChange, onComplete, disabled, invalid, describedBy },
  ref,
) {
  const { t } = useText();

  const accept = (raw: string) => {
    const next = digitsOf(raw);
    onChange(next);
    if (next.length === CODE_LENGTH && next !== value) onComplete(next);
  };

  return (
    <input
      ref={ref}
      className={classes.code}
      type="text"
      inputMode="numeric"
      name="code"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      enterKeyHint="go"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      aria-label={t('auth.code.enter.label')}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => accept(e.currentTarget.value)}
      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
        const pasted = digitsOf(e.clipboardData.getData('text'));
        if (!pasted) return;
        e.preventDefault();
        accept(pasted);
      }}
    />
  );
});
