import { useId } from 'react';
import type { CustomField } from '@puckeditor/core';
import styles from '@/builder/editor/custom-fields/fields.module.css';

interface InputProps {
  label: string;
  id: string;
  value: unknown;
  onChange: (v: string) => void;
  readOnly?: boolean;
  maxLength: number;
  multiline: boolean;
}

/**
 * A text box that stops at the backend's limit (Puck's own text field has no `maxLength`), with a
 * running count. A stored value already over the limit still shows in full so it can be trimmed.
 */
function LimitedTextInput({ label, id, value, onChange, readOnly, maxLength, multiline }: InputProps) {
  const uid = useId();
  const countId = `${uid}-count`;
  const text = typeof value === 'string' ? value : '';
  const over = text.length > maxLength;
  const common = {
    id: `${uid}-input`,
    value: text,
    maxLength,
    readOnly,
    'aria-describedby': countId,
    'aria-invalid': over || undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className={styles.field} id={id}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor={common.id}>{label}</label>
        {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
        <p className={over ? styles.error : styles.hint} id={countId}>
          {over ? `${text.length} of ${maxLength} characters — shorten it to publish.` : `${text.length} of ${maxLength} characters`}
        </p>
      </div>
    </div>
  );
}

export function limitedTextField(label: string, maxLength: number, opts: { multiline?: boolean } = {}): CustomField<string> {
  return {
    type: 'custom',
    label,
    render: (p) => (
      <LimitedTextInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} maxLength={maxLength} multiline={opts.multiline ?? false} />
    ),
  };
}
